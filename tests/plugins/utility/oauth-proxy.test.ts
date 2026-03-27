import { describe, expect, it } from "vitest";
import { setup, createTestUser } from "../../helpers/mock-db.js";

describe("plugin: oauth-proxy — pure logic, OAuth account creation", () => {
  it("creates OAuth account through adapter normally", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "oauth-proxy-user", email: "oauth@example.com" });

    const account = await api.crud.create("account", {
      id: "oauth-acct-1",
      userId: user.id as string,
      accountId: "google-uid-12345",
      providerId: "google",
      accessToken: "ya29.access-token",
      refreshToken: "1//refresh-token",
      accessTokenExpiresAt: Date.now() + 3600000,
      scope: "openid email profile",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    expect(account.providerId).toBe("google");
    expect(account.accessToken).toBe("ya29.access-token");
  });

  it("finds OAuth account by provider and accountId", async () => {
    const { api } = setup();
    await createTestUser(api, { id: "oauth-find-user" });
    await api.crud.create("account", {
      id: "oauth-find-acct",
      userId: "oauth-find-user",
      accountId: "github-uid-67890",
      providerId: "github",
      accessToken: "gho_token",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const found = await api.crud.findOne("account", [
      { field: "providerId", value: "github" },
      { field: "accountId", value: "github-uid-67890" },
    ]);
    expect(found).not.toBeNull();
    expect(found!.userId).toBe("oauth-find-user");
  });

  it("updates OAuth tokens on refresh", async () => {
    const { api } = setup();
    await createTestUser(api, { id: "oauth-refresh-user" });
    await api.crud.create("account", {
      id: "oauth-refresh-acct",
      userId: "oauth-refresh-user",
      accountId: "google-uid-999",
      providerId: "google",
      accessToken: "old-token",
      refreshToken: "old-refresh",
      accessTokenExpiresAt: Date.now() - 1000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const updated = await api.crud.updateOne({
      model: "account",
      where: [
        { field: "providerId", value: "google" },
        { field: "accountId", value: "google-uid-999" },
      ],
      update: {
        accessToken: "new-token",
        accessTokenExpiresAt: Date.now() + 3600000,
        updatedAt: Date.now(),
      },
    });
    expect(updated!.accessToken).toBe("new-token");
  });
});
