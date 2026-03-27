import { describe, expect, it } from "vitest";
import { setup, createTestUser, createTestSession } from "../../helpers/mock-db.js";

describe("plugin: multi-session — multiple active sessions per user", () => {
  it("creates multiple active sessions for a single user", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "multi-user" });

    await createTestSession(api, user.id as string, { id: "ms-1", token: "ms-tok-1" });
    await createTestSession(api, user.id as string, { id: "ms-2", token: "ms-tok-2" });
    await createTestSession(api, user.id as string, { id: "ms-3", token: "ms-tok-3" });

    const sessions = await api.crud.findMany(
      "session",
      [{ field: "userId", value: "multi-user" }],
      { limit: 100 },
    );
    expect(sessions).toHaveLength(3);
  });

  it("each session is independently resolvable by token", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "multi-resolve-user", email: "multi@example.com" });

    await createTestSession(api, user.id as string, { id: "mr-1", token: "mr-tok-1" });
    await createTestSession(api, user.id as string, { id: "mr-2", token: "mr-tok-2" });

    const result1 = await api.hotPath.getSessionWithUserByToken({
      token: "mr-tok-1",
      now: Date.now(),
    });
    const result2 = await api.hotPath.getSessionWithUserByToken({
      token: "mr-tok-2",
      now: Date.now(),
    });

    expect(result1.session!.id).toBe("mr-1");
    expect(result2.session!.id).toBe("mr-2");
    expect(result1.user!.email).toBe("multi@example.com");
    expect(result2.user!.email).toBe("multi@example.com");
  });

  it("invalidating one session does not affect others", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "multi-inv-user", email: "inv@example.com" });

    await createTestSession(api, user.id as string, { id: "mi-1", token: "mi-tok-1" });
    await createTestSession(api, user.id as string, { id: "mi-2", token: "mi-tok-2" });
    await createTestSession(api, user.id as string, { id: "mi-3", token: "mi-tok-3" });

    // Invalidate only the second session
    await api.hotPath.invalidateSession({ sessionId: "mi-2" });

    const result1 = await api.hotPath.getSessionWithUserByToken({
      token: "mi-tok-1",
      now: Date.now(),
    });
    const result2 = await api.hotPath.getSessionWithUserByToken({
      token: "mi-tok-2",
      now: Date.now(),
    });
    const result3 = await api.hotPath.getSessionWithUserByToken({
      token: "mi-tok-3",
      now: Date.now(),
    });

    expect(result1.session).not.toBeNull();
    expect(result2.session).toBeNull();
    expect(result3.session).not.toBeNull();
  });

  it("counts sessions per user correctly", async () => {
    const { api } = setup();
    const user1 = await createTestUser(api, { id: "count-user-1", email: "count1@example.com" });
    const user2 = await createTestUser(api, { id: "count-user-2", email: "count2@example.com" });

    await createTestSession(api, user1.id as string, { id: "cu1-s1", token: "cu1-t1" });
    await createTestSession(api, user1.id as string, { id: "cu1-s2", token: "cu1-t2" });
    await createTestSession(api, user1.id as string, { id: "cu1-s3", token: "cu1-t3" });
    await createTestSession(api, user2.id as string, { id: "cu2-s1", token: "cu2-t1" });

    const count1 = await api.crud.count("session", [{ field: "userId", value: "count-user-1" }]);
    const count2 = await api.crud.count("session", [{ field: "userId", value: "count-user-2" }]);

    expect(count1).toBe(3);
    expect(count2).toBe(1);
  });

  it("invalidateUserSessions clears all sessions for one user", async () => {
    const { api } = setup();
    const user1 = await createTestUser(api, { id: "nuke-user-1", email: "nuke1@example.com" });
    const user2 = await createTestUser(api, { id: "nuke-user-2", email: "nuke2@example.com" });

    await createTestSession(api, user1.id as string, { id: "nk1-s1", token: "nk1-t1" });
    await createTestSession(api, user1.id as string, { id: "nk1-s2", token: "nk1-t2" });
    await createTestSession(api, user2.id as string, { id: "nk2-s1", token: "nk2-t1" });

    const deleted = await api.hotPath.invalidateUserSessions({ userId: "nuke-user-1" });
    expect(deleted).toBe(2);

    // User 2 session still alive
    const result = await api.hotPath.getSessionWithUserByToken({
      token: "nk2-t1",
      now: Date.now(),
    });
    expect(result.session).not.toBeNull();
    expect(result.user!.id).toBe("nuke-user-2");
  });
});
