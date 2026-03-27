import { describe, expect, it } from "vitest";
import { setup, createTestUser, createTestSession } from "../../helpers/mock-db.js";

describe("plugin: last-login-method — session login provider tracking", () => {
  it("creates session with lastLoginMethod field", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "llm-user" });
    const session = await api.crud.create("session", {
      id: "llm-sess-1",
      userId: user.id as string,
      token: "llm-tok-1",
      expiresAt: Date.now() + 86400000,
      lastLoginMethod: "credential",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    expect(session.lastLoginMethod).toBe("credential");
  });

  it("updates session with new login method on re-auth", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "llm-reauth-user" });
    await api.crud.create("session", {
      id: "llm-reauth-sess",
      userId: user.id as string,
      token: "llm-reauth-tok",
      expiresAt: Date.now() + 86400000,
      lastLoginMethod: "credential",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const updated = await api.crud.updateOne({
      model: "session",
      where: [{ field: "id", value: "llm-reauth-sess" }],
      update: { lastLoginMethod: "google", updatedAt: Date.now() },
    });
    expect(updated!.lastLoginMethod).toBe("google");
  });

  it("session without lastLoginMethod still resolves via hot path", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "llm-compat-user", email: "compat@example.com" });
    await createTestSession(api, user.id as string, {
      id: "llm-compat-sess",
      token: "llm-compat-tok",
    });

    const result = await api.hotPath.getSessionWithUserByToken({
      token: "llm-compat-tok",
      now: Date.now(),
    });
    expect(result.session).not.toBeNull();
    expect(result.user!.email).toBe("compat@example.com");
    // lastLoginMethod was not set, should be undefined
    expect(result.session!.lastLoginMethod).toBeUndefined();
  });

  it("stores various provider names as login methods", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "llm-providers-user" });

    const providers = ["credential", "google", "github", "apple", "passkey", "magic-link"];
    for (let i = 0; i < providers.length; i++) {
      await api.crud.create("session", {
        id: `llm-prov-sess-${i}`,
        userId: user.id as string,
        token: `llm-prov-tok-${i}`,
        expiresAt: Date.now() + 86400000,
        lastLoginMethod: providers[i],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    const sessions = await api.crud.findMany(
      "session",
      [{ field: "userId", value: "llm-providers-user" }],
      { limit: 100 },
    );
    expect(sessions).toHaveLength(providers.length);
    const methods = sessions.map((s) => s.lastLoginMethod);
    expect(methods).toEqual(expect.arrayContaining(providers));
  });
});
