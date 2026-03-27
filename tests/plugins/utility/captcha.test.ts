import { describe, expect, it } from "vitest";
import { setup, createTestUser } from "../../helpers/mock-db.js";

describe("plugin: captcha — pure logic, no DB schema changes", () => {
  it("user creation works normally alongside captcha plugin", async () => {
    const { api } = setup();
    const user = await createTestUser(api, {
      id: "captcha-user",
      email: "captcha@example.com",
      name: "Captcha User",
    });
    expect(user.id).toBe("captcha-user");
    expect(user.email).toBe("captcha@example.com");
  });

  it("session creation works normally alongside captcha plugin", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "captcha-sess-user" });
    const session = await api.crud.create("session", {
      id: "captcha-sess",
      userId: user.id as string,
      token: "captcha-session-tok",
      expiresAt: Date.now() + 86400000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    expect(session.userId).toBe("captcha-sess-user");

    const found = await api.crud.findOne("session", [
      { field: "token", value: "captcha-session-tok" },
    ]);
    expect(found).not.toBeNull();
  });

  it("account creation works normally alongside captcha plugin", async () => {
    const { api } = setup();
    const account = await api.crud.create("account", {
      id: "captcha-acct",
      userId: "captcha-user",
      accountId: "email:captcha@example.com",
      providerId: "credential",
      password: "hashed-password",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    expect(account.providerId).toBe("credential");
  });
});
