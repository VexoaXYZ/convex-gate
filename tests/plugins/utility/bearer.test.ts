import { describe, expect, it } from "vitest";
import { setup, createTestUser, createTestSession } from "../../helpers/mock-db.js";

describe("plugin: bearer — session token lookup", () => {
  it("resolves session by bearer token via hot path", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "bearer-user", email: "bearer@example.com" });
    const session = await createTestSession(api, user.id as string, {
      id: "bearer-sess",
      token: "bearer-tok-abc123",
    });

    const result = await api.hotPath.getSessionWithUserByToken({
      token: "bearer-tok-abc123",
      now: Date.now(),
    });
    expect(result.session).not.toBeNull();
    expect(result.session!.id).toBe("bearer-sess");
    expect(result.user).not.toBeNull();
    expect(result.user!.email).toBe("bearer@example.com");
  });

  it("returns null for non-existent bearer token", async () => {
    const { api } = setup();

    const result = await api.hotPath.getSessionWithUserByToken({
      token: "bearer-nonexistent-token",
      now: Date.now(),
    });
    expect(result.session).toBeNull();
    expect(result.user).toBeNull();
  });

  it("handles various bearer token format strings", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "fmt-user" });

    // Long token with special characters (base64-like)
    const longToken = "eyJhbGciOiJIUzI1NiJ9.dGVzdA.Kz3P8f0nE_abc-def_GHI";
    await createTestSession(api, user.id as string, {
      id: "fmt-sess",
      token: longToken,
    });

    const result = await api.hotPath.getSessionWithUserByToken({
      token: longToken,
      now: Date.now(),
    });
    expect(result.session).not.toBeNull();
    expect(result.session!.token).toBe(longToken);
  });
});
