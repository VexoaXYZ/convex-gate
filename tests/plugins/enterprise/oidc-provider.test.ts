import { describe, expect, it } from "vitest";
import { setup, createTestUser, createTestSession } from "../../helpers/mock-db.js";

describe("plugin: oidc-provider — CRUD compatibility", () => {
  // ---- OAuth Application table (already in schema) ----

  it("creates an oauthApplication for OIDC client registration", async () => {
    const { api } = setup();
    const app = await api.crud.create("oauthApplication", {
      id: "oidc-app-1",
      clientId: "oidc-client-abc123",
      clientSecret: "oidc-secret-xyz789",
      name: "My OIDC Client",
      redirectUris: JSON.stringify(["https://app.example.com/callback", "https://app.example.com/silent-renew"]),
      scopes: JSON.stringify(["openid", "profile", "email"]),
      grantTypes: JSON.stringify(["authorization_code", "refresh_token"]),
      responseTypes: JSON.stringify(["code"]),
      tokenEndpointAuthMethod: "client_secret_post",
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(app.clientId).toBe("oidc-client-abc123");
    expect(app.name).toBe("My OIDC Client");
    expect(app.enabled).toBe(true);

    const redirectUris = JSON.parse(app.redirectUris as string);
    expect(redirectUris).toHaveLength(2);
    expect(redirectUris[0]).toBe("https://app.example.com/callback");
  });

  // ---- OAuth Access Token table ----

  it("creates an oauthAccessToken record", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "oidc-token-user" });

    const token = await api.crud.create("oauthAccessToken", {
      id: "oat-1",
      token: "eyJhbGciOiJSUzI1NiJ9.access-token-payload",
      clientId: "oidc-client-abc123",
      userId: user.id,
      scopes: JSON.stringify(["openid", "profile"]),
      expiresAt: Date.now() + 3600000, // 1 hour
      createdAt: Date.now(),
    });

    expect(token.token).toContain("access-token-payload");
    expect(token.clientId).toBe("oidc-client-abc123");
    expect(token.userId).toBe("oidc-token-user");

    const found = await api.crud.findOne("oauthAccessToken", [
      { field: "token", value: "eyJhbGciOiJSUzI1NiJ9.access-token-payload" },
    ]);
    expect(found).not.toBeNull();
    expect(found!.userId).toBe("oidc-token-user");
  });

  // ---- OAuth Consent table ----

  it("creates an oauthConsent record", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "oidc-consent-user" });

    const consent = await api.crud.create("oauthConsent", {
      id: "consent-1",
      userId: user.id,
      clientId: "oidc-client-abc123",
      scopes: JSON.stringify(["openid", "profile", "email"]),
      consentGivenAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(consent.userId).toBe("oidc-consent-user");
    expect(consent.clientId).toBe("oidc-client-abc123");

    const scopes = JSON.parse(consent.scopes as string);
    expect(scopes).toContain("openid");
    expect(scopes).toContain("email");
  });

  // ---- Full OIDC flow: registration → authorization → token grant ----

  it("simulates full OIDC flow: app registration, authorization code, token grant", async () => {
    const { api } = setup();

    // Step 1: Register OIDC client application
    const app = await api.crud.create("oauthApplication", {
      id: "oidc-flow-app",
      clientId: "flow-client-id",
      clientSecret: "flow-client-secret",
      name: "Flow Test App",
      redirectUris: JSON.stringify(["https://flow.example.com/callback"]),
      scopes: JSON.stringify(["openid", "profile", "email"]),
      grantTypes: JSON.stringify(["authorization_code"]),
      responseTypes: JSON.stringify(["code"]),
      tokenEndpointAuthMethod: "client_secret_basic",
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Step 2: User authenticates
    const user = await createTestUser(api, {
      id: "oidc-flow-user",
      email: "oidc-flow@example.com",
    });

    // Step 3: Store authorization code in verification
    await api.crud.create("verification", {
      id: "auth-code-1",
      identifier: `oidc-code:${app.clientId}:${user.id}`,
      value: JSON.stringify({
        code: "auth_code_abc123",
        redirectUri: "https://flow.example.com/callback",
        scopes: ["openid", "profile", "email"],
        codeChallenge: "S256-challenge-value",
        codeChallengeMethod: "S256",
        nonce: "nonce-xyz",
      }),
      expiresAt: Date.now() + 600000, // 10 min
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Step 4: User grants consent
    await api.crud.create("oauthConsent", {
      id: "flow-consent",
      userId: user.id as string,
      clientId: app.clientId as string,
      scopes: JSON.stringify(["openid", "profile", "email"]),
      consentGivenAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Step 5: Exchange code for tokens (create access token)
    const accessToken = await api.crud.create("oauthAccessToken", {
      id: "flow-access-token",
      token: "eyJ.flow-access-token",
      clientId: app.clientId as string,
      userId: user.id as string,
      scopes: JSON.stringify(["openid", "profile", "email"]),
      expiresAt: Date.now() + 3600000,
      createdAt: Date.now(),
    });

    // Step 6: Clean up authorization code
    await api.crud.deleteOne({
      model: "verification",
      where: [{ field: "id", value: "auth-code-1" }],
    });

    // Verify the full chain
    expect(app.clientId).toBe("flow-client-id");
    expect(accessToken.userId).toBe("oidc-flow-user");

    const consent = await api.crud.findOne("oauthConsent", [
      { field: "userId", value: user.id as string },
      { field: "clientId", value: app.clientId as string },
    ]);
    expect(consent).not.toBeNull();

    // Auth code should be cleaned up
    const authCode = await api.crud.findOne("verification", [{ field: "id", value: "auth-code-1" }]);
    expect(authCode).toBeNull();
  });

  // ---- Token refresh ----

  it("handles token refresh by creating a new access token and revoking the old one", async () => {
    const { api } = setup();
    await createTestUser(api, { id: "refresh-user" });

    // Create original access token
    await api.crud.create("oauthAccessToken", {
      id: "old-token",
      token: "eyJ.old-access-token",
      clientId: "refresh-client",
      userId: "refresh-user",
      scopes: JSON.stringify(["openid"]),
      expiresAt: Date.now() + 3600000,
      createdAt: Date.now(),
    });

    // Store refresh token in verification
    await api.crud.create("verification", {
      id: "refresh-tok-1",
      identifier: "oidc-refresh:refresh-client:refresh-user",
      value: "refresh_token_abc123",
      expiresAt: Date.now() + 30 * 86400000, // 30 days
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Simulate token refresh: revoke old, create new
    await api.crud.deleteOne({
      model: "oauthAccessToken",
      where: [{ field: "id", value: "old-token" }],
    });

    const newToken = await api.crud.create("oauthAccessToken", {
      id: "new-token",
      token: "eyJ.new-access-token",
      clientId: "refresh-client",
      userId: "refresh-user",
      scopes: JSON.stringify(["openid"]),
      expiresAt: Date.now() + 3600000,
      createdAt: Date.now(),
    });

    // Old token gone
    const oldFound = await api.crud.findOne("oauthAccessToken", [
      { field: "token", value: "eyJ.old-access-token" },
    ]);
    expect(oldFound).toBeNull();

    // New token exists
    const newFound = await api.crud.findOne("oauthAccessToken", [
      { field: "token", value: "eyJ.new-access-token" },
    ]);
    expect(newFound).not.toBeNull();
    expect(newFound!.userId).toBe("refresh-user");
  });

  // ---- Consent revocation ----

  it("revokes consent by deleting the oauthConsent record", async () => {
    const { api } = setup();
    await createTestUser(api, { id: "revoke-user" });

    await api.crud.create("oauthConsent", {
      id: "consent-revoke",
      userId: "revoke-user",
      clientId: "revoke-client",
      scopes: JSON.stringify(["openid", "profile"]),
      consentGivenAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Revoke consent
    await api.crud.deleteOne({
      model: "oauthConsent",
      where: [
        { field: "userId", value: "revoke-user" },
        { field: "clientId", value: "revoke-client" },
      ],
    });

    const found = await api.crud.findOne("oauthConsent", [
      { field: "userId", value: "revoke-user" },
      { field: "clientId", value: "revoke-client" },
    ]);
    expect(found).toBeNull();
  });

  // ---- Multiple OIDC clients per user ----

  it("supports user having consents across multiple OIDC clients", async () => {
    const { api } = setup();
    await createTestUser(api, { id: "multi-oidc-user" });

    await api.crud.create("oauthConsent", {
      id: "mc-1",
      userId: "multi-oidc-user",
      clientId: "client-a",
      scopes: JSON.stringify(["openid"]),
      consentGivenAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await api.crud.create("oauthConsent", {
      id: "mc-2",
      userId: "multi-oidc-user",
      clientId: "client-b",
      scopes: JSON.stringify(["openid", "profile"]),
      consentGivenAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await api.crud.create("oauthConsent", {
      id: "mc-3",
      userId: "multi-oidc-user",
      clientId: "client-c",
      scopes: JSON.stringify(["openid", "email"]),
      consentGivenAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const consents = await api.crud.findMany(
      "oauthConsent",
      [{ field: "userId", value: "multi-oidc-user" }],
      { limit: 100 },
    );

    expect(consents).toHaveLength(3);
    const clientIds = consents.map((c) => c.clientId);
    expect(clientIds).toContain("client-a");
    expect(clientIds).toContain("client-b");
    expect(clientIds).toContain("client-c");
  });
});
