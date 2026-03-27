import type { AuthProvider } from "convex/server";
import type { AuthDocumentByName } from "./component/schema.js";

export type JwksDoc = Pick<
  AuthDocumentByName<"jwks">,
  "publicKey" | "privateKey" | "createdAt" | "expiresAt"
> & {
  id: string;
  alg?: string;
  crv?: string;
};

export function createPublicJwks(jwks: JwksDoc[]) {
  return {
    keys: jwks.map((keySet) => ({
      alg: keySet.alg ?? "RS256",
      crv: keySet.crv,
      ...JSON.parse(keySet.publicKey),
      kid: keySet.id,
    })),
  };
}

function parseJwks(raw: string, context: string): JwksDoc[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`[convex-gate] Invalid JWKS JSON in ${context}: expected a valid JSON string.`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`[convex-gate] Invalid JWKS in ${context}: expected an array of key objects.`);
  }
  for (const key of parsed) {
    if (!key || typeof key !== "object") {
      throw new Error(`[convex-gate] Invalid JWKS in ${context}: each entry must be an object.`);
    }
    if (typeof key.id !== "string" || typeof key.publicKey !== "string" || typeof key.privateKey !== "string") {
      throw new Error(
        `[convex-gate] Invalid JWKS in ${context}: each key must have 'id', 'publicKey', and 'privateKey' as strings.`
      );
    }
  }
  return parsed as JwksDoc[];
}

export { parseJwks };

export function getAuthConfigProvider(opts?: {
  basePath?: string;
  jwks?: string;
}): AuthProvider {
  const parsedJwks = opts?.jwks ? parseJwks(opts.jwks, "getAuthConfigProvider()") : undefined;
  return {
    type: "customJwt",
    issuer: `${process.env.CONVEX_SITE_URL}`,
    applicationID: "convex",
    algorithm: "RS256",
    jwks: parsedJwks
      ? `data:text/plain;charset=utf-8;base64,${Buffer.from(
          JSON.stringify(createPublicJwks(parsedJwks))
        ).toString("base64")}`
      : `${process.env.CONVEX_SITE_URL}${opts?.basePath ?? "/api/auth"}/convex/jwks`,
  };
}
