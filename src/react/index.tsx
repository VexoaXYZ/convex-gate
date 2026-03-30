import type { ReactNode } from "react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ConvexProviderWithAuth } from "convex/react";
import type { ConvexReactClient } from "convex/react";
import type { BetterAuthClientPlugin } from "better-auth";
import type { createAuthClient } from "better-auth/react";
import type { ConvexGateClient } from "../client/index.js";
import type { convexClient } from "../plugins/convex/client.js";
import type { crossDomainClient } from "../plugins/crossDomain/client.js";

const ConvexGateContext = createContext<ConvexGateClient | null>(null);

export function ConvexGateProvider({
  client,
  children,
}: {
  client: ConvexGateClient;
  children: ReactNode;
}) {
  return (
    <ConvexGateContext.Provider value={client}>
      {children}
    </ConvexGateContext.Provider>
  );
}

export function useConvexGate(): ConvexGateClient {
  const client = useContext(ConvexGateContext);
  if (!client) {
    throw new Error("useConvexGate must be used within a ConvexGateProvider.");
  }
  return client;
}

type CrossDomainClient = ReturnType<typeof crossDomainClient>;
type ConvexClientPlugin = ReturnType<typeof convexClient>;
type PluginList =
  | (CrossDomainClient | ConvexClientPlugin | BetterAuthClientPlugin)[]
  | (ConvexClientPlugin | BetterAuthClientPlugin)[];
type AuthClient = ReturnType<
  typeof createAuthClient<
    BetterAuthClientPlugin & {
      plugins: PluginList;
    }
  >
>;

type ConvexAuthClient = {
  setAuth(fetchToken: (args?: { forceRefreshToken?: boolean }) => Promise<string | null>): void;
  clearAuth(): void;
};

type AuthSessionData = {
  session?: {
    id?: string;
    token?: string | null;
  } | null;
} | null;

type ConvexTokenResponse = {
  data?: {
    token?: string | null;
  } | null;
} | null;

type CrossDomainVerifyResponse = {
  data?: {
    session?: {
      id?: string;
      token?: string | null;
    } | null;
  } | null;
  session?: {
    id?: string;
    token?: string | null;
  } | null;
} | null;

type SessionFetchResponse = {
  data?: AuthSessionData;
} | null;

type BetterAuthSessionClient = AuthClient & {
  useSession(): { data: AuthSessionData; isPending: boolean };
  getSession(options?: {
    fetchOptions?: {
      headers?: Record<string, string>;
    };
  }): Promise<SessionFetchResponse | unknown>;
};

type ConvexPluginMethods = {
  convex: {
    getToken(options: { fetchOptions: { throw: false } }): Promise<ConvexTokenResponse>;
  };
};


function isDebugEnabled() {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem("convex-gate-debug") === "1";
  } catch {
    return false;
  }
}

function pushDebugEvent(event: string, data?: unknown) {
  if (!isDebugEnabled() || typeof window === "undefined") {
    return;
  }
  const target = window as Window & {
    __CONVEX_GATE_DEBUG__?: Array<{
      at: string;
      event: string;
      data?: unknown;
    }>;
  };
  target.__CONVEX_GATE_DEBUG__ ??= [];
  target.__CONVEX_GATE_DEBUG__.push({
    at: new Date().toISOString(),
    event,
    data,
  });
  console.debug("[convex-gate]", event, data);
}

function extractSessionData(result: unknown): AuthSessionData {
  if (!result || typeof result !== "object" || !("data" in result)) {
    return null;
  }
  const data = (result as { data?: AuthSessionData }).data;
  return data ?? null;
}

function extractVerifySession(result: CrossDomainVerifyResponse) {
  if (!result || typeof result !== "object") {
    return null;
  }
  if ("data" in result && result.data?.session) {
    return result.data.session;
  }
  if ("session" in result && result.session) {
    return result.session;
  }
  return null;
}

function tryCall(fn: unknown) {
  if (typeof fn === "function") {
    try {
      fn();
    } catch {
      // best-effort
    }
  }
}

