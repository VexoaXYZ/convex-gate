import type { BetterAuthPlugin, Session, User } from "better-auth";
import { createAuthEndpoint, createAuthMiddleware, sessionMiddleware } from "better-auth/api";
import { bearer as bearerPlugin } from "better-auth/plugins/bearer";
import { jwt as jwtPlugin } from "better-auth/plugins/jwt";
import type { JwtOptions, Jwk } from "better-auth/plugins/jwt";
import { oidcProvider as oidcProviderPlugin } from "better-auth/plugins/oidc-provider";
import type { BetterAuthOptions } from "better-auth/minimal";
import type { AuthConfig, AuthProvider } from "convex/server";
import { parseJwks } from "../../authConfig.js";

export const JWT_COOKIE_NAME = "convex_jwt";

interface CachedToken {
  token: string;
  expiresAt: number; // timestamp ms
}

type DefinedProperties<T extends object> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K];
} & {
  [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<T[K], undefined>;
};

function omitUndefined<T extends object>(value: T): DefinedProperties<T> {
  const entries = Object.entries(value).filter(([, entryValue]) => entryValue !== undefined);
  return Object.fromEntries(entries) as DefinedProperties<T>;
}

function createTokenCache() {
  const cache = new Map<string, CachedToken>();

  return {
    get(sessionId: string): string | null {
      const entry = cache.get(sessionId);
      if (!entry) return null;
      // Expired or within 30s of expiry — don't serve stale
      if (Date.now() >= entry.expiresAt - 30_000) {
        cache.delete(sessionId);
        return null;
      }
      return entry.token;
    },
    set(sessionId: string, token: string, ttlSeconds: number) {
      cache.set(sessionId, {
        token,
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
    },
    invalidate(sessionId: string) {
      cache.delete(sessionId);
    },
    invalidateAll() {
      cache.clear();
    },
  };
}

function omit<T extends Record<string, unknown>, K extends keyof T>(
  value: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...value } as Record<string, unknown>;
  for (const key of keys) {
    delete result[key as string];
  }
  return result as Omit<T, K>;
}

function getJwksAlg(authProvider: AuthProvider) {
  const isCustomJwt = "type" in authProvider && authProvider.type === "customJwt";
  if (isCustomJwt && authProvider.algorithm !== "RS256") {
    throw new Error("Only RS256 is supported for Convex custom JWT providers.");
  }
  return isCustomJwt ? authProvider.algorithm : "RS256";
}

function parseAuthConfig(authConfig: AuthConfig, opts: { jwks?: string }) {
  const provider = authConfig.providers.find(
    (candidate) => candidate.applicationID === "convex"
  );
  if (!provider) {
    throw new Error(
      "No Convex auth provider found. Add getAuthConfigProvider() to convex/auth.config.ts."
    );
  }
  if (!("type" in provider) || provider.type !== "customJwt") {
    return provider;
  }
  const isDataUriJwks = provider.jwks?.startsWith("data:text/");
  if (isDataUriJwks && !opts.jwks) {
    throw new Error("Static JWKS detected in auth config, but no JWKS was passed to convex().");
  }
  return provider;
}

export function convex(opts: {
  authConfig: AuthConfig;
  jwt?: {
    expirationSeconds?: number;
    definePayload?: (session: {
      user: User & Record<string, unknown>;
      session: Session & Record<string, unknown>;
    }) => Promise<Record<string, unknown>> | Record<string, unknown> | undefined;
  };
  jwtExpirationSeconds?: number;
  jwks?: string;
  jwksRotateOnTokenGenerationError?: boolean;
  options?: BetterAuthOptions;
}) {
  const jwtExpirationSeconds =
    opts.jwt?.expirationSeconds ?? opts.jwtExpirationSeconds ?? 60 * 15;
  const oidcProvider = oidcProviderPlugin({
    loginPage: "/not-used",
    metadata: {
      issuer: `${process.env.CONVEX_SITE_URL}`,
      jwks_uri: `${process.env.CONVEX_SITE_URL}${opts.options?.basePath ?? "/api/auth"}/convex/jwks`,
    },
  });
  const providerConfig = parseAuthConfig(opts.authConfig, opts);
  const jwtOptions = {
    jwt: {
      issuer: `${process.env.CONVEX_SITE_URL}`,
      audience: "convex",
      expirationTime: `${jwtExpirationSeconds}s`,
      definePayload: ({ user, session }) => ({
        ...(opts.jwt?.definePayload
          ? opts.jwt.definePayload({ user, session })
          : omit(user, ["id", "image"])),
        sessionId: session.id,
        iat: Math.floor(Date.now() / 1000),
      }),
    },
    jwks: {
      keyPairConfig: {
        alg: getJwksAlg(providerConfig),
      },
    },
  } satisfies JwtOptions;
  let staticJwks: Jwk[] | undefined;
  if (opts.jwks) {
    try {
      staticJwks = parseJwks(opts.jwks, "convex() plugin").map((keySet) => ({
        kid: keySet.id,
        alg: keySet.alg ?? "RS256",
        crv: keySet.crv,
        ...JSON.parse(keySet.publicKey),
      })) as Jwk[];
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "parse failed";
      throw new Error(
        `[convex-gate] Invalid JWKS JSON passed to convex() plugin: ${message}`
      );
    }
  }
  const jwt = jwtPlugin({
    ...jwtOptions,
    adapter: {
      createJwk: async (webKey, ctx) => {
        if (opts.jwks) {
          throw new Error("Cannot create JWKs when static JWKS is configured.");
        }
        return await ctx.context.adapter.create<Omit<Jwk, "id">, Jwk>({
          model: "jwks",
          data: {
            ...webKey,
            createdAt: new Date(),
          },
        });
      },
      getJwks: async (ctx) => {
        if (staticJwks) {
          return staticJwks;
        }
        const keys = await ctx.context.adapter.findMany<Jwk>({
          model: "jwks",
          sortBy: {
            field: "createdAt",
            direction: "desc",
          },
        });
        return keys.map((key) => ({
          ...key,
          createdAt: new Date(key.createdAt),
          ...(key.expiresAt ? { expiresAt: new Date(key.expiresAt) } : {}),
        }));
      },
    },
  });
  const jwtEndpoints = jwt.endpoints;
  const oidcEndpoints = oidcProvider.endpoints;
  const bearer = bearerPlugin();
  // Cache TTL = half the JWT expiration, so tokens are always usable for at least half their lifetime
  const cacheTtl = Math.floor(jwtExpirationSeconds / 2);
  const tokenCache = createTokenCache();

  return {
    id: "convex",
    schema: jwt.schema,
    hooks: {
      before: [...bearer.hooks.before],
      after: [
        ...oidcProvider.hooks.after,
        {
          matcher: (ctx) =>
            Boolean(
              ctx.path?.startsWith("/sign-in") ||
                ctx.path?.startsWith("/sign-up") ||
                ctx.path?.startsWith("/callback") ||
                ctx.path?.startsWith("/oauth2/callback") ||
                ctx.path?.startsWith("/magic-link/verify") ||
                ctx.path?.startsWith("/update-session") ||
                (ctx.path?.startsWith("/get-session") && ctx.context.session)
            ),
          handler: createAuthMiddleware(async (ctx) => {
            const originalSession = ctx.context.session;
            try {
              ctx.context.session = ctx.context.session ?? ctx.context.newSession;
              const { token } = await jwtEndpoints.getToken(omitUndefined({
                ...ctx,
                headers: {},
                method: "GET" as const,
                returnHeaders: false,
                returnStatus: false,
              }));
              const jwtCookie = ctx.context.createAuthCookie(JWT_COOKIE_NAME, {
                maxAge: jwtExpirationSeconds,
              });
              ctx.setCookie(jwtCookie.name, token, jwtCookie.attributes);
            } catch {
              //
            }
            ctx.context.session = originalSession;
          }),
        },
        {
          matcher: (ctx) =>
            Boolean(
              ctx.path?.startsWith("/sign-out") ||
                ctx.path?.startsWith("/delete-user") ||
                (ctx.path?.startsWith("/get-session") && !ctx.context.session)
            ),
          handler: createAuthMiddleware(async (ctx) => {
            // Invalidate cached token for this session
            const sessionId = ctx.context.session?.session?.id;
            if (sessionId) {
              tokenCache.invalidate(sessionId);
            }
            const jwtCookie = ctx.context.createAuthCookie(JWT_COOKIE_NAME, {
              maxAge: 0,
            });
            ctx.setCookie(jwtCookie.name, "", jwtCookie.attributes);
          }),
        },
      ],
    },
    endpoints: {
      getOpenIdConfig: createAuthEndpoint(
        "/convex/.well-known/openid-configuration",
        { method: "GET", metadata: { isAction: false } },
        async (ctx) =>
          await oidcEndpoints.getOpenIdConfig(omitUndefined({
            ...ctx,
            returnHeaders: false,
            returnStatus: false,
          }))
      ),
      getJwks: createAuthEndpoint(
        "/convex/jwks",
        { method: "GET" },
        async (ctx) =>
          await jwtEndpoints.getJwks(omitUndefined({
            ...ctx,
            returnHeaders: false,
            returnStatus: false,
          }))
      ),
      getToken: createAuthEndpoint(
        "/convex/get-token",
        {
          method: "GET",
          requireHeaders: true,
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const sessionId = ctx.context.session?.session?.id;

          // Serve from cache if available
          if (sessionId) {
            const cached = tokenCache.get(sessionId);
            if (cached) {
              const jwtCookie = ctx.context.createAuthCookie(JWT_COOKIE_NAME, {
                maxAge: jwtExpirationSeconds,
              });
              ctx.setCookie(jwtCookie.name, cached, jwtCookie.attributes);
              return { token: cached };
            }
          }

          const runEndpoint = async () => {
            const response = await jwtEndpoints.getToken(omitUndefined({
              ...ctx,
              method: "GET" as const,
              returnHeaders: false,
              returnStatus: false,
            }));
            // Cache the generated token
            if (sessionId && response.token) {
              tokenCache.set(sessionId, response.token, cacheTtl);
            }
            const jwtCookie = ctx.context.createAuthCookie(JWT_COOKIE_NAME, {
              maxAge: jwtExpirationSeconds,
            });
            ctx.setCookie(jwtCookie.name, response.token, jwtCookie.attributes);
            return response;
          };
          try {
            return await runEndpoint();
          } catch (error: unknown) {
            if (
              !opts.jwks &&
              typeof error === "object" &&
              error !== null &&
              "code" in error &&
              error.code === "ERR_JOSE_NOT_SUPPORTED"
            ) {
              if (opts.jwksRotateOnTokenGenerationError ?? true) {
                await ctx.context.adapter.deleteMany({
                  model: "jwks",
                  where: [],
                });
                return await runEndpoint();
              }
            }
            throw error;
          }
        }
      ),
    },
  } satisfies BetterAuthPlugin;
}
