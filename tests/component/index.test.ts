import { describe, expect, it, vi } from "vitest";
import { createComponentStore, createResolvedSessionResult } from "../../src/component/store.js";
import type {
  AuthComponentApi,
  AuthComponentSession,
  AuthComponentUser,
} from "./index.js";

function createApi() {
  const user: AuthComponentUser = {
    id: "user-1",
    email: "user@example.com",
  };
  const session: AuthComponentSession = {
    id: "session-1",
    userId: "user-1",
    token: "token-1",
    expiresAt: Date.now() + 60_000,
  };

  const api: AuthComponentApi = {
    hotPath: {
      getSessionByToken: vi.fn(async () => session),
      getSessionBySessionId: vi.fn(async () => session),
      getSessionWithUserByToken: vi.fn(async () => ({ session, user })),
      getSessionWithUserBySessionId: vi.fn(async () => ({ session, user })),
      invalidateSession: vi.fn(async () => undefined),
      invalidateUserSessions: vi.fn(async () => 1),
    },
    crud: {
      create: vi.fn(async (_model, data) => data),
      findOne: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      updateOne: vi.fn(async () => null),
      updateMany: vi.fn(async () => 0),
      deleteOne: vi.fn(async () => undefined),
      deleteMany: vi.fn(async () => 0),
    },
  };

  return { api, session, user };
}

describe("component hot path", () => {
  it("returns nulls for expired sessions", () => {
    const result = createResolvedSessionResult({
      session: {
        id: "session-1",
        userId: "user-1",
        token: "token-1",
        expiresAt: 10,
      },
      user: {
        id: "user-1",
      },
      now: 20,
    });

    expect(result).toEqual({
      session: null,
      user: null,
    });
  });
});

describe("createComponentStore", () => {
  it("uses the hot path for session lookup by token", async () => {
    const { api } = createApi();
    const store = createComponentStore(api);

    const result = await store.findOne({
      model: "session",
      where: [{ field: "token", value: "token-1", operator: "eq", connector: "AND" }],
    });

    expect(api.hotPath.getSessionByToken).toHaveBeenCalledTimes(1);
    expect(api.hotPath.getSessionWithUserByToken).not.toHaveBeenCalled();
    expect(api.crud.findOne).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: "session-1",
      token: "token-1",
    });
  });

  it("returns null for an expired session even without selecting user", async () => {
    const { api, session } = createApi();
    const expiredSession = {
      ...session,
      expiresAt: Date.now() - 1_000,
    };
    api.hotPath.getSessionByToken = vi.fn(async () => null);
    api.hotPath.getSessionWithUserByToken = vi.fn(async () => ({
      session: null,
      user: null,
    }));
    const store = createComponentStore(api);

    const result = await store.findOne({
      model: "session",
      where: [{ field: "token", value: "token-1", operator: "eq", connector: "AND" }],
    });

    expect(api.hotPath.getSessionByToken).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
    void expiredSession;
  });

  it("uses the session+user hot path when the caller selects user", async () => {
    const { api } = createApi();
    const store = createComponentStore(api);

    const result = await store.findOne({
      model: "session",
      where: [{ field: "token", value: "token-1", operator: "eq", connector: "AND" }],
      select: ["id", "token", "user"],
    });

    expect(api.hotPath.getSessionWithUserByToken).toHaveBeenCalledTimes(1);
    expect(api.hotPath.getSessionByToken).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: "session-1",
      token: "token-1",
      user: {
        id: "user-1",
      },
    });
  });

  it("uses the hot path for session invalidation by session id", async () => {
    const { api } = createApi();
    const store = createComponentStore(api);

    await store.deleteOne({
      model: "session",
      where: [{ field: "id", value: "session-1", operator: "eq", connector: "AND" }],
    });

    expect(api.hotPath.invalidateSession).toHaveBeenCalledWith({
      sessionId: "session-1",
    });
    expect(api.crud.deleteOne).not.toHaveBeenCalled();
  });
});
