import type { BetterAuthPlugin } from "better-auth";
import { setSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import { createAuthEndpoint, createAuthMiddleware } from "better-auth/api";
import { oneTimeToken as oneTimeTokenPlugin } from "better-auth/plugins/one-time-token";
import { z } from "zod";

type DefinedProperties<T extends object> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K];
} & {
  [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<T[K], undefined>;
};

function omitUndefined<T extends object>(value: T): DefinedProperties<T> {
  const entries = Object.entries(value).filter(([, entryValue]) => entryValue !== undefined);
  return Object.fromEntries(entries) as DefinedProperties<T>;
}

export function crossDomain({ siteUrl }: { siteUrl: string }) {
  const oneTimeToken = oneTimeTokenPlugin();

  const rewriteCallbackURL = (callbackURL?: string) => {
    if (!callbackURL || !callbackURL.startsWith("/")) {
      return callbackURL;
    }
    return new URL(callbackURL, siteUrl).toString();
  };

  return {
    id: "cross-domain",
    init() {
      return {
        options: {
          trustedOrigins: [siteUrl],
        },
        context: {
          oauthConfig: {
            storeStateStrategy: "database",
            skipStateCookieCheck: true,
          },
        },
      };
    },
    hooks: {
      before: [
        {
          matcher(ctx) {
            return Boolean(
              ctx.request?.headers.has("better-auth-cookie") ||
                ctx.headers?.has("better-auth-cookie")
            );
          },
          handler: createAuthMiddleware(async (ctx) => {
            const existingHeaders = (ctx.request?.headers || ctx.headers) as Headers;
            const headers = new Headers({
              ...Object.fromEntries(existingHeaders.entries()),
            });
            if (!headers.get("authorization")) {
              const cookie = headers.get("better-auth-cookie");
              if (cookie) {
                headers.append("cookie", cookie);
              }
            }
            return {
              context: {
                headers,
              },
            };
          }),
        },
        {
          matcher: (ctx) => Boolean(ctx.method === "GET" && ctx.path?.startsWith("/verify-email")),
          handler: createAuthMiddleware(async (ctx) => {
            if (ctx.query?.callbackURL) {
              ctx.query.callbackURL = rewriteCallbackURL(ctx.query.callbackURL);
            }
            return { context: ctx };
          }),
        },
        {
          matcher: (ctx) => Boolean(ctx.method === "POST"),
          handler: createAuthMiddleware(async (ctx) => {
            if (ctx.body?.callbackURL) {
              ctx.body.callbackURL = rewriteCallbackURL(ctx.body.callbackURL);
            }
            if (ctx.body?.newUserCallbackURL) {
              ctx.body.newUserCallbackURL = rewriteCallbackURL(ctx.body.newUserCallbackURL);
            }
            if (ctx.body?.errorCallbackURL) {
              ctx.body.errorCallbackURL = rewriteCallbackURL(ctx.body.errorCallbackURL);
            }
            return { context: ctx };
          }),
        },
      ],
      after: [
        {
          matcher(ctx) {
            return Boolean(
              ctx.request?.headers.has("better-auth-cookie") ||
                ctx.headers?.has("better-auth-cookie")
            );
          },
          handler: createAuthMiddleware(async (ctx) => {
            const setCookie = ctx.context.responseHeaders?.get("set-cookie");
            if (setCookie) {
              ctx.context.responseHeaders?.delete("set-cookie");
              ctx.setHeader("Set-Better-Auth-Cookie", setCookie);
            }
          }),
        },
        {
          matcher: (ctx) =>
            Boolean(
              ctx.path?.startsWith("/callback") ||
                ctx.path?.startsWith("/oauth2/callback") ||
                ctx.path?.startsWith("/magic-link/verify")
            ),
          handler: createAuthMiddleware(async (ctx) => {
            const session = ctx.context.newSession;
            if (!session) {
              return;
            }
            const token = generateRandomString(32);
            const expiresAt = new Date(Date.now() + 3 * 60 * 1000);
            await ctx.context.internalAdapter.createVerificationValue({
              value: session.session.token,
              identifier: `one-time-token:${token}`,
              expiresAt,
            });
            const redirectTo = ctx.context.responseHeaders?.get("location");
            if (!redirectTo) {
              return;
            }
            const url = new URL(redirectTo);
            url.searchParams.set("ott", token);
            throw ctx.redirect(url.toString());
          }),
        },
      ],
    },
    endpoints: {
      verifyOneTimeToken: createAuthEndpoint(
        "/cross-domain/one-time-token/verify",
        {
          method: "POST",
          body: z.object({
            token: z.string(),
          }),
        },
        async (ctx) => {
          const response = await oneTimeToken.endpoints.verifyOneTimeToken(omitUndefined({
            ...ctx,
            returnHeaders: false,
            returnStatus: false,
          }));
          await setSessionCookie(ctx, response);
          return response;
        }
      ),
    },
  } satisfies BetterAuthPlugin;
}
