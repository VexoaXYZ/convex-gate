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

export function parseSetCookieHeader(header: string): Map<string, CookieAttributes> {
  const cookieMap = new Map<string, CookieAttributes>();
  for (const cookie of header.split(", ")) {
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
  return Object.entries(parsed).reduce((acc, [key, value]) => {
    if (value.expires && new Date(value.expires) < new Date()) {
      return acc;
    }
    return `${acc}; ${key}=${value.value}`;
  }, "");
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
  const cookieName = `${opts.storagePrefix || "better-auth"}_cookie`;
  const localCacheName = `${opts.storagePrefix || "better-auth"}_session_data`;
  const storage =
    opts.storage || (typeof window !== "undefined" ? localStorage : undefined);

  return {
    id: "cross-domain",
    $InferServerPlugin: {} as ReturnType<typeof crossDomain>,
    getActions(_, $store) {
      store = $store;
      return {
        getCookie: () => getCookie(storage?.getItem(cookieName) || "{}"),
        updateSession: () => {
          $store.notify("$sessionSignal");
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
          if (url.includes("/sign-out")) {
            storage.setItem(cookieName, "{}");
            storage.setItem(localCacheName, "{}");
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
