import { describe, expect, it } from "vitest";
import { getAuthConfigProvider, createPublicJwks, parseJwks } from "../src/authConfig.js";

const VALID_JWKS_DOC = [
  {
    id: "key-1",
    publicKey: JSON.stringify({ kty: "RSA", n: "test-n", e: "AQAB" }),
    privateKey: JSON.stringify({ kty: "RSA", n: "test-n", e: "AQAB", d: "test-d" }),
    createdAt: Date.now(),
  },
];

const VALID_JWKS_STRING = JSON.stringify(VALID_JWKS_DOC);

describe("parseJwks", () => {
  it("parses valid JWKS JSON array", () => {
    const result = parseJwks(VALID_JWKS_STRING, "test");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("key-1");
    expect(result[0].publicKey).toContain("RSA");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseJwks("not-json", "test")).toThrow("Invalid JWKS JSON");
  });

  it("throws if not an array", () => {
    expect(() => parseJwks(JSON.stringify({ key: "value" }), "test")).toThrow(
      "expected an array"
    );
  });

  it("throws if entry is not an object", () => {
    expect(() => parseJwks(JSON.stringify(["string"]), "test")).toThrow(
      "each entry must be an object"
    );
  });

  it("throws if entry missing required fields", () => {
    expect(() =>
      parseJwks(JSON.stringify([{ id: "key-1" }]), "test")
    ).toThrow("'id', 'publicKey', and 'privateKey'");
  });

  it("accepts multiple keys", () => {
    const multi = [
      ...VALID_JWKS_DOC,
      {
        id: "key-2",
        publicKey: JSON.stringify({ kty: "RSA", n: "test-n2", e: "AQAB" }),
        privateKey: JSON.stringify({ kty: "RSA", n: "test-n2", e: "AQAB", d: "test-d2" }),
        createdAt: Date.now(),
      },
    ];
    const result = parseJwks(JSON.stringify(multi), "test");
    expect(result).toHaveLength(2);
  });
});

describe("createPublicJwks", () => {
  it("maps key docs to public JWK set with kid and alg", () => {
    const result = createPublicJwks(VALID_JWKS_DOC);
    expect(result.keys).toHaveLength(1);
    expect(result.keys[0].kid).toBe("key-1");
    expect(result.keys[0].alg).toBe("RS256");
    expect(result.keys[0].kty).toBe("RSA");
    expect(result.keys[0].n).toBe("test-n");
    // Should NOT contain private key material
    expect(result.keys[0]).not.toHaveProperty("d");
  });

  it("uses custom alg if provided", () => {
    const docs = [{ ...VALID_JWKS_DOC[0], alg: "ES256" }];
    const result = createPublicJwks(docs);
    expect(result.keys[0].alg).toBe("ES256");
  });

  it("includes crv if provided", () => {
    const docs = [{ ...VALID_JWKS_DOC[0], crv: "P-256" }];
    const result = createPublicJwks(docs);
    expect(result.keys[0].crv).toBe("P-256");
  });
});

describe("getAuthConfigProvider", () => {
  it("returns dynamic JWKS endpoint when no jwks option", () => {
    const provider = getAuthConfigProvider();
    expect(provider.type).toBe("customJwt");
    expect(provider.applicationID).toBe("convex");
    expect(provider.algorithm).toBe("RS256");
    expect(typeof provider.jwks).toBe("string");
    expect(provider.jwks).toContain("/convex/jwks");
  });

  it("returns dynamic JWKS endpoint with custom basePath", () => {
    const provider = getAuthConfigProvider({ basePath: "/auth" });
    expect(provider.jwks).toContain("/auth/convex/jwks");
  });

  it("returns data URI when static jwks provided", () => {
    const provider = getAuthConfigProvider({ jwks: VALID_JWKS_STRING });
    expect(typeof provider.jwks).toBe("string");
    expect(provider.jwks).toMatch(/^data:text\/plain;charset=utf-8;base64,/);
  });

  it("data URI decodes to valid public JWKS", () => {
    const provider = getAuthConfigProvider({ jwks: VALID_JWKS_STRING });
    const jwksUri = provider.jwks as string;
    const base64 = jwksUri.split("base64,")[1];
    const decoded = JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));
    expect(decoded.keys).toHaveLength(1);
    expect(decoded.keys[0].kid).toBe("key-1");
    expect(decoded.keys[0].kty).toBe("RSA");
    // No private key material in public JWKS
    expect(decoded.keys[0]).not.toHaveProperty("d");
  });

  it("throws on malformed jwks string", () => {
    expect(() => getAuthConfigProvider({ jwks: "bad-json" })).toThrow(
      "[convex-gate] Invalid JWKS JSON"
    );
  });

  it("throws if jwks is not an array", () => {
    expect(() => getAuthConfigProvider({ jwks: '{"not":"array"}' })).toThrow(
      "expected an array"
    );
  });
});