async function waitForSession(
  sessionClient: BetterAuthSessionClient,
  updateSession: unknown,
  sessionToken?: string | null
) {
  // First try with explicit Bearer token if available
  if (sessionToken) {
    const result = await sessionClient.getSession({
      fetchOptions: {
        headers: { Authorization: `Bearer ${sessionToken}` },
      },
    });
    const data = extractSessionData(result);
    pushDebugEvent("ott:get-session:bearer", { session: data });
    if (data?.session) {
      return result;
    }
  }

  // Poll with increasing backoff — the cross-domain fetch plugin's onSuccess
  // hook stores the session cookie in localStorage asynchronously, so the
  // cookie may not be available on the very first attempt.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 150));
    }
    tryCall(updateSession);
    const result = await sessionClient.getSession();
    const data = extractSessionData(result);
    pushDebugEvent("ott:get-session:attempt", { attempt, session: data });
    if (data?.session) {
      return result;
    }
  }

  return null;
}

export function getTokenExpiry(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof decoded.exp === "number" ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string, now: number = Date.now()): boolean {
  const exp = getTokenExpiry(token);
  if (!exp) return true; // Unparseable — force refresh to be safe
  return now >= exp - 30_000; // Treat as expired 30s before actual expiry
}

function useUseAuthFromBetterAuth(authClient: AuthClient, initialToken?: string | null) {
  const tokenRef = useRef<string | null>(initialToken ?? null);
  const pendingRef = useRef<Promise<string | null> | null>(null);
  const authClientRef = useRef(authClient);
  const sessionIdRef = useRef<string | null>(null);
  authClientRef.current = authClient;

  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  // Single stable fetchAccessToken — never changes reference.
  const fetchAccessToken = useMemo(
    () =>
      async ({ forceRefreshToken = false }: { forceRefreshToken?: boolean } = {}): Promise<string | null> => {
        // Check cached token — but not if expired
        if (tokenRef.current && !forceRefreshToken && !isTokenExpired(tokenRef.current)) {
          return tokenRef.current;
        }
        if (pendingRef.current) {
          return pendingRef.current;
        }
        pendingRef.current = (authClientRef.current as AuthClient & ConvexPluginMethods).convex
          .getToken({ fetchOptions: { throw: false } })
          .then((result) => {
            const token = result?.data?.token ?? null;
            if (tokenRef.current !== token) {
              tokenRef.current = token;
              rerender();
            }
            return token;
          })
          .catch(() => {
            if (tokenRef.current !== null) {
              tokenRef.current = null;
              rerender();
            }
            return null;
          })
          .finally(() => {
            pendingRef.current = null;
          });
        return pendingRef.current;
      },
    [] // truly stable — zero deps
  );

  // Stable hook factory — only depends on authClient (for useSession)
  return useMemo(
    () =>
      function useAuthFromBetterAuth() {
        const { data: session, isPending } = (authClient as BetterAuthSessionClient).useSession();
        const nextSessionId =
          typeof session?.session?.id === "string" ? session.session.id : null;

        // Clear token on sign-out
        useEffect(() => {
          if (!session && !isPending && tokenRef.current) {
            tokenRef.current = null;
            rerender();
          }
        }, [session, isPending]);

        // Session changes should invalidate the cached token so the next fetch
        // uses the current session state.
        useEffect(() => {
          if (sessionIdRef.current === null) {
            sessionIdRef.current = nextSessionId;
            return;
          }
          if (sessionIdRef.current !== nextSessionId) {
            sessionIdRef.current = nextSessionId;
            if (tokenRef.current) {
              tokenRef.current = null;
              rerender();
            }
          }
        }, [nextSessionId]);

        // Derive auth state from session + token.
        // fetchAccessToken is always the same reference.
        const isAuthenticated = Boolean(session?.session) || tokenRef.current !== null;
        const isLoading = isPending && !tokenRef.current;

        return useMemo(
          () => ({ isLoading, isAuthenticated, fetchAccessToken }),
          [isLoading, isAuthenticated]
        );
      },
    [authClient, fetchAccessToken]
  );
}

