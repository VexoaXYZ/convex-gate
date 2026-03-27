import { describe, expect, it } from "vitest";
import { setup, createTestUser } from "../../helpers/mock-db.js";

describe("plugin: device-authorization — device code flow via verification table", () => {
  it("stores device code in verification table with required fields", async () => {
    const { api } = setup();
    const expiresAt = Date.now() + 600000;
    const deviceCode = await api.crud.create("verification", {
      id: "dev-code-1",
      identifier: "device-code:device-abc123",
      value: JSON.stringify({
        userCode: "ABCD-1234",
        deviceCode: "device-abc123",
        clientId: "cli-app",
        scope: "openid profile",
      }),
      expiresAt,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(deviceCode.identifier).toBe("device-code:device-abc123");
    const parsed = JSON.parse(deviceCode.value as string);
    expect(parsed.userCode).toBe("ABCD-1234");
    expect(parsed.deviceCode).toBe("device-abc123");
    expect(deviceCode.expiresAt).toBe(expiresAt);
  });

  it("polls for authorization status by device code identifier", async () => {
    const { api } = setup();
    await api.crud.create("verification", {
      id: "dev-poll-1",
      identifier: "device-code:poll-device-xyz",
      value: JSON.stringify({
        userCode: "WXYZ-9999",
        deviceCode: "poll-device-xyz",
        status: "pending",
      }),
      expiresAt: Date.now() + 600000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Poll: find the device code
    const found = await api.crud.findOne("verification", [
      { field: "identifier", value: "device-code:poll-device-xyz" },
    ]);
    expect(found).not.toBeNull();
    const data = JSON.parse(found!.value as string);
    expect(data.status).toBe("pending");
  });

  it("updates device code status when user authorizes", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "device-user" });

    await api.crud.create("verification", {
      id: "dev-auth-1",
      identifier: "device-code:auth-device-456",
      value: JSON.stringify({
        userCode: "AUTH-5678",
        deviceCode: "auth-device-456",
        status: "pending",
      }),
      expiresAt: Date.now() + 600000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // User authorizes the device code
    await api.crud.updateOne({
      model: "verification",
      where: [{ field: "identifier", value: "device-code:auth-device-456" }],
      update: {
        value: JSON.stringify({
          userCode: "AUTH-5678",
          deviceCode: "auth-device-456",
          status: "authorized",
          userId: user.id,
        }),
      },
    });

    const updated = await api.crud.findOne("verification", [
      { field: "identifier", value: "device-code:auth-device-456" },
    ]);
    const data = JSON.parse(updated!.value as string);
    expect(data.status).toBe("authorized");
    expect(data.userId).toBe("device-user");
  });

  it("deletes verification record after token grant", async () => {
    const { api } = setup();
    await api.crud.create("verification", {
      id: "dev-grant-1",
      identifier: "device-code:grant-device-789",
      value: JSON.stringify({
        deviceCode: "grant-device-789",
        status: "authorized",
        userId: "some-user",
      }),
      expiresAt: Date.now() + 600000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // After granting tokens, clean up the device code
    await api.crud.deleteOne({
      model: "verification",
      where: [{ field: "identifier", value: "device-code:grant-device-789" }],
    });

    const found = await api.crud.findOne("verification", [
      { field: "identifier", value: "device-code:grant-device-789" },
    ]);
    expect(found).toBeNull();
  });

  it("expired device codes are retrievable but identifiable as expired", async () => {
    const { api } = setup();
    const expiredAt = Date.now() - 1000;
    await api.crud.create("verification", {
      id: "dev-exp-1",
      identifier: "device-code:expired-device",
      value: JSON.stringify({
        deviceCode: "expired-device",
        userCode: "EXPR-0000",
        status: "pending",
      }),
      expiresAt: expiredAt,
      createdAt: Date.now() - 601000,
      updatedAt: Date.now() - 601000,
    });

    const found = await api.crud.findOne("verification", [
      { field: "identifier", value: "device-code:expired-device" },
    ]);
    expect(found).not.toBeNull();
    expect(found!.expiresAt).toBeLessThan(Date.now());
  });
});
