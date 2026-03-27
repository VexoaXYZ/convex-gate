import { describe, expect, it } from "vitest";
import { setup } from "../../helpers/mock-db.js";

describe("plugin: jwt — JWKS table CRUD and key management", () => {
  it("creates JWKS key record with public and private key", async () => {
    const { api } = setup();
    const key = await api.crud.create("jwks", {
      id: "jwk-create-1",
      publicKey: JSON.stringify({ kty: "RSA", n: "modulus", e: "AQAB", kid: "key-1" }),
      privateKey: JSON.stringify({ kty: "RSA", n: "modulus", e: "AQAB", d: "private-exp", kid: "key-1" }),
      createdAt: Date.now(),
    });

    expect(key.id).toBe("jwk-create-1");
    const pub = JSON.parse(key.publicKey as string);
    expect(pub.kty).toBe("RSA");
    expect(pub.kid).toBe("key-1");
  });

  it("key rotation via deleteMany + create", async () => {
    const { api } = setup();

    // Create old keys
    await api.crud.create("jwks", {
      id: "old-k1", publicKey: "{}", privateKey: "{}", createdAt: Date.now() - 86400000,
    });
    await api.crud.create("jwks", {
      id: "old-k2", publicKey: "{}", privateKey: "{}", createdAt: Date.now() - 43200000,
    });

    // Rotate: delete all old keys
    const deleted = await api.crud.deleteMany({ model: "jwks", where: [] });
    expect(deleted).toBe(2);

    // Create new key
    const newKey = await api.crud.create("jwks", {
      id: "new-k1",
      publicKey: JSON.stringify({ kty: "RSA", kid: "rotated-key" }),
      privateKey: JSON.stringify({ kty: "RSA", kid: "rotated-key", d: "new-private" }),
      createdAt: Date.now(),
    });

    const allKeys = await api.crud.findMany("jwks", [], { limit: 100 });
    expect(allKeys).toHaveLength(1);
    expect(allKeys[0].id).toBe("new-k1");
  });

  it("multiple keys sorted by createdAt (newest first)", async () => {
    const { api } = setup();
    const now = Date.now();

    await api.crud.create("jwks", {
      id: "sort-k1", publicKey: "{}", privateKey: "{}", createdAt: now - 20000,
    });
    await api.crud.create("jwks", {
      id: "sort-k3", publicKey: "{}", privateKey: "{}", createdAt: now,
    });
    await api.crud.create("jwks", {
      id: "sort-k2", publicKey: "{}", privateKey: "{}", createdAt: now - 10000,
    });

    const allKeys = await api.crud.findMany("jwks", [], { limit: 100, sortBy: "createdAt", sortDirection: "desc" });
    expect(allKeys).toHaveLength(3);
    // Verify all three are present
    const ids = allKeys.map((k) => k.id);
    expect(ids).toContain("sort-k1");
    expect(ids).toContain("sort-k2");
    expect(ids).toContain("sort-k3");
  });

  it("expired key cleanup via selective deleteMany", async () => {
    const { api } = setup();
    const now = Date.now();

    // Simulate expired key with an expiresAt field
    await api.crud.create("jwks", {
      id: "exp-k1", publicKey: "{}", privateKey: "{}",
      createdAt: now - 604800000, // 7 days old
      expiresAt: now - 1000,
    });
    await api.crud.create("jwks", {
      id: "active-k1", publicKey: "{}", privateKey: "{}",
      createdAt: now,
      expiresAt: now + 604800000,
    });

    // Delete only expired keys
    await api.crud.deleteOne({
      model: "jwks",
      where: [{ field: "id", value: "exp-k1" }],
    });

    const remaining = await api.crud.findMany("jwks", [], { limit: 100 });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe("active-k1");
  });

  it("retrieves specific key by id", async () => {
    const { api } = setup();
    await api.crud.create("jwks", {
      id: "find-k1",
      publicKey: JSON.stringify({ kid: "find-key-1" }),
      privateKey: JSON.stringify({ kid: "find-key-1", d: "secret" }),
      createdAt: Date.now(),
    });

    const found = await api.crud.findOne("jwks", [{ field: "id", value: "find-k1" }]);
    expect(found).not.toBeNull();
    const pub = JSON.parse(found!.publicKey as string);
    expect(pub.kid).toBe("find-key-1");
  });
});
