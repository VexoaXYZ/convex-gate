import { describe, expect, it } from "vitest";
import { setup, createTestUser, createTestSession } from "../../helpers/mock-db.js";

describe("plugin: sso — CRUD compatibility (CRITICAL)", () => {
  // ---- SSO Provider table ----

  it("creates an ssoProvider record with full configuration", async () => {
    const { api } = setup();
    const provider = await api.crud.create("ssoProvider", {
      id: "sso-okta",
      issuer: "https://acme.okta.com",
      domain: "acme.com",
      clientId: "0oa1bcdef2ghijklm3n4",
      clientSecret: "supersecret_okta_client_secret",
      idpMetadata: JSON.stringify({
        singleSignOnService: "https://acme.okta.com/app/abc/sso/saml",
        singleLogoutService: "https://acme.okta.com/app/abc/slo/saml",
        certificate: "MIIDpDCCAoygAwIBAgI...",
      }),
      type: "saml",
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(provider.issuer).toBe("https://acme.okta.com");
    expect(provider.domain).toBe("acme.com");
    expect(provider.clientId).toBe("0oa1bcdef2ghijklm3n4");
    expect(provider.type).toBe("saml");
    expect(provider.enabled).toBe(true);
  });

  it("creates an OIDC-based SSO provider", async () => {
    const { api } = setup();
    const provider = await api.crud.create("ssoProvider", {
      id: "sso-azure-oidc",
      issuer: "https://login.microsoftonline.com/tenant-id/v2.0",
      domain: "contoso.com",
      clientId: "azure-client-id-123",
      clientSecret: "azure-secret-456",
      idpMetadata: JSON.stringify({
        authorizationEndpoint: "https://login.microsoftonline.com/tenant-id/oauth2/v2.0/authorize",
        tokenEndpoint: "https://login.microsoftonline.com/tenant-id/oauth2/v2.0/token",
        jwksUri: "https://login.microsoftonline.com/tenant-id/discovery/v2.0/keys",
      }),
      type: "oidc",
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(provider.type).toBe("oidc");
    expect(provider.domain).toBe("contoso.com");
    const metadata = JSON.parse(provider.idpMetadata as string);
    expect(metadata.jwksUri).toContain("keys");
  });

  // ---- SSO Connection table ----

  it("creates an ssoConnection linking provider to organization", async () => {
    const { api } = setup();
    await api.crud.create("organization", {
      id: "org-sso",
      name: "SSO Org",
      slug: "sso-org",
      logo: null,
      metadata: null,
      createdAt: Date.now(),
    });
    await api.crud.create("ssoProvider", {
      id: "sso-provider-conn",
      issuer: "https://idp.example.com",
      domain: "example.com",
      clientId: "client-1",
      clientSecret: "secret-1",
      idpMetadata: "{}",
      type: "saml",
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const connection = await api.crud.create("ssoConnection", {
      id: "conn-1",
      providerId: "sso-provider-conn",
      organizationId: "org-sso",
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(connection.providerId).toBe("sso-provider-conn");
    expect(connection.organizationId).toBe("org-sso");
    expect(connection.enabled).toBe(true);
  });

  // ---- SAML assertion in verification table ----

  it("stores SAML assertion data in the verification table", async () => {
    const { api } = setup();
    const samlResponse = {
      nameId: "user@acme.com",
      nameIdFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
      sessionIndex: "_abc123",
      attributes: {
        email: "user@acme.com",
        firstName: "Jane",
        lastName: "Doe",
        groups: ["engineering", "all-staff"],
      },
    };

    const verification = await api.crud.create("verification", {
      id: "saml-assertion-1",
      identifier: "saml-response:req-abc123",
      value: JSON.stringify(samlResponse),
      expiresAt: Date.now() + 300000, // 5 min validity
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const found = await api.crud.findOne("verification", [
      { field: "identifier", value: "saml-response:req-abc123" },
    ]);
    expect(found).not.toBeNull();
    const parsed = JSON.parse(found!.value as string);
    expect(parsed.nameId).toBe("user@acme.com");
    expect(parsed.attributes.groups).toContain("engineering");
  });

  // ---- Account with SSO provider ID ----

  it("creates an account with providerId in sso:{provider-id} format", async () => {
    const { api } = setup();
    await createTestUser(api, { id: "sso-user-1", email: "jane@acme.com" });

    const account = await api.crud.create("account", {
      id: "acct-sso-1",
      userId: "sso-user-1",
      accountId: "jane@acme.com",
      providerId: "sso:sso-okta",
      accessToken: null,
      refreshToken: null,
      idToken: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
      expiresAt: Date.now() + 3600000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(account.providerId).toBe("sso:sso-okta");
    expect(account.accountId).toBe("jane@acme.com");

    // Find by the SSO provider format
    const found = await api.crud.findOne("account", [
      { field: "providerId", value: "sso:sso-okta" },
      { field: "userId", value: "sso-user-1" },
    ]);
    expect(found).not.toBeNull();
    expect(found!.idToken).toBeDefined();
  });

  // ---- Session with SSO provider reference ----

  it("creates a session with ssoProviderId field", async () => {
    const { api } = setup();
    await createTestUser(api, { id: "sso-sess-user", email: "sso-sess@acme.com" });

    const session = await createTestSession(api, "sso-sess-user", {
      ssoProviderId: "sso-okta",
      ssoSessionIndex: "_session123",
    });

    expect(session.ssoProviderId).toBe("sso-okta");
    expect(session.ssoSessionIndex).toBe("_session123");

    // Verify via hot path
    const result = await api.hotPath.getSessionWithUserByToken({
      token: session.token as string,
      now: Date.now(),
    });
    expect(result.session).not.toBeNull();
    expect(result.session!.ssoProviderId).toBe("sso-okta");
  });

  // ---- Multiple SSO providers ----

  it("supports multiple SSO providers for different domains", async () => {
    const { api } = setup();

    await api.crud.create("ssoProvider", {
      id: "sso-okta-acme",
      issuer: "https://acme.okta.com",
      domain: "acme.com",
      clientId: "acme-client",
      clientSecret: "acme-secret",
      idpMetadata: "{}",
      type: "saml",
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await api.crud.create("ssoProvider", {
      id: "sso-azure-contoso",
      issuer: "https://login.microsoftonline.com/contoso",
      domain: "contoso.com",
      clientId: "contoso-client",
      clientSecret: "contoso-secret",
      idpMetadata: "{}",
      type: "oidc",
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await api.crud.create("ssoProvider", {
      id: "sso-google-initech",
      issuer: "https://accounts.google.com",
      domain: "initech.com",
      clientId: "google-client",
      clientSecret: "google-secret",
      idpMetadata: "{}",
      type: "oidc",
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const allProviders = await api.crud.findMany("ssoProvider", [], { limit: 100 });
    expect(allProviders).toHaveLength(3);

    // Find by domain
    const acmeProvider = await api.crud.findOne("ssoProvider", [
      { field: "domain", value: "acme.com" },
    ]);
    expect(acmeProvider).not.toBeNull();
    expect(acmeProvider!.issuer).toBe("https://acme.okta.com");

    const contosoProvider = await api.crud.findOne("ssoProvider", [
      { field: "domain", value: "contoso.com" },
    ]);
    expect(contosoProvider).not.toBeNull();
    expect(contosoProvider!.type).toBe("oidc");
  });

  // ---- Provider configuration update ----

  it("updates SSO provider configuration", async () => {
    const { api } = setup();

    await api.crud.create("ssoProvider", {
      id: "sso-update-target",
      issuer: "https://old-idp.example.com",
      domain: "example.com",
      clientId: "old-client-id",
      clientSecret: "old-secret",
      idpMetadata: JSON.stringify({ certificate: "old-cert" }),
      type: "saml",
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const updated = await api.crud.updateOne({
      model: "ssoProvider",
      where: [{ field: "id", value: "sso-update-target" }],
      update: {
        issuer: "https://new-idp.example.com",
        clientId: "new-client-id",
        clientSecret: "new-secret",
        idpMetadata: JSON.stringify({ certificate: "new-cert" }),
        updatedAt: Date.now(),
      },
    });

    expect(updated).not.toBeNull();
    expect(updated!.issuer).toBe("https://new-idp.example.com");
    expect(updated!.clientId).toBe("new-client-id");
    const metadata = JSON.parse(updated!.idpMetadata as string);
    expect(metadata.certificate).toBe("new-cert");
  });

  // ---- Full SSO flow data patterns ----

  it("validates full SSO flow: provider → account → session → user", async () => {
    const { api } = setup();

    // Step 1: SSO provider exists
    await api.crud.create("ssoProvider", {
      id: "sso-flow-provider",
      issuer: "https://idp.flowtest.com",
      domain: "flowtest.com",
      clientId: "flow-client",
      clientSecret: "flow-secret",
      idpMetadata: JSON.stringify({ sso: "https://idp.flowtest.com/sso" }),
      type: "saml",
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Step 2: SAML response stored in verification
    await api.crud.create("verification", {
      id: "saml-flow-1",
      identifier: "saml-response:flow-req-1",
      value: JSON.stringify({
        nameId: "alice@flowtest.com",
        attributes: { email: "alice@flowtest.com", name: "Alice Flow" },
      }),
      expiresAt: Date.now() + 300000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Step 3: User created (or found)
    const user = await createTestUser(api, {
      id: "sso-flow-user",
      email: "alice@flowtest.com",
      name: "Alice Flow",
    });

    // Step 4: Account linked
    await api.crud.create("account", {
      id: "acct-sso-flow",
      userId: user.id as string,
      accountId: "alice@flowtest.com",
      providerId: "sso:sso-flow-provider",
      idToken: "jwt-token-here",
      expiresAt: Date.now() + 3600000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Step 5: Session created with SSO reference
    const session = await createTestSession(api, user.id as string, {
      ssoProviderId: "sso-flow-provider",
    });

    // Step 6: Verify the full chain works
    const result = await api.hotPath.getSessionWithUserByToken({
      token: session.token as string,
      now: Date.now(),
    });

    expect(result.session).not.toBeNull();
    expect(result.user).not.toBeNull();
    expect(result.user!.email).toBe("alice@flowtest.com");
    expect(result.session!.ssoProviderId).toBe("sso-flow-provider");

    // Verify account lookup
    const account = await api.crud.findOne("account", [
      { field: "providerId", value: "sso:sso-flow-provider" },
      { field: "userId", value: user.id as string },
    ]);
    expect(account).not.toBeNull();

    // Verify SAML assertion cleanup
    await api.crud.deleteOne({
      model: "verification",
      where: [{ field: "identifier", value: "saml-response:flow-req-1" }],
    });
    const cleaned = await api.crud.findOne("verification", [
      { field: "identifier", value: "saml-response:flow-req-1" },
    ]);
    expect(cleaned).toBeNull();
  });

  it("disables an SSO provider", async () => {
    const { api } = setup();

    await api.crud.create("ssoProvider", {
      id: "sso-disable",
      issuer: "https://idp.disable.com",
      domain: "disable.com",
      clientId: "client-disable",
      clientSecret: "secret-disable",
      idpMetadata: "{}",
      type: "saml",
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const updated = await api.crud.updateOne({
      model: "ssoProvider",
      where: [{ field: "id", value: "sso-disable" }],
      update: { enabled: false, updatedAt: Date.now() },
    });

    expect(updated).not.toBeNull();
    expect(updated!.enabled).toBe(false);

    // Verify lookup by domain still works
    const found = await api.crud.findOne("ssoProvider", [
      { field: "domain", value: "disable.com" },
    ]);
    expect(found).not.toBeNull();
    expect(found!.enabled).toBe(false);
  });

  it("finds SSO provider by issuer URL", async () => {
    const { api } = setup();

    await api.crud.create("ssoProvider", {
      id: "sso-issuer-lookup",
      issuer: "https://unique-issuer.idp.com/realms/main",
      domain: "issuer-test.com",
      clientId: "client-123",
      clientSecret: "secret-123",
      idpMetadata: "{}",
      type: "oidc",
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const found = await api.crud.findOne("ssoProvider", [
      { field: "issuer", value: "https://unique-issuer.idp.com/realms/main" },
    ]);
    expect(found).not.toBeNull();
    expect(found!.domain).toBe("issuer-test.com");
  });
});