export function ConvexBetterAuthProvider({
  children,
  client,
  authClient,
  initialToken,
}: {
  children: ReactNode;
  client: ConvexReactClient & ConvexAuthClient;
  authClient: AuthClient;
  initialToken?: string | null;
}) {
  const useBetterAuth = useUseAuthFromBetterAuth(authClient, initialToken);

  useEffect(() => {
    void (async () => {
      if (typeof window === "undefined" || !window.location?.href) {
        return;
      }
      const url = new URL(window.location.href);
      const token = url.searchParams.get("ott");
      if (!token) {
        return;
      }
      // Always strip the OTT immediately so it is never retried on refresh.
      pushDebugEvent("ott:found", { token, href: window.location.href });
      url.searchParams.delete("ott");
      window.history.replaceState({}, "", url);

      // Resolve cross-domain helpers — go through the Proxy get-trap, never
      // use the `in` operator (fails on Better Auth's Proxy target).
      const cd = (authClient as any).crossDomain;
      const updateSession =
        (authClient as any).updateSession ?? cd?.updateSession;
      const sessionClient = authClient as BetterAuthSessionClient;

      try {
        // Fail closed when the client has cross-domain CSRF support but no
        // verifier is available for this OTT exchange.
        const consumeVerifier = cd?.consumeOttVerifier;
        if (typeof consumeVerifier === "function") {
          const verifier = consumeVerifier();
          if (!verifier) {
            pushDebugEvent("ott:error", {
              message: "OTT verifier missing; rejecting token exchange",
            });
            return;
          }
        }

        // Resolve the verify method through Better Auth's Proxy chain.
        const verifyFn =
          cd?.oneTimeToken?.verify ?? cd?.verifyOneTimeToken;
        if (typeof verifyFn !== "function") {
          pushDebugEvent("ott:error", {
            message: "Cross-domain client missing OTT verify method",
          });
          return;
        }

        // Exchange the OTT for a session.
        const verifyResult = await verifyFn({ token });
        pushDebugEvent("ott:verify:response", verifyResult);

        // Check for explicit error in the response.
        if (
          verifyResult &&
          typeof verifyResult === "object" &&
          "error" in verifyResult &&
          verifyResult.error
        ) {
          pushDebugEvent("ott:error", {
            message: `OTT verify rejected: ${
              typeof verifyResult.error === "object" && verifyResult.error !== null && "message" in verifyResult.error
                ? (verifyResult.error as { message: string }).message
                : JSON.stringify(verifyResult.error)
            }`,
          });
          // Still try to establish a session — the cookie may have been set
          // even when the JSON body contains an error.
        }

        const verifiedSession = extractVerifySession(verifyResult);
        const sessionToken = verifiedSession?.token ?? null;

        // Notify Better Auth to pick up the new session cookie.
        tryCall(updateSession);

        // Establish session — try Bearer first, then poll.
        const sessionResult = await waitForSession(
          sessionClient,
          updateSession,
          sessionToken
        );
        const sessionData = extractSessionData(sessionResult);

        if (sessionData?.session) {
          tryCall(updateSession);
          pushDebugEvent("ott:complete", {
            session: sessionData.session,
            href: url.toString(),
          });
          return;
        }

        // Fallback: the verify call itself returned session data even though
        // getSession couldn't find it yet — trust the verify response.
        if (verifiedSession) {
          tryCall(updateSession);
          pushDebugEvent("ott:complete", {
            session: verifiedSession,
            href: url.toString(),
            recoveredVia: "verify",
          });
          return;
        }

        pushDebugEvent("ott:session-missing", {
          verifyResult,
          sessionResult,
        });
      } catch (error) {
        pushDebugEvent("ott:error", {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  }, [authClient]);

  return (
    <ConvexProviderWithAuth client={client} useAuth={useBetterAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}
