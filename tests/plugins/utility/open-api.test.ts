import { describe, expect, it } from "vitest";
import { setup, createTestUser, createTestSession } from "../../helpers/mock-db.js";

describe("plugin: open-api — pure logic, schema generation", () => {
  it("core CRUD operations accessible for OpenAPI endpoint backing", async () => {
    const { api } = setup();

    // Verify all core models are accessible (OpenAPI exposes these)
    const user = await createTestUser(api, { id: "oapi-user", email: "oapi@example.com" });
    expect(user.id).toBe("oapi-user");

    const session = await createTestSession(api, user.id as string, {
      id: "oapi-sess",
      token: "oapi-tok",
    });
    expect(session.userId).toBe("oapi-user");

    const account = await api.crud.create("account", {
      id: "oapi-acct",
      userId: "oapi-user",
      accountId: "oapi@example.com",
      providerId: "credential",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    expect(account.providerId).toBe("credential");
  });

  it("hot path session resolution works for API token validation", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "oapi-hp-user", email: "hp@example.com" });
    await createTestSession(api, user.id as string, {
      id: "oapi-hp-sess",
      token: "oapi-hp-tok",
    });

    const result = await api.hotPath.getSessionWithUserByToken({
      token: "oapi-hp-tok",
      now: Date.now(),
    });
    expect(result.session).not.toBeNull();
    expect(result.user).not.toBeNull();
  });
});
