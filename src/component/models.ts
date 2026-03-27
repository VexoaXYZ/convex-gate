export const CORE_AUTH_MODELS = [
  "user",
  "session",
  "account",
  "verification",
] as const;

export const EXTENDED_AUTH_MODELS = [
  "rateLimit",
  "twoFactor",
  "oauthApplication",
  "oauthAccessToken",
  "oauthConsent",
  "jwks",
] as const;

export const AUTH_COMPONENT_MODELS = [
  ...CORE_AUTH_MODELS,
  ...EXTENDED_AUTH_MODELS,
] as const;

export type CoreAuthModel = (typeof CORE_AUTH_MODELS)[number];
export type ExtendedAuthModel = (typeof EXTENDED_AUTH_MODELS)[number];
export type AuthComponentModel = (typeof AUTH_COMPONENT_MODELS)[number];
