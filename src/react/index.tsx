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
      token?: string | null;
    } | null;
  } | null;
} | null;

type BetterAuthSessionClient = AuthClient & {
  useSession(): { data: AuthSessionData; isPending: boolean };
  getSession(options?: {
    fetchOptions?: {
      headers?: Record<string, string>;
    };
  }): Promise<unknown>;
};

type ConvexPluginMethods = {
  convex: {
    getToken(options: { fetchOptions: { throw: false } }): Promise<ConvexTokenResponse>;
  };
};

type CrossDomainPluginMethods = {
  crossDomain: {
    verifyOneTimeToken(args: { token: string }): Promise<CrossDomainVerifyResponse>;
  };
  updateSession?(): void;
};

function hasCrossDomainClient(
  client: AuthClient,
): client is AuthClient & CrossDomainPluginMethods {
  return "crossDomain" in client;
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
  if (!exp) return false; // Can't determine — assume valid
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
      if (!token || !hasCrossDomainClient(authClient)) {
        return;
      }
      url.searchParams.delete("ott");
      window.history.replaceState({}, "", url);
      const crossDomainAuthClient = authClient;
      const result = await crossDomainAuthClient.crossDomain.verifyOneTimeToken({
        token,
      });
      const session = result?.data?.session;
      if (session?.token) {
        await (authClient as BetterAuthSessionClient).getSession({
          fetchOptions: {
            headers: {
              Authorization: `Bearer ${session.token}`,
            },
          },
        });
        crossDomainAuthClient.updateSession?.();
      }
    })();
  }, [authClient]);

  return (
    <ConvexProviderWithAuth client={client} useAuth={useBetterAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}
