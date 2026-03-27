import { describe, expect, it } from "vitest";
import { setup, createTestUser } from "../../helpers/mock-db.js";

describe("plugin: api-key — CRUD compatibility", () => {
  it("creates an apiKey record with all required fields", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "ak-user-1" });

    const apiKey = await api.crud.create("apiKey", {
      id: "ak-1",
      userId: user.id,
      key: "sk_live_abc123def456",
      name: "Production API Key",
      expiresAt: Date.now() + 365 * 86400000,
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(apiKey.userId).toBe("ak-user-1");
    expect(apiKey.key).toBe("sk_live_abc123def456");
    expect(apiKey.name).toBe("Production API Key");
    expect(apiKey.enabled).toBe(true);
  });

  it("finds an API key by its key value", async () => {
    const { api } = setup();
    await createTestUser(api, { id: "ak-user-2" });

    await api.crud.create("apiKey", {
      id: "ak-2",
      userId: "ak-user-2",
      key: "sk_test_unique_lookup_key",
      name: "Test Key",
      expiresAt: Date.now() + 86400000,
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const found = await api.crud.findOne("apiKey", [
      { field: "key", value: "sk_test_unique_lookup_key" },
    ]);

    expect(found).not.toBeNull();
    expect(found!.userId).toBe("ak-user-2");
    expect(found!.name).toBe("Test Key");
  });

  it("disables an API key by setting enabled to false", async () => {
    const { api } = setup();
    await createTestUser(api, { id: "ak-user-3" });

    await api.crud.create("apiKey", {
      id: "ak-disable",
      userId: "ak-user-3",
      key: "sk_live_disable_me",
      name: "Key To Disable",
      expiresAt: Date.now() + 86400000,
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const updated = await api.crud.updateOne({
      model: "apiKey",
      where: [{ field: "id", value: "ak-disable" }],
      update: { enabled: false, updatedAt: Date.now() },
    });

    expect(updated).not.toBeNull();
    expect(updated!.enabled).toBe(false);

    // Verify persistence
    const found = await api.crud.findOne("apiKey", [{ field: "id", value: "ak-disable" }]);
    expect(found!.enabled).toBe(false);
  });

  it("deletes expired API keys", async () => {
    const { api } = setup();
    const now = Date.now();
    await createTestUser(api, { id: "ak-user-exp" });

    // Create an expired key
    await api.crud.create("apiKey", {
      id: "ak-expired-1",
      userId: "ak-user-exp",
      key: "sk_expired_1",
      name: "Expired Key 1",
      expiresAt: now - 86400000, // expired yesterday
      enabled: true,
      createdAt: now - 2 * 86400000,
      updatedAt: now - 2 * 86400000,
    });

    // Create another expired key
    await api.crud.create("apiKey", {
      id: "ak-expired-2",
      userId: "ak-user-exp",
      key: "sk_expired_2",
      name: "Expired Key 2",
      expiresAt: now - 3600000, // expired 1 hour ago
      enabled: true,
      createdAt: now - 86400000,
      updatedAt: now - 86400000,
    });

    // Create a valid key
    await api.crud.create("apiKey", {
      id: "ak-valid",
      userId: "ak-user-exp",
      key: "sk_valid",
      name: "Valid Key",
      expiresAt: now + 86400000, // expires tomorrow
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });

    // Delete expired keys one by one (simulating a cleanup job)
    await api.crud.deleteOne({
      model: "apiKey",
      where: [{ field: "id", value: "ak-expired-1" }],
    });
    await api.crud.deleteOne({
      model: "apiKey",
      where: [{ field: "id", value: "ak-expired-2" }],
    });

    // Verify only the valid key remains
    const remaining = await api.crud.findMany("apiKey", [], { limit: 100 });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].key).toBe("sk_valid");
  });

  it("supports multiple API keys per user", async () => {
    const { api } = setup();
    await createTestUser(api, { id: "ak-multi-user" });

    const keyNames = ["Development", "Staging", "Production"];
    for (let i = 0; i < keyNames.length; i++) {
      await api.crud.create("apiKey", {
        id: `ak-multi-${i}`,
        userId: "ak-multi-user",
        key: `sk_${keyNames[i]!.toLowerCase()}_${i}`,
        name: keyNames[i],
        expiresAt: Date.now() + 86400000 * (i + 1),
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    const userKeys = await api.crud.findMany(
      "apiKey",
      [{ field: "userId", value: "ak-multi-user" }],
      { limit: 100 },
    );

    expect(userKeys).toHaveLength(3);
    const names = userKeys.map((k) => k.name);
    expect(names).toContain("Development");
    expect(names).toContain("Staging");
    expect(names).toContain("Production");
  });

  it("counts active (enabled) API keys for a user", async () => {
    const { api } = setup();
    await createTestUser(api, { id: "ak-count-user" });

    await api.crud.create("apiKey", {
      id: "ak-count-1",
      userId: "ak-count-user",
      key: "sk_count_1",
      name: "Active 1",
      expiresAt: Date.now() + 86400000,
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await api.crud.create("apiKey", {
      id: "ak-count-2",
      userId: "ak-count-user",
      key: "sk_count_2",
      name: "Active 2",
      expiresAt: Date.now() + 86400000,
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await api.crud.create("apiKey", {
      id: "ak-count-3",
      userId: "ak-count-user",
      key: "sk_count_3",
      name: "Disabled",
      expiresAt: Date.now() + 86400000,
      enabled: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const totalCount = await api.crud.count("apiKey", [
      { field: "userId", value: "ak-count-user" },
    ]);
    expect(totalCount).toBe(3);

    const activeCount = await api.crud.count("apiKey", [
      { field: "userId", value: "ak-count-user" },
      { field: "enabled", value: true },
    ]);
    expect(activeCount).toBe(2);
  });

  it("creates an API key with no expiry (null expiresAt)", async () => {
    const { api } = setup();
    await createTestUser(api, { id: "ak-no-exp" });

    const apiKey = await api.crud.create("apiKey", {
      id: "ak-no-expiry",
      userId: "ak-no-exp",
      key: "sk_live_never_expires",
      name: "Permanent Key",
      expiresAt: null,
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(apiKey.expiresAt).toBeNull();

    const found = await api.crud.findOne("apiKey", [{ field: "id", value: "ak-no-expiry" }]);
    expect(found).not.toBeNull();
    expect(found!.expiresAt).toBeNull();
  });
});
