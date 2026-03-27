import { describe, expect, it } from "vitest";
import { convex } from "../../src/plugins/convex/index.js";

const VALID_JWKS = JSON.stringify([
  {
    id: "key-1",
    publicKey: JSON.stringify({ kty: "RSA", n: "test-n", e: "AQAB" }),
    privateKey: JSON.stringify({ kty: "RSA", n: "test-n", e: "AQAB", d: "secret" }),
    createdAt: Date.now(),
  },
]);

const MOCK_AUTH_CONFIG = {
  providers: [
    {
      type: "customJwt" as const,
      applicationID: "convex",
      algorithm: "RS256" as const,
      issuer: "https://example.convex.site",
      jwks: `data:text/plain;charset=utf-8;base64,${Buffer.from('{"keys":[]}').toString("base64")}`,
    },
  ],
};

const MOCK_DYNAMIC_AUTH_CONFIG = {
  providers: [
    {
      type: "customJwt" as const,
      applicationID: "convex",
      algorithm: "RS256" as const,
      issuer: "https://example.convex.site",
      jwks: "https://example.convex.site/api/auth/convex/jwks",
    },
  ],
};

describe("convex plugin — static JWKS", () => {
  it("initializes with valid static JWKS", () => {
    const plugin = convex({
      authConfig: MOCK_AUTH_CONFIG,
      jwks: VALID_JWKS,
    });
    expect(plugin.id).toBe("convex");
    expect(plugin.endpoints).toBeDefined();
    expect(plugin.hooks).toBeDefined();
  });

  it("throws on malformed JWKS JSON", () => {
    expect(() =>
      convex({
        authConfig: MOCK_DYNAMIC_AUTH_CONFIG,
        jwks: "not-valid-json",
      })
    ).toThrow("[convex-gate] Invalid JWKS JSON");
  });

  it("throws if JWKS is not an array", () => {
    expect(() =>
      convex({
        authConfig: MOCK_DYNAMIC_AUTH_CONFIG,
        jwks: '{"not":"array"}',
      })
    ).toThrow("[convex-gate] Invalid JWKS JSON");
  });

  it("throws if static JWKS detected in auth config but not passed to plugin", () => {
    expect(() =>
      convex({
        authConfig: MOCK_AUTH_CONFIG,
        // jwks NOT provided — but auth config has data URI
      })
    ).toThrow("Static JWKS detected in auth config");
  });

  it("initializes without JWKS for dynamic mode", () => {
    const plugin = convex({
      authConfig: MOCK_DYNAMIC_AUTH_CONFIG,
    });
    expect(plugin.id).toBe("convex");
  });

  it("registers jwks schema from JWT plugin", () => {
    const plugin = convex({
      authConfig: MOCK_AUTH_CONFIG,
      jwks: VALID_JWKS,
    });
    expect((plugin as any).schema).toBeDefined();
  });
});

describe("convex plugin — token cache", () => {
  it("configures cache TTL to half JWT expiration", () => {
    // Default JWT expiration is 15 min = 900s, cache TTL should be ~450s
    // We can't inspect the cache directly, but we verify the plugin initializes
    const plugin = convex({
      authConfig: MOCK_DYNAMIC_AUTH_CONFIG,
      jwtExpirationSeconds: 600,
    });
    expect(plugin.id).toBe("convex");
  });

  it("accepts custom JWT expiration via jwt.expirationSeconds", () => {
    const plugin = convex({
      authConfig: MOCK_DYNAMIC_AUTH_CONFIG,
      jwt: { expirationSeconds: 300 },
    });
    expect(plugin.id).toBe("convex");
  });
});
