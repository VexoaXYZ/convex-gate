import { describe, expect, it } from "vitest";
import { createInMemoryAuthComponent } from "../../src/component/runtime.js";
import { createComponentBindings } from "../../src/component/bindings.js";

describe("createComponentBindings", () => {
  it("forwards hot-path calls to the component runtime", async () => {
    const api = createInMemoryAuthComponent({
      initialState: {
        user: [{ id: "user-1", email: "user@example.com" }],
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
    const bindings = createComponentBindings(api);

    const result = await bindings.hotPath.getSessionWithUserByToken({
      token: "token-1",
      now: Date.now(),
    });

    expect(result.session?.id).toBe("session-1");
    expect(result.user?.id).toBe("user-1");
  });

  it("forwards session-only hot-path calls to the component runtime", async () => {
    const api = createInMemoryAuthComponent({
      initialState: {
        user: [{ id: "user-1", email: "user@example.com" }],
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
    const bindings = createComponentBindings(api);

    const result = await bindings.hotPath.getSessionBySessionId({
      sessionId: "session-1",
    });

    expect(result?.id).toBe("session-1");
  });

  it("forwards CRUD calls to the component runtime", async () => {
    const api = createInMemoryAuthComponent();
    const bindings = createComponentBindings(api);

    await bindings.crud.create("verification", {
      id: "verification-1",
      identifier: "user@example.com",
      value: "otp",
      expiresAt: Date.now() + 60_000,
    });

    const found = await bindings.crud.findOne("verification", [
      { field: "id", value: "verification-1", operator: "eq", connector: "AND" },
    ]);

    expect(found?.id).toBe("verification-1");
  });
});
