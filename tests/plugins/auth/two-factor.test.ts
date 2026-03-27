import { describe, expect, it } from "vitest";
import { setup, createTestUser, createTestSession } from "../../helpers/mock-db.js";

describe("plugin: two-factor", () => {
  it("creates twoFactor table record with userId, secret, and backupCodes", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "2fa-user-1" });

    const tf = await api.crud.create("twoFactor", {
      id: "2fa-1",
      userId: user.id,
      secret: "JBSWY3DPEHPK3PXP",
      backupCodes: "code1,code2,code3,code4,code5,code6,code7,code8",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(tf.userId).toBe("2fa-user-1");
    expect(tf.secret).toBe("JBSWY3DPEHPK3PXP");
    expect(tf.backupCodes).toBe("code1,code2,code3,code4,code5,code6,code7,code8");
  });

  it("adds twoFactorEnabled field to user model", async () => {
    const { api } = setup();
    const user = await createTestUser(api, {
      id: "2fa-user-enabled",
      twoFactorEnabled: true,
    });

    expect(user.twoFactorEnabled).toBe(true);

    const found = await api.crud.findOne("user", [
      { field: "id", value: "2fa-user-enabled" },
    ]);
    expect(found).not.toBeNull();
    expect(found!.twoFactorEnabled).toBe(true);
  });

  it("finds twoFactor record by userId", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "2fa-find-user" });

    await api.crud.create("twoFactor", {
      id: "2fa-find-1",
      userId: user.id,
      secret: "SECRETFIND123",
      backupCodes: "a1,b2,c3",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Create another user's 2FA to ensure filtering works
    await api.crud.create("twoFactor", {
      id: "2fa-find-other",
      userId: "other-user-id",
      secret: "OTHERSECRET",
      backupCodes: "x1,y2,z3",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const found = await api.crud.findOne("twoFactor", [
      { field: "userId", value: "2fa-find-user" },
    ]);
    expect(found).not.toBeNull();
    expect(found!.secret).toBe("SECRETFIND123");
    expect(found!.userId).toBe("2fa-find-user");
  });

  it("updates backupCodes after use", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "2fa-backup-user" });

    await api.crud.create("twoFactor", {
      id: "2fa-backup",
      userId: user.id,
      secret: "BACKUPSECRET",
      backupCodes: "code1,code2,code3,code4,code5",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Simulate using backup code1 — remove it from the list
    const updated = await api.crud.updateOne({
      model: "twoFactor",
      where: [{ field: "userId", value: "2fa-backup-user" }],
      update: {
        backupCodes: "code2,code3,code4,code5",
        updatedAt: Date.now(),
      },
    });

    expect(updated).not.toBeNull();
    expect(updated!.backupCodes).toBe("code2,code3,code4,code5");
    expect((updated!.backupCodes as string).split(",")).toHaveLength(4);
  });

  it("deletes twoFactor when user disables 2FA", async () => {
    const { api } = setup();
    const user = await createTestUser(api, {
      id: "2fa-disable-user",
      twoFactorEnabled: true,
    });

    await api.crud.create("twoFactor", {
      id: "2fa-disable",
      userId: user.id,
      secret: "DISABLESECRET",
      backupCodes: "a,b,c",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Delete the 2FA record
    await api.crud.deleteOne({
      model: "twoFactor",
      where: [{ field: "userId", value: "2fa-disable-user" }],
    });

    // Update user to reflect 2FA is disabled
    await api.crud.updateOne({
      model: "user",
      where: [{ field: "id", value: "2fa-disable-user" }],
      update: { twoFactorEnabled: false },
    });

    const tfRecord = await api.crud.findOne("twoFactor", [
      { field: "userId", value: "2fa-disable-user" },
    ]);
    expect(tfRecord).toBeNull();

    const updatedUser = await api.crud.findOne("user", [
      { field: "id", value: "2fa-disable-user" },
    ]);
    expect(updatedUser!.twoFactorEnabled).toBe(false);
  });

  it("user with twoFactorEnabled=true can be queried", async () => {
    const { api } = setup();

    await createTestUser(api, { id: "2fa-q-1", twoFactorEnabled: true, email: "2fa1@test.com" });
    await createTestUser(api, { id: "2fa-q-2", twoFactorEnabled: false, email: "2fa2@test.com" });
    await createTestUser(api, { id: "2fa-q-3", twoFactorEnabled: true, email: "2fa3@test.com" });

    const enabled = await api.crud.findMany(
      "user",
      [{ field: "twoFactorEnabled", value: true }],
      { limit: 100 },
    );
    expect(enabled).toHaveLength(2);
    expect(enabled.every((u) => u.twoFactorEnabled === true)).toBe(true);
  });
});
