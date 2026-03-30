import type { BetterAuthClientPlugin, ClientStore } from "better-auth";
import type { BetterFetchOption } from "@better-fetch/fetch";
import type { crossDomain } from "./index.js";

interface CookieAttributes {
  value: string;
  expires?: Date;
  "max-age"?: number;
}

interface StoredCookie {
  value: string;
  expires: string | null;
}

function splitSetCookieHeader(header: string): string[] {
  const cookies: string[] = [];
  let start = 0;

  for (let i = 0; i < header.length; i += 1) {
    if (header[i] === "," && /^\s*[!#$%&'*+\-.^_`|~0-9A-Za-z]+=/.test(header.slice(i + 1))) {
      cookies.push(header.slice(start, i).trim());
      start = i + 1;
    }
  }

  const lastCookie = header.slice(start).trim();
  if (lastCookie) {
    cookies.push(lastCookie);
  }

  return cookies;
}

export function parseSetCookieHeader(header: string): Map<string, CookieAttributes> {
  const cookieMap = new Map<string, CookieAttributes>();
  for (const cookie of splitSetCookieHeader(header)) {
    const [nameValue, ...attributes] = cookie.split("; ");
    if (!nameValue) {
      continue;
    }
    const [name, value] = nameValue.split("=");
    if (!name) {
      continue;
    }
    const cookieObj: CookieAttributes = { value: value ?? "" };
    for (const attr of attributes) {
      const [attrName, attrValue] = attr.split("=");
      if (!attrName || attrValue === undefined) {
        continue;
      }
      cookieObj[attrName.toLowerCase() as "value"] = attrValue;
    }
    cookieMap.set(name, cookieObj);
  }
  return cookieMap;
}

export function getSetCookie(header: string, prevCookie?: string) {
  const parsed = parseSetCookieHeader(header);
  let toSetCookie: Record<string, StoredCookie> = {};
  parsed.forEach((cookie, key) => {
    const expiresAt = cookie.expires;
    const maxAge = cookie["max-age"];
    const expires = expiresAt
      ? new Date(String(expiresAt))
      : maxAge
        ? new Date(Date.now() + Number(maxAge) * 1000)
        : null;
    toSetCookie[key] = {
      value: cookie.value,
      expires: expires ? expires.toISOString() : null,
    };
  });
  if (prevCookie) {
    try {
      toSetCookie = {
        ...(JSON.parse(prevCookie) as Record<string, StoredCookie>),
        ...toSetCookie,
      };
    } catch {
      //
    }
  }
  return JSON.stringify(toSetCookie);
}

export function getCookie(cookie: string) {
  let parsed = {} as Record<string, StoredCookie>;
  try {
    parsed = JSON.parse(cookie) as Record<string, StoredCookie>;
  } catch {
    //
  }
  const pairs = Object.entries(parsed).flatMap(([key, value]) => {
    if (value.expires && new Date(value.expires) < new Date()) {
      return [];
    }
    return [`${key}=${value.value}`];
  });
  return pairs.join("; ");
}

export function crossDomainClient(
  opts: {
    storage?: {
      setItem: (key: string, value: string) => void;
      getItem: (key: string) => string | null;
    };
    storagePrefix?: string;
    disableCache?: boolean;
  } = {}
) {
  let store: ClientStore | null = null;
  const prefix = opts.storagePrefix || "better-auth";
  const cookieName = `${prefix}_cookie`;
  const localCacheName = `${prefix}_session_data`;
  const ottVerifierKey = `${prefix}_ott_verifier`;
  const storage =
    opts.storage || (typeof window !== "undefined" ? localStorage : undefined);

  return {
    id: "cross-domain",
    $InferServerPlugin: {} as ReturnType<typeof crossDomain>,
    getActions($fetch, $store) {
      store = $store;
      const getCookieAction = () =>
        getCookie(storage?.getItem(cookieName) || "{}");
      const updateSessionAction = () => {
        $store.notify("$sessionSignal");
      };
      return {
        // Top-level for backwards compat (waitForSession, etc.)
        getCookie: getCookieAction,
        updateSession: updateSessionAction,
        // Nested under `crossDomain` so Better Auth's Proxy resolves the full
        // path chain: authClient.crossDomain.oneTimeToken.verify(…)
        crossDomain: {
          getCookie: getCookieAction,
          updateSession: updateSessionAction,
          consumeOttVerifier: () => {
            if (!storage) return null;
            const verifier = storage.getItem(ottVerifierKey);
            if (verifier) storage.setItem(ottVerifierKey, "");
            return verifier;
          },
          oneTimeToken: {
            verify: async ({ token }: { token: string }) => {
              return $fetch("/cross-domain/one-time-token/verify", {
                method: "POST",
                body: { token },
              });
            },
          },
        },
      };
    },
    fetchPlugins: [
      {
        id: "cross-domain",
        name: "Cross Domain",
        hooks: {
          async onSuccess(context) {
            if (!storage) {
              return;
            }
            const setCookie = context.response.headers.get("set-better-auth-cookie");
            if (setCookie) {
              const prevCookie = storage.getItem(cookieName);
              storage.setItem(
                cookieName,
                getSetCookie(setCookie, prevCookie ?? undefined)
              );
              if (setCookie.includes("session_token")) {
                store?.notify("$sessionSignal");
              }
            }
            if (
              context.request.url.toString().includes("/get-session") &&
              !opts.disableCache
            ) {
              storage.setItem(localCacheName, JSON.stringify(context.data));
              storage.setItem(
                `${localCacheName}_exp`,
                String(Date.now() + 5 * 60 * 1000)
              );
            }
          },
        },
        async init(url, options) {
          if (!storage) {
            return {
              url,
              options: options as BetterFetchOption,
            };
          }
          options = options || {};
          options.credentials = "omit";
          options.headers = {
            ...options.headers,
            "Better-Auth-Cookie": getCookie(storage.getItem(cookieName) || "{}"),
          };
          // Set a CSRF verifier before any auth flow that can result in an
          // OTT redirect (social OAuth, magic-link, email-OTP verify, etc.).
          if (
            url.includes("/sign-in/social") ||
            url.includes("/sign-in/oauth") ||
            url.includes("/magic-link/") ||
            url.includes("/email-otp/") ||
            url.includes("/verify-email")
          ) {
            const verifier = Math.random().toString(36).slice(2) +
              Math.random().toString(36).slice(2);
            storage.setItem(ottVerifierKey, verifier);
          }
          // Evict expired session cache
          const cacheExp = storage.getItem(`${localCacheName}_exp`);
          if (cacheExp && Date.now() >= Number(cacheExp)) {
            storage.setItem(localCacheName, "{}");
            storage.setItem(`${localCacheName}_exp`, "");
          }
          if (url.includes("/sign-out")) {
            storage.setItem(cookieName, "{}");
            storage.setItem(localCacheName, "{}");
            storage.setItem(`${localCacheName}_exp`, "");
          }
          return {
            url,
            options: options as BetterFetchOption,
          };
        },
      },
    ],
  } satisfies BetterAuthClientPlugin;
}
