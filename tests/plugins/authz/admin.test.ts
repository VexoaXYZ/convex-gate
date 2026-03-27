import { describe, expect, it } from "vitest";
import { setup, createTestUser, createTestSession } from "../../helpers/mock-db.js";

describe("plugin: admin — CRUD compatibility", () => {
  it("creates a user with role field set to 'admin'", async () => {
    const { api } = setup();
    const user = await createTestUser(api, {
      role: "admin",
      banned: false,
      banReason: null,
      banExpires: null,
    });
    expect(user.role).toBe("admin");
    expect(user.banned).toBe(false);
    expect(user.banReason).toBeNull();
    expect(user.banExpires).toBeNull();
  });

  it("creates a user with role field set to 'user'", async () => {
    const { api } = setup();
    const user = await createTestUser(api, {
      email: "regular@example.com",
      role: "user",
      banned: false,
      banReason: null,
      banExpires: null,
    });
    expect(user.role).toBe("user");
  });

  it("bans a user with reason and expiry timestamp", async () => {
    const { api } = setup();
    const user = await createTestUser(api, {
      id: "ban-target",
      email: "bad-actor@example.com",
      role: "user",
      banned: false,
      banReason: null,
      banExpires: null,
    });

    const banExpires = Date.now() + 7 * 86400000; // 7 days
    const updated = await api.crud.updateOne({
      model: "user",
      where: [{ field: "id", value: "ban-target" }],
      update: {
        banned: true,
        banReason: "Repeated spam violations",
        banExpires,
        updatedAt: Date.now(),
      },
    });

    expect(updated).not.toBeNull();
    expect(updated!.banned).toBe(true);
    expect(updated!.banReason).toBe("Repeated spam violations");
    expect(updated!.banExpires).toBe(banExpires);
  });

  it("unbans a user by clearing ban fields", async () => {
    const { api } = setup();
    const banExpires = Date.now() + 86400000;
    await createTestUser(api, {
      id: "unban-target",
      email: "reformed@example.com",
      role: "user",
      banned: true,
      banReason: "spam",
      banExpires,
    });

    const updated = await api.crud.updateOne({
      model: "user",
      where: [{ field: "id", value: "unban-target" }],
      update: {
        banned: false,
        banReason: null,
        banExpires: null,
        updatedAt: Date.now(),
      },
    });

    expect(updated).not.toBeNull();
    expect(updated!.banned).toBe(false);
    expect(updated!.banReason).toBeNull();
    expect(updated!.banExpires).toBeNull();
  });

  it("creates a session with impersonatedBy field for admin impersonation", async () => {
    const { api } = setup();
    await createTestUser(api, { id: "admin-user", email: "admin@example.com", role: "admin" });
    await createTestUser(api, { id: "target-user", email: "target@example.com", role: "user" });

    const session = await createTestSession(api, "target-user", {
      impersonatedBy: "admin-user",
    });

    expect(session.impersonatedBy).toBe("admin-user");
    expect(session.userId).toBe("target-user");

    const found = await api.crud.findOne("session", [{ field: "id", value: session.id as string }]);
    expect(found).not.toBeNull();
    expect(found!.impersonatedBy).toBe("admin-user");
  });

  it("lists banned users via findMany where clause", async () => {
    const { api } = setup();
    await createTestUser(api, { id: "banned-1", email: "b1@example.com", banned: true, banReason: "spam" });
    await createTestUser(api, { id: "banned-2", email: "b2@example.com", banned: true, banReason: "abuse" });
    await createTestUser(api, { id: "good-user", email: "good@example.com", banned: false });

    const bannedUsers = await api.crud.findMany(
      "user",
      [{ field: "banned", value: true }],
      { limit: 100 },
    );

    expect(bannedUsers).toHaveLength(2);
    expect(bannedUsers.every((u) => u.banned === true)).toBe(true);
  });

  it("handles ban expiry timestamp comparison", async () => {
    const { api } = setup();
    const now = Date.now();
    await createTestUser(api, {
      id: "temp-ban-expired",
      email: "expired-ban@example.com",
      banned: true,
      banReason: "temp ban",
      banExpires: now - 3600000, // expired 1 hour ago
    });
    await createTestUser(api, {
      id: "temp-ban-active",
      email: "active-ban@example.com",
      banned: true,
      banReason: "temp ban",
      banExpires: now + 86400000, // expires tomorrow
    });
    await createTestUser(api, {
      id: "perma-ban",
      email: "perma@example.com",
      banned: true,
      banReason: "permanent",
      banExpires: null,
    });

    // Verify we can retrieve and check expiry timestamps
    const expiredBan = await api.crud.findOne("user", [{ field: "id", value: "temp-ban-expired" }]);
    expect(expiredBan).not.toBeNull();
    expect(typeof expiredBan!.banExpires).toBe("number");
    expect((expiredBan!.banExpires as number) < now).toBe(true);

    const activeBan = await api.crud.findOne("user", [{ field: "id", value: "temp-ban-active" }]);
    expect(activeBan).not.toBeNull();
    expect((activeBan!.banExpires as number) > now).toBe(true);

    const permaBan = await api.crud.findOne("user", [{ field: "id", value: "perma-ban" }]);
    expect(permaBan).not.toBeNull();
    expect(permaBan!.banExpires).toBeNull();
  });

  it("updates user role from 'user' to 'admin'", async () => {
    const { api } = setup();
    await createTestUser(api, {
      id: "promote-target",
      email: "promote@example.com",
      role: "user",
    });

    const updated = await api.crud.updateOne({
      model: "user",
      where: [{ field: "id", value: "promote-target" }],
      update: { role: "admin", updatedAt: Date.now() },
    });

    expect(updated).not.toBeNull();
    expect(updated!.role).toBe("admin");

    // Verify persistence
    const found = await api.crud.findOne("user", [{ field: "id", value: "promote-target" }]);
    expect(found!.role).toBe("admin");
  });
});
