import { describe, expect, it, vi } from "vitest";
import type { BetterAuthOptions } from "better-auth";
import { createComponentBackedAdapter } from "../../src/adapter/componentStore.js";
import type { AuthComponentApi } from "../../src/component/index.js";

function createComponent(): AuthComponentApi {
  return {
    hotPath: {
      getSessionWithUserByToken: vi.fn(async () => ({
        session: {
          id: "session-1",
          userId: "user-1",
          token: "token-1",
          expiresAt: Date.now() + 60_000,
        },
        user: {
          id: "user-1",
          email: "user@example.com",
        },
      })),
      getSessionWithUserBySessionId: vi.fn(async () => ({
        session: {
          id: "session-1",
          userId: "user-1",
          token: "token-1",
          expiresAt: Date.now() + 60_000,
        },
        user: {
          id: "user-1",
          email: "user@example.com",
        },
      })),
      invalidateSession: vi.fn(async () => undefined),
      invalidateUserSessions: vi.fn(async () => 1),
    },
    crud: {
      create: vi.fn(async (_model, data) => ({ ...data, _id: "created-id" })),
      findOne: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      updateOne: vi.fn(async () => null),
      updateMany: vi.fn(async () => 0),
      deleteOne: vi.fn(async () => undefined),
      deleteMany: vi.fn(async () => 0),
    },
  };
}

describe("createComponentBackedAdapter", () => {
  it("routes session lookup through the component hot path", async () => {
    const component = createComponent();
    const adapter = createComponentBackedAdapter({ component })(
      {} as BetterAuthOptions
    );

    const result = await adapter.findOne({
      model: "session",
      where: [{ field: "token", value: "token-1" }],
    });

    expect(component.hotPath.getSessionWithUserByToken).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      id: "session-1",
      token: "token-1",
    });
  });
});
