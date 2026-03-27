import { describe, expect, it } from "vitest";
import { setup, createTestUser, createTestSession } from "../../helpers/mock-db.js";

describe("plugin: generic-oauth", () => {
  it("creates account with custom provider (providerId='custom-provider')", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "oauth-user-1" });

    const account = await api.crud.create("account", {
      id: "oauth-acct-1",
      userId: user.id,
      accountId: "custom-ext-id-12345",
      providerId: "custom-provider",
      accessToken: "access-abc123",
      refreshToken: "refresh-xyz789",
      idToken: "id-token-jwt-string",
      scope: "openid profile email",
      expiresAt: Date.now() + 3600000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(account.providerId).toBe("custom-provider");
    expect(account.accountId).toBe("custom-ext-id-12345");
    expect(account.accessToken).toBe("access-abc123");
    expect(account.refreshToken).toBe("refresh-xyz789");
    expect(account.idToken).toBe("id-token-jwt-string");
    expect(account.scope).toBe("openid profile email");
  });

  it("stores accessToken, refreshToken, idToken, scope", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "oauth-tokens-user" });

    await api.crud.create("account", {
      id: "oauth-tokens-acct",
      userId: user.id,
      accountId: "ext-456",
      providerId: "gitlab",
      accessToken: "gl-access-token-long-string",
      refreshToken: "gl-refresh-token-long-string",
      idToken: null,
      scope: "read_user api",
      expiresAt: Date.now() + 7200000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const found = await api.crud.findOne("account", [
      { field: "providerId", value: "gitlab" },
      { field: "accountId", value: "ext-456" },
    ]);
    expect(found).not.toBeNull();
    expect(found!.accessToken).toBe("gl-access-token-long-string");
    expect(found!.refreshToken).toBe("gl-refresh-token-long-string");
    expect(found!.idToken).toBeNull();
    expect(found!.scope).toBe("read_user api");
  });

  it("updates tokens on refresh", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "oauth-refresh-user" });

    await api.crud.create("account", {
      id: "oauth-refresh-acct",
      userId: user.id,
      accountId: "refresh-ext-id",
      providerId: "discord",
      accessToken: "old-access-token",
      refreshToken: "old-refresh-token",
      idToken: "old-id-token",
      scope: "identify guilds",
      expiresAt: Date.now() + 100000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const newExpiry = Date.now() + 3600000;
    const updated = await api.crud.updateOne({
      model: "account",
      where: [
        { field: "providerId", value: "discord" },
        { field: "accountId", value: "refresh-ext-id" },
      ],
      update: {
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
        idToken: "new-id-token",
        expiresAt: newExpiry,
        updatedAt: Date.now(),
      },
    });

    expect(updated).not.toBeNull();
    expect(updated!.accessToken).toBe("new-access-token");
    expect(updated!.refreshToken).toBe("new-refresh-token");
    expect(updated!.idToken).toBe("new-id-token");
    expect(updated!.expiresAt).toBe(newExpiry);
    // Provider and accountId should remain unchanged
    expect(updated!.providerId).toBe("discord");
    expect(updated!.accountId).toBe("refresh-ext-id");
  });

  it("multiple providers per user", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "oauth-multi-user" });

    const providers = [
      { providerId: "github", accountId: "gh-123", scope: "read:user" },
      { providerId: "google", accountId: "goog-456", scope: "openid profile email" },
      { providerId: "discord", accountId: "disc-789", scope: "identify" },
      { providerId: "spotify", accountId: "spot-101", scope: "user-read-email" },
    ];

    for (let i = 0; i < providers.length; i++) {
      await api.crud.create("account", {
        id: `oauth-multi-${i}`,
        userId: user.id,
        accountId: providers[i].accountId,
        providerId: providers[i].providerId,
        accessToken: `access-${providers[i].providerId}`,
        refreshToken: `refresh-${providers[i].providerId}`,
        idToken: null,
        scope: providers[i].scope,
        expiresAt: Date.now() + 3600000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    // All accounts for this user
    const accounts = await api.crud.findMany(
      "account",
      [{ field: "userId", value: "oauth-multi-user" }],
      { limit: 100 },
    );
    expect(accounts).toHaveLength(4);

    const providerIds = accounts.map((a) => a.providerId).sort();
    expect(providerIds).toEqual(["discord", "github", "google", "spotify"]);
  });

  it("finds account by providerId + accountId", async () => {
    const { api } = setup();
    const userA = await createTestUser(api, { id: "oauth-find-a", email: "a@test.com" });
    const userB = await createTestUser(api, { id: "oauth-find-b", email: "b@test.com" });

    await api.crud.create("account", {
      id: "oauth-findby-1",
      userId: userA.id,
      accountId: "ext-same-id",
      providerId: "github",
      accessToken: "a-token",
      refreshToken: null,
      scope: "read:user",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await api.crud.create("account", {
      id: "oauth-findby-2",
      userId: userB.id,
      accountId: "ext-same-id",
      providerId: "gitlab",
      accessToken: "b-token",
      refreshToken: null,
      scope: "read_user",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Same accountId but different providers should return correct accounts
    const githubAcct = await api.crud.findOne("account", [
      { field: "providerId", value: "github" },
      { field: "accountId", value: "ext-same-id" },
    ]);
    expect(githubAcct).not.toBeNull();
    expect(githubAcct!.userId).toBe("oauth-find-a");

    const gitlabAcct = await api.crud.findOne("account", [
      { field: "providerId", value: "gitlab" },
      { field: "accountId", value: "ext-same-id" },
    ]);
    expect(gitlabAcct).not.toBeNull();
    expect(gitlabAcct!.userId).toBe("oauth-find-b");
  });

  it("deletes OAuth account when user unlinks provider", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "oauth-unlink-user" });

    await api.crud.create("account", {
      id: "oauth-unlink-acct",
      userId: user.id,
      accountId: "unlink-ext-id",
      providerId: "twitter",
      accessToken: "tw-access",
      refreshToken: "tw-refresh",
      scope: "tweet.read users.read",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await api.crud.deleteOne({
      model: "account",
      where: [
        { field: "providerId", value: "twitter" },
        { field: "accountId", value: "unlink-ext-id" },
      ],
    });

    const found = await api.crud.findOne("account", [
      { field: "providerId", value: "twitter" },
      { field: "accountId", value: "unlink-ext-id" },
    ]);
    expect(found).toBeNull();
  });
});
