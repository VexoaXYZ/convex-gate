import { describe, expect, it, vi } from "vitest";
import { createConvexGateClient, type SessionSnapshot } from "../../src/client/index.js";

describe("createConvexGateClient", () => {
  it("caches session reads until cleared", async () => {
    const session: SessionSnapshot = {
      sessionId: "session-1",
      userId: "user-1",
      token: "token-1",
      expiresAt: Date.now() + 60_000,
    };
    const transport = {
      getSession: vi.fn(async () => session),
      getToken: vi.fn(async () => "token-1"),
      clearSession: vi.fn(async () => undefined),
    };

    const client = createConvexGateClient({ transport });

    const first = await client.getSession();
    const second = await client.getSession();

    expect(first).toEqual(session);
    expect(second).toEqual(session);
    expect(transport.getSession).toHaveBeenCalledTimes(1);
  });

  it("reuses cached token unless force refresh is requested", async () => {
    const transport = {
      getSession: vi.fn(async () => null),
      getToken: vi
        .fn<() => Promise<string | null>>()
        .mockResolvedValueOnce("token-1")
        .mockResolvedValueOnce("token-2"),
      clearSession: vi.fn(async () => undefined),
    };

    const client = createConvexGateClient({ transport });

    const first = await client.getToken();
    const second = await client.getToken();
    const third = await client.getToken({ forceRefresh: true });

    expect(first).toBe("token-1");
    expect(second).toBe("token-1");
    expect(third).toBe("token-2");
    expect(transport.getToken).toHaveBeenCalledTimes(2);
  });

  it("clears cache on sign out", async () => {
    const transport = {
      getSession: vi
        .fn<() => Promise<SessionSnapshot | null>>()
        .mockResolvedValueOnce({
          sessionId: "session-1",
          userId: "user-1",
          token: "token-1",
          expiresAt: Date.now() + 60_000,
        })
        .mockResolvedValueOnce({
          sessionId: "session-2",
          userId: "user-1",
          token: "token-2",
          expiresAt: Date.now() + 60_000,
        }),
      getToken: vi.fn(async () => "token-1"),
      clearSession: vi.fn(async () => undefined),
    };

    const client = createConvexGateClient({ transport });

    await client.getSession();
    await client.signOut();
    const next = await client.getSession();

    expect(transport.clearSession).toHaveBeenCalledTimes(1);
    expect(transport.getSession).toHaveBeenCalledTimes(2);
    expect(next?.sessionId).toBe("session-2");
  });
});
