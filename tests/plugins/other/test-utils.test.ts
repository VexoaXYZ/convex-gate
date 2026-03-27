import { describe, expect, it } from "vitest";
import { setup, createTestUser, createTestSession } from "../../helpers/mock-db.js";

describe("plugin: test-utils — test user creation through adapter", () => {
  it("creates test user via adapter helpers", async () => {
    const { api } = setup();
    const user = await createTestUser(api, {
      id: "test-util-user",
      email: "testutil@example.com",
      name: "Test Util User",
    });
    expect(user.id).toBe("test-util-user");
    expect(user.email).toBe("testutil@example.com");

    // Verify retrievable via CRUD
    const found = await api.crud.findOne("user", [{ field: "id", value: "test-util-user" }]);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Test Util User");
  });

  it("creates test session linked to test user", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "tu-sess-user", email: "tusess@example.com" });
    const session = await createTestSession(api, user.id as string);

    expect(session.userId).toBe("tu-sess-user");
    expect(session.token).toBeDefined();
    expect(session.expiresAt).toBeGreaterThan(Date.now());

    // Verify hot path works with test-created data
    const result = await api.hotPath.getSessionWithUserByToken({
      token: session.token as string,
      now: Date.now(),
    });
    expect(result.session).not.toBeNull();
    expect(result.user!.email).toBe("tusess@example.com");
  });

  it("test user with custom overrides stores all fields", async () => {
    const { api } = setup();
    const user = await createTestUser(api, {
      id: "tu-custom",
      email: "custom@example.com",
      name: "Custom Test User",
      role: "admin",
      banned: false,
      twoFactorEnabled: true,
      stripeCustomerId: "cus_test_123",
      locale: "ja-JP",
    });

    expect(user.role).toBe("admin");
    expect(user.twoFactorEnabled).toBe(true);
    expect(user.stripeCustomerId).toBe("cus_test_123");
    expect(user.locale).toBe("ja-JP");
  });
});
