import type { BetterAuthOptions } from "better-auth";

export type TrustedOriginsOption = BetterAuthOptions["trustedOrigins"];

export function requireActionCtx<T>(ctx: T): T {
  return ctx;
}
