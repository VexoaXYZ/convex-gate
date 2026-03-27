import { describe, expect, it } from "vitest";
import { setup, createTestUser } from "../../helpers/mock-db.js";

describe("plugin: oauth-provider — CRUD compatibility", () => {
  // ---- OAuth Application table ----

  it("creates an oauthApplication for OAuth provider", async () => {
    const { api } = setup();
    const app = await api.crud.create("oauthApplication", {
      id: "oauth-app-1",
      clientId: "oauth-client-001",
      clientSecret: "oauth-secret-001",
      name: "Third Party App",
      redirectUris: JSON.stringify(["https://thirdparty.com/auth/callback"]),
      scopes: JSON.stringify(["read", "write"]),
      grantTypes: JSON.stringify(["authorization_code", "client_credentials"]),
      responseTypes: JSON.stringify(["code"]),
      tokenEndpointAuthMethod: "client_secret_post",
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(app.clientId).toBe("oauth-client-001");
    expect(app.name).toBe("Third Party App");
    expect(app.enabled).toBe(true);

    const scopes = JSON.parse(app.scopes as string);
    expect(scopes).toContain("read");
    expect(scopes).toContain("write");
  });

  it("finds an oauthApplication by clientId", async () => {
    const { api } = setup();
    await api.crud.create("oauthApplication", {
      id: "oauth-app-find",
      clientId: "find-me-client",
      clientSecret: "find-me-secret",
      name: "Find Me App",
      redirectUris: JSON.stringify(["https://findme.com/callback"]),
      scopes: JSON.stringify(["read"]),
      grantTypes: JSON.stringify(["authorization_code"]),
      responseTypes: JSON.stringify(["code"]),
      tokenEndpointAuthMethod: "client_secret_basic",
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const found = await api.crud.findOne("oauthApplication", [
      { field: "clientId", value: "find-me-client" },
    ]);

    expect(found).not.toBeNull();
    expect(found!.name).toBe("Find Me App");
    expect(found!.clientSecret).toBe("find-me-secret");
  });

  // ---- Client Credentials flow data patterns ----

  it("simulates client credentials flow: app auth and token creation", async () => {
    const { api } = setup();

    // Register the OAuth application
    await api.crud.create("oauthApplication", {
      id: "cc-app",
      clientId: "cc-client-id",
      clientSecret: "cc-client-secret",
      name: "Machine-to-Machine App",
      redirectUris: JSON.stringify([]),
      scopes: JSON.stringify(["api:read", "api:write"]),
      grantTypes: JSON.stringify(["client_credentials"]),
      responseTypes: JSON.stringify([]),
      tokenEndpointAuthMethod: "client_secret_post",
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Verify the app exists and credentials match
    const app = await api.crud.findOne("oauthApplication", [
      { field: "clientId", value: "cc-client-id" },
    ]);
    expect(app).not.toBeNull();
    expect(app!.clientSecret).toBe("cc-client-secret");

    // Issue an access token for the client (no user — machine-to-machine)
    const token = await api.crud.create("oauthAccessToken", {
      id: "cc-token-1",
      token: "eyJ.client-credentials-token",
      clientId: "cc-client-id",
      userId: null, // No user for client_credentials grant
      scopes: JSON.stringify(["api:read", "api:write"]),
      expiresAt: Date.now() + 3600000,
      createdAt: Date.now(),
    });

    expect(token.userId).toBeNull();
    expect(token.clientId).toBe("cc-client-id");

    // Verify token lookup
    const foundToken = await api.crud.findOne("oauthAccessToken", [
      { field: "token", value: "eyJ.client-credentials-token" },
    ]);
    expect(foundToken).not.toBeNull();
    expect(foundToken!.clientId).toBe("cc-client-id");
  });

  // ---- Authorization Code flow data patterns ----

  it("simulates authorization code flow: auth request, code exchange, token", async () => {
    const { api } = setup();

    // Step 1: OAuth app registered
    await api.crud.create("oauthApplication", {
      id: "ac-app",
      clientId: "ac-client-id",
      clientSecret: "ac-client-secret",
      name: "Auth Code App",
      redirectUris: JSON.stringify(["https://acapp.example.com/callback"]),
      scopes: JSON.stringify(["read", "write"]),
      grantTypes: JSON.stringify(["authorization_code"]),
      responseTypes: JSON.stringify(["code"]),
      tokenEndpointAuthMethod: "client_secret_basic",
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Step 2: User authenticates
    const user = await createTestUser(api, {
      id: "ac-user",
      email: "ac-user@example.com",
    });

    // Step 3: Store authorization code
    await api.crud.create("verification", {
      id: "oauth-code-1",
      identifier: "oauth-code:ac-client-id:ac-user",
      value: JSON.stringify({
        code: "auth_code_xyz789",
        redirectUri: "https://acapp.example.com/callback",
        scopes: ["read", "write"],
        state: "random-state-value",
      }),
      expiresAt: Date.now() + 600000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Step 4: Exchange code for token
    const codeRecord = await api.crud.findOne("verification", [
      { field: "identifier", value: "oauth-code:ac-client-id:ac-user" },
    ]);
    expect(codeRecord).not.toBeNull();

    const codeData = JSON.parse(codeRecord!.value as string);
    expect(codeData.code).toBe("auth_code_xyz789");
    expect(codeData.state).toBe("random-state-value");

    // Step 5: Create access token
    await api.crud.create("oauthAccessToken", {
      id: "ac-token-1",
      token: "eyJ.auth-code-access-token",
      clientId: "ac-client-id",
      userId: user.id as string,
      scopes: JSON.stringify(codeData.scopes),
      expiresAt: Date.now() + 3600000,
      createdAt: Date.now(),
    });

    // Step 6: Delete the used authorization code
    await api.crud.deleteOne({
      model: "verification",
      where: [{ field: "id", value: "oauth-code-1" }],
    });

    // Verify token exists and code is consumed
    const token = await api.crud.findOne("oauthAccessToken", [
      { field: "token", value: "eyJ.auth-code-access-token" },
    ]);
    expect(token).not.toBeNull();
    expect(token!.userId).toBe("ac-user");

    const consumedCode = await api.crud.findOne("verification", [{ field: "id", value: "oauth-code-1" }]);
    expect(consumedCode).toBeNull();
  });

  // ---- Disable and re-enable app ----

  it("disables and re-enables an oauthApplication", async () => {
    const { api } = setup();
    await api.crud.create("oauthApplication", {
      id: "toggle-app",
      clientId: "toggle-client",
      clientSecret: "toggle-secret",
      name: "Toggle App",
      redirectUris: JSON.stringify(["https://toggle.com/cb"]),
      scopes: JSON.stringify(["read"]),
      grantTypes: JSON.stringify(["authorization_code"]),
      responseTypes: JSON.stringify(["code"]),
      tokenEndpointAuthMethod: "client_secret_post",
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Disable
    const disabled = await api.crud.updateOne({
      model: "oauthApplication",
      where: [{ field: "clientId", value: "toggle-client" }],
      update: { enabled: false, updatedAt: Date.now() },
    });
    expect(disabled!.enabled).toBe(false);

    // Re-enable
    const enabled = await api.crud.updateOne({
      model: "oauthApplication",
      where: [{ field: "clientId", value: "toggle-client" }],
      update: { enabled: true, updatedAt: Date.now() },
    });
    expect(enabled!.enabled).toBe(true);
  });

  // ---- Token cleanup ----

  it("deletes all tokens for a revoked application", async () => {
    const { api } = setup();

    // Create multiple tokens for one client
    for (let i = 0; i < 4; i++) {
      await api.crud.create("oauthAccessToken", {
        id: `revoke-token-${i}`,
        token: `eyJ.revoke-token-${i}`,
        clientId: "revoke-client",
        userId: `user-${i}`,
        scopes: JSON.stringify(["read"]),
        expiresAt: Date.now() + 3600000,
        createdAt: Date.now(),
      });
    }

    const deleted = await api.crud.deleteMany({
      model: "oauthAccessToken",
      where: [{ field: "clientId", value: "revoke-client" }],
    });

    expect(deleted).toBe(4);

    const remaining = await api.crud.findMany(
      "oauthAccessToken",
      [{ field: "clientId", value: "revoke-client" }],
      { limit: 100 },
    );
    expect(remaining).toHaveLength(0);
  });

  // ---- Multiple apps listing ----

  it("lists all registered OAuth applications", async () => {
    const { api } = setup();

    for (let i = 0; i < 3; i++) {
      await api.crud.create("oauthApplication", {
        id: `list-app-${i}`,
        clientId: `list-client-${i}`,
        clientSecret: `list-secret-${i}`,
        name: `App ${i}`,
        redirectUris: JSON.stringify([`https://app${i}.com/cb`]),
        scopes: JSON.stringify(["read"]),
        grantTypes: JSON.stringify(["authorization_code"]),
        responseTypes: JSON.stringify(["code"]),
        tokenEndpointAuthMethod: "client_secret_post",
        enabled: i !== 2, // third app disabled
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    const allApps = await api.crud.findMany("oauthApplication", [], { limit: 100 });
    expect(allApps).toHaveLength(3);

    const enabledApps = await api.crud.findMany(
      "oauthApplication",
      [{ field: "enabled", value: true }],
      { limit: 100 },
    );
    expect(enabledApps).toHaveLength(2);
  });
});
