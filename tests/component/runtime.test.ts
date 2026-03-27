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
});
