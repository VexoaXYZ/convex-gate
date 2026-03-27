import { describe, expect, it } from "vitest";
import { setup, createTestUser, createTestSession } from "../../helpers/mock-db.js";

describe("plugin: one-tap (Google)", () => {
  it("creates account with providerId='google'", async () => {
    const { api } = setup();
    const user = await createTestUser(api, {
      id: "onetap-user-1",
      email: "alice@gmail.com",
      name: "Alice Smith",
    });

    const account = await api.crud.create("account", {
      id: "onetap-acct-1",
      userId: user.id,
      accountId: "google-sub-1234567890",
      providerId: "google",
      accessToken: "ya29.google-access-token",
      refreshToken: "1//google-refresh-token",
      idToken: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.google-id-token",
      scope: "openid profile email",
      expiresAt: Date.now() + 3600000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(account.providerId).toBe("google");
    expect(account.accountId).toBe("google-sub-1234567890");
    expect(account.userId).toBe("onetap-user-1");
  });

  it("stores Google-specific fields (tokens, scope, expiry)", async () => {
    const { api } = setup();
    const user = await createTestUser(api, {
      id: "onetap-fields-user",
      email: "bob@gmail.com",
    });

    const expiresAt = Date.now() + 3600000;
    await api.crud.create("account", {
      id: "onetap-fields-acct",
      userId: user.id,
      accountId: "google-sub-9876543210",
      providerId: "google",
      accessToken: "ya29.long-access-token",
      refreshToken: "1//long-refresh-token",
      idToken: "eyJhbGciOiJSUzI1NiJ9.payload.signature",
      scope: "openid profile email https://www.googleapis.com/auth/calendar.readonly",
      expiresAt,
      tokenType: "Bearer",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const found = await api.crud.findOne("account", [
      { field: "providerId", value: "google" },
      { field: "accountId", value: "google-sub-9876543210" },
    ]);
    expect(found).not.toBeNull();
    expect(found!.accessToken).toBe("ya29.long-access-token");
    expect(found!.refreshToken).toBe("1//long-refresh-token");
    expect(found!.idToken).toBe("eyJhbGciOiJSUzI1NiJ9.payload.signature");
    expect(found!.scope).toContain("openid");
    expect(found!.expiresAt).toBe(expiresAt);
    expect(found!.tokenType).toBe("Bearer");
  });

  it("links Google account to existing user", async () => {
    const { api } = setup();

    // User already exists (e.g., signed up via email/password)
    const existingUser = await createTestUser(api, {
      id: "onetap-existing-user",
      email: "existing@gmail.com",
      name: "Existing User",
      emailVerified: true,
    });

    // One Tap links Google to the existing account
    await api.crud.create("account", {
      id: "onetap-link-acct",
      userId: existingUser.id,
      accountId: "google-sub-linked",
      providerId: "google",
      accessToken: "ya29.linked-token",
      refreshToken: null,
      idToken: "linked-id-token",
      scope: "openid profile email",
      expiresAt: Date.now() + 3600000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // User should still be retrievable
    const user = await api.crud.findOne("user", [
      { field: "id", value: "onetap-existing-user" },
    ]);
    expect(user).not.toBeNull();
    expect(user!.email).toBe("existing@gmail.com");

    // Google account should be linked to that user
    const googleAcct = await api.crud.findOne("account", [
      { field: "providerId", value: "google" },
      { field: "userId", value: "onetap-existing-user" },
    ]);
    expect(googleAcct).not.toBeNull();
    expect(googleAcct!.accountId).toBe("google-sub-linked");
  });

  it("no new tables needed — uses existing account model", async () => {
    const { api } = setup();
    const user = await createTestUser(api, {
      id: "onetap-noextra-user",
      email: "noextra@gmail.com",
    });

    // Create a Google account alongside other provider accounts
    await api.crud.create("account", {
      id: "onetap-noextra-google",
      userId: user.id,
      accountId: "google-sub-noextra",
      providerId: "google",
      accessToken: "ya29.noextra",
      refreshToken: null,
      scope: "openid",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await api.crud.create("account", {
      id: "onetap-noextra-github",
      userId: user.id,
      accountId: "gh-noextra-456",
      providerId: "github",
      accessToken: "gho_github-token",
      refreshToken: null,
      scope: "read:user",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Both coexist in the same account table
    const allAccounts = await api.crud.findMany(
      "account",
      [{ field: "userId", value: "onetap-noextra-user" }],
      { limit: 100 },
    );
    expect(allAccounts).toHaveLength(2);
    expect(allAccounts.map((a) => a.providerId).sort()).toEqual(["github", "google"]);
  });

  it("One Tap creates session after authentication", async () => {
    const { api } = setup();
    const user = await createTestUser(api, {
      id: "onetap-session-user",
      email: "session@gmail.com",
    });

    await api.crud.create("account", {
      id: "onetap-session-acct",
      userId: user.id,
      accountId: "google-sub-session",
      providerId: "google",
      accessToken: "ya29.session-token",
      refreshToken: null,
      scope: "openid profile email",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const session = await createTestSession(api, user.id as string);

    const result = await api.hotPath.getSessionWithUserByToken({
      token: session.token as string,
      now: Date.now(),
    });
    expect(result.session).not.toBeNull();
    expect(result.user).not.toBeNull();
    expect(result.user!.email).toBe("session@gmail.com");
  });
});
