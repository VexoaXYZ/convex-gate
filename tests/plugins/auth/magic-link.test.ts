import { describe, expect, it } from "vitest";
import { setup, createTestUser, createTestSession } from "../../helpers/mock-db.js";

describe("plugin: magic-link", () => {
  it("stores magic link token in verification table", async () => {
    const { api } = setup();
    const token = "ml-token-" + Math.random().toString(36).slice(2, 18);

    await api.crud.create("verification", {
      id: "ml-store-1",
      identifier: "magic-link:alice@example.com",
      value: token,
      expiresAt: Date.now() + 300000, // 5 minutes
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const found = await api.crud.findOne("verification", [
      { field: "id", value: "ml-store-1" },
    ]);
    expect(found).not.toBeNull();
    expect(found!.value).toBe(token);
    expect(found!.identifier).toBe("magic-link:alice@example.com");
  });

  it("finds verification by value (token)", async () => {
    const { api } = setup();
    const tokenA = "magic-token-aaa111";
    const tokenB = "magic-token-bbb222";

    await api.crud.create("verification", {
      id: "ml-val-1",
      identifier: "magic-link:a@example.com",
      value: tokenA,
      expiresAt: Date.now() + 300000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await api.crud.create("verification", {
      id: "ml-val-2",
      identifier: "magic-link:b@example.com",
      value: tokenB,
      expiresAt: Date.now() + 300000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const found = await api.crud.findOne("verification", [
      { field: "value", value: tokenA },
    ]);
    expect(found).not.toBeNull();
    expect(found!.identifier).toBe("magic-link:a@example.com");

    const foundB = await api.crud.findOne("verification", [
      { field: "value", value: tokenB },
    ]);
    expect(foundB).not.toBeNull();
    expect(foundB!.identifier).toBe("magic-link:b@example.com");
  });

  it("finds verification by identifier", async () => {
    const { api } = setup();
    await api.crud.create("verification", {
      id: "ml-ident-1",
      identifier: "magic-link:lookup@example.com",
      value: "lookup-token-xyz",
      expiresAt: Date.now() + 300000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const found = await api.crud.findOne("verification", [
      { field: "identifier", value: "magic-link:lookup@example.com" },
    ]);
    expect(found).not.toBeNull();
    expect(found!.value).toBe("lookup-token-xyz");
  });

  it("deletes expired verifications", async () => {
    const { api } = setup();
    const pastTime = Date.now() - 600000; // 10 minutes ago

    await api.crud.create("verification", {
      id: "ml-expired-1",
      identifier: "magic-link:expired1@example.com",
      value: "expired-token-1",
      expiresAt: pastTime,
      createdAt: pastTime - 300000,
      updatedAt: pastTime - 300000,
    });
    await api.crud.create("verification", {
      id: "ml-expired-2",
      identifier: "magic-link:expired2@example.com",
      value: "expired-token-2",
      expiresAt: pastTime - 100000,
      createdAt: pastTime - 400000,
      updatedAt: pastTime - 400000,
    });

    // Delete both expired records
    await api.crud.deleteOne({
      model: "verification",
      where: [{ field: "id", value: "ml-expired-1" }],
    });
    await api.crud.deleteOne({
      model: "verification",
      where: [{ field: "id", value: "ml-expired-2" }],
    });

    const found1 = await api.crud.findOne("verification", [
      { field: "id", value: "ml-expired-1" },
    ]);
    const found2 = await api.crud.findOne("verification", [
      { field: "id", value: "ml-expired-2" },
    ]);
    expect(found1).toBeNull();
    expect(found2).toBeNull();
  });

  it("multiple pending magic links for different emails", async () => {
    const { api } = setup();
    const emails = [
      "alice@example.com",
      "bob@example.com",
      "charlie@example.com",
      "diana@example.com",
    ];

    for (let i = 0; i < emails.length; i++) {
      await api.crud.create("verification", {
        id: `ml-multi-${i}`,
        identifier: `magic-link:${emails[i]}`,
        value: `multi-token-${i}`,
        expiresAt: Date.now() + 300000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    // Each email's magic link should be independently retrievable
    for (let i = 0; i < emails.length; i++) {
      const found = await api.crud.findOne("verification", [
        { field: "identifier", value: `magic-link:${emails[i]}` },
      ]);
      expect(found).not.toBeNull();
      expect(found!.value).toBe(`multi-token-${i}`);
    }

    // Total verification records should match
    const all = await api.crud.findMany("verification", [], { limit: 100 });
    expect(all).toHaveLength(emails.length);
  });

  it("consuming a magic link deletes the verification and creates a session", async () => {
    const { api } = setup();
    const user = await createTestUser(api, {
      id: "ml-consume-user",
      email: "consume@example.com",
    });

    await api.crud.create("verification", {
      id: "ml-consume",
      identifier: "magic-link:consume@example.com",
      value: "consume-token",
      expiresAt: Date.now() + 300000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Simulate consuming: find token, delete it, create session
    const verification = await api.crud.findOne("verification", [
      { field: "value", value: "consume-token" },
    ]);
    expect(verification).not.toBeNull();

    await api.crud.deleteOne({
      model: "verification",
      where: [{ field: "id", value: "ml-consume" }],
    });

    const session = await createTestSession(api, user.id as string);
    expect(session.userId).toBe("ml-consume-user");

    // Verification should be gone
    const gone = await api.crud.findOne("verification", [
      { field: "value", value: "consume-token" },
    ]);
    expect(gone).toBeNull();
  });
});
