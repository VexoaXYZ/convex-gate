import { describe, expect, it } from "vitest";
import { createInMemoryAuthComponent } from "../../src/component/runtime.js";
import { createComponentStore } from "../../src/component/store.js";

describe("createInMemoryAuthComponent", () => {
  it("resolves an active session with its user by token", async () => {
    const component = createInMemoryAuthComponent({
      initialState: {
        user: [
          {
            id: "user-1",
            email: "user@example.com",
          },
        ],
        session: [
          {
            id: "session-1",
            userId: "user-1",
            token: "token-1",
            expiresAt: Date.now() + 60_000,
          },
        ],
      },
    });

    const result = await component.hotPath.getSessionWithUserByToken({
      token: "token-1",
      now: Date.now(),
    });

    expect(result.session?.id).toBe("session-1");
    expect(result.user?.id).toBe("user-1");
  });

  it("returns a session on the session-only hot path without a user payload", async () => {
    const component = createInMemoryAuthComponent({
      initialState: {
        user: [
          {
            id: "user-1",
            email: "user@example.com",
          },
        ],
        session: [
          {
            id: "session-1",
            userId: "user-1",
            token: "token-1",
            expiresAt: Date.now() + 60_000,
          },
        ],
      },
    });

    const result = await component.hotPath.getSessionByToken({
      token: "token-1",
    });

    expect(result).toMatchObject({
      id: "session-1",
      token: "token-1",
    });
    expect(result).not.toHaveProperty("user");
  });

  it("returns null on the session-only hot path for expired sessions", async () => {
    const component = createInMemoryAuthComponent({
      initialState: {
        user: [
          {
            id: "user-1",
            email: "user@example.com",
          },
        ],
        session: [
          {
            id: "session-1",
            userId: "user-1",
            token: "token-1",
            expiresAt: Date.now() - 60_000,
          },
        ],
      },
    });

    const result = await component.hotPath.getSessionByToken({
      token: "token-1",
    });

    expect(result).toBeNull();
  });

  it("invalidates all sessions for a user", async () => {
    const component = createInMemoryAuthComponent({
      initialState: {
        session: [
          {
            id: "session-1",
            userId: "user-1",
            token: "token-1",
            expiresAt: Date.now() + 60_000,
          },
          {
            id: "session-2",
            userId: "user-1",
            token: "token-2",
            expiresAt: Date.now() + 60_000,
          },
        ],
      },
    });

    const count = await component.hotPath.invalidateUserSessions({
      userId: "user-1",
    });

    expect(count).toBe(2);
    const remaining = await component.crud.count("session", []);
    expect(remaining).toBe(0);
  });

  it("supports CRUD and store-level hot path behavior together", async () => {
    const component = createInMemoryAuthComponent({
      initialState: {
        user: [
          {
            id: "user-1",
            email: "user@example.com",
          },
        ],
        session: [
          {
            id: "session-1",
            userId: "user-1",
            token: "token-1",
            expiresAt: Date.now() + 60_000,
          },
        ],
      },
    });
    const store = createComponentStore(component);

    const session = await store.findOne({
      model: "session",
      where: [{ field: "token", value: "token-1", operator: "eq", connector: "AND" }],
    });
    expect(session).toMatchObject({
      id: "session-1",
      token: "token-1",
    });
    expect(session).not.toHaveProperty("user");

    await store.create({
      model: "verification",
      data: {
        id: "verification-1",
        identifier: "user@example.com",
        value: "otp",
        expiresAt: Date.now() + 60_000,
      },
    });

    const verification = await component.crud.findOne("verification", [
      { field: "id", value: "verification-1", operator: "eq", connector: "AND" },
    ]);
    expect(verification?.id).toBe("verification-1");
  });

  it("finds social accounts by providerId and accountId", async () => {
    const component = createInMemoryAuthComponent({
      initialState: {
        account: [
          {
            id: "account-1",
            userId: "user-1",
            providerId: "discord",
            accountId: "discord-user-1",
            accessToken: "token-1",
          },
          {
            id: "account-2",
            userId: "user-2",
            providerId: "github",
            accountId: "discord-user-1",
            accessToken: "token-2",
          },
        ],
      },
    });

    const account = await component.crud.findOne("account", [
      { field: "providerId", value: "discord", operator: "eq", connector: "AND" },
      { field: "accountId", value: "discord-user-1", operator: "eq", connector: "AND" },
    ]);

    expect(account).toMatchObject({
      id: "account-1",
      userId: "user-1",
      providerId: "discord",
      accountId: "discord-user-1",
    });
  });
});
