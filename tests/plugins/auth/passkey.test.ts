import { describe, expect, it } from "vitest";
import { setup, createTestUser, createTestSession } from "../../helpers/mock-db.js";

describe("plugin: passkey", () => {
  it("stores passkey challenge in verification table as JSON value", async () => {
    const { api } = setup();
    const challenge = {
      challenge: "dGVzdC1jaGFsbGVuZ2UtYnl0ZXM",
      rpId: "localhost",
      rpName: "Test App",
      userVerification: "preferred",
    };

    await api.crud.create("verification", {
      id: "pk-challenge-1",
      identifier: "passkey-challenge:user-1",
      value: JSON.stringify(challenge),
      expiresAt: Date.now() + 60000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const found = await api.crud.findOne("verification", [
      { field: "identifier", value: "passkey-challenge:user-1" },
    ]);
    expect(found).not.toBeNull();

    const parsed = JSON.parse(found!.value as string);
    expect(parsed.challenge).toBe("dGVzdC1jaGFsbGVuZ2UtYnl0ZXM");
    expect(parsed.rpId).toBe("localhost");
    expect(parsed.rpName).toBe("Test App");
    expect(parsed.userVerification).toBe("preferred");
  });

  it("stores passkey credential in account table with providerId='passkey'", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "pk-user-1" });

    await api.crud.create("account", {
      id: "pk-acct-1",
      userId: user.id,
      accountId: "cred-id-base64url-encoded",
      providerId: "passkey",
      publicKey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...",
      counter: 0,
      deviceType: "platform",
      transports: "internal",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const found = await api.crud.findOne("account", [
      { field: "providerId", value: "passkey" },
      { field: "userId", value: "pk-user-1" },
    ]);
    expect(found).not.toBeNull();
    expect(found!.publicKey).toBe("MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...");
    expect(found!.counter).toBe(0);
    expect(found!.deviceType).toBe("platform");
    expect(found!.transports).toBe("internal");
  });

  it("account has extra fields: publicKey, counter, deviceType, transports", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "pk-fields-user" });

    const account = await api.crud.create("account", {
      id: "pk-fields-acct",
      userId: user.id,
      accountId: "credential-id-abc123",
      providerId: "passkey",
      publicKey: "base64-public-key-data",
      counter: 5,
      deviceType: "cross-platform",
      transports: "usb,ble,nfc",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(account.publicKey).toBe("base64-public-key-data");
    expect(account.counter).toBe(5);
    expect(account.deviceType).toBe("cross-platform");
    expect(account.transports).toBe("usb,ble,nfc");

    // Verify transports can hold multiple comma-separated values
    const transportsList = (account.transports as string).split(",");
    expect(transportsList).toContain("usb");
    expect(transportsList).toContain("ble");
    expect(transportsList).toContain("nfc");
  });

  it("updates counter after authentication", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "pk-counter-user" });

    await api.crud.create("account", {
      id: "pk-counter-acct",
      userId: user.id,
      accountId: "counter-credential-id",
      providerId: "passkey",
      publicKey: "counter-public-key",
      counter: 0,
      deviceType: "platform",
      transports: "internal",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Simulate multiple authentications incrementing the counter
    for (let i = 1; i <= 3; i++) {
      const updated = await api.crud.updateOne({
        model: "account",
        where: [
          { field: "accountId", value: "counter-credential-id" },
          { field: "providerId", value: "passkey" },
        ],
        update: { counter: i, updatedAt: Date.now() },
      });
      expect(updated).not.toBeNull();
      expect(updated!.counter).toBe(i);
    }

    // Final counter should be 3
    const final = await api.crud.findOne("account", [
      { field: "accountId", value: "counter-credential-id" },
      { field: "providerId", value: "passkey" },
    ]);
    expect(final!.counter).toBe(3);
  });

  it("multiple passkeys per user", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "pk-multi-user" });

    // Register three passkeys for the same user
    const passkeys = [
      { id: "pk-multi-1", accountId: "cred-laptop", deviceType: "platform", transports: "internal" },
      { id: "pk-multi-2", accountId: "cred-phone", deviceType: "platform", transports: "internal,hybrid" },
      { id: "pk-multi-3", accountId: "cred-yubikey", deviceType: "cross-platform", transports: "usb,nfc" },
    ];

    for (const pk of passkeys) {
      await api.crud.create("account", {
        id: pk.id,
        userId: user.id,
        accountId: pk.accountId,
        providerId: "passkey",
        publicKey: `pubkey-${pk.accountId}`,
        counter: 0,
        deviceType: pk.deviceType,
        transports: pk.transports,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    // Find all passkey accounts for this user
    const accounts = await api.crud.findMany(
      "account",
      [
        { field: "userId", value: "pk-multi-user" },
        { field: "providerId", value: "passkey" },
      ],
      { limit: 100 },
    );
    expect(accounts).toHaveLength(3);
    expect(accounts.map((a) => a.accountId).sort()).toEqual(
      ["cred-laptop", "cred-phone", "cred-yubikey"],
    );
  });

  it("deletes passkey credential", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "pk-delete-user" });

    await api.crud.create("account", {
      id: "pk-delete-acct",
      userId: user.id,
      accountId: "delete-me-credential",
      providerId: "passkey",
      publicKey: "delete-pubkey",
      counter: 10,
      deviceType: "cross-platform",
      transports: "usb",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Confirm it exists
    const before = await api.crud.findOne("account", [
      { field: "accountId", value: "delete-me-credential" },
      { field: "providerId", value: "passkey" },
    ]);
    expect(before).not.toBeNull();

    // Delete it
    await api.crud.deleteOne({
      model: "account",
      where: [
        { field: "accountId", value: "delete-me-credential" },
        { field: "providerId", value: "passkey" },
      ],
    });

    const after = await api.crud.findOne("account", [
      { field: "accountId", value: "delete-me-credential" },
      { field: "providerId", value: "passkey" },
    ]);
    expect(after).toBeNull();
  });
});
