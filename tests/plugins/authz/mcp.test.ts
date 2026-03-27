import { describe, expect, it } from "vitest";
import { setup, createTestUser, createTestSession } from "../../helpers/mock-db.js";

describe("plugin: mcp — CRUD compatibility", () => {
  it("creates a standard user that works alongside MCP plugin (no DB changes)", async () => {
    const { api } = setup();
    const user = await createTestUser(api, {
      id: "mcp-user-1",
      email: "mcp@example.com",
      name: "MCP User",
    });

    expect(user.id).toBe("mcp-user-1");
    expect(user.email).toBe("mcp@example.com");

    // MCP is a pure logic plugin — user model should be unmodified
    const found = await api.crud.findOne("user", [{ field: "id", value: "mcp-user-1" }]);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("MCP User");
  });

  it("creates a session that works alongside MCP plugin", async () => {
    const { api } = setup();
    await createTestUser(api, { id: "mcp-sess-user" });

    const session = await createTestSession(api, "mcp-sess-user");
    expect(session.userId).toBe("mcp-sess-user");
    expect(session.token).toBeDefined();

    // Session should be retrievable normally
    const found = await api.crud.findOne("session", [
      { field: "userId", value: "mcp-sess-user" },
    ]);
    expect(found).not.toBeNull();
  });

  it("stores MCP-specific metadata fields on session", async () => {
    const { api } = setup();
    await createTestUser(api, { id: "mcp-meta-user" });

    const session = await createTestSession(api, "mcp-meta-user", {
      mcpServerId: "mcp-server-prod-1",
      mcpTransport: "streamable-http",
      mcpCapabilities: JSON.stringify(["tools", "resources", "prompts"]),
    });

    expect(session.mcpServerId).toBe("mcp-server-prod-1");
    expect(session.mcpTransport).toBe("streamable-http");

    const capabilities = JSON.parse(session.mcpCapabilities as string);
    expect(capabilities).toContain("tools");
    expect(capabilities).toContain("resources");
  });

  it("session with MCP metadata resolves correctly via hot path", async () => {
    const { api } = setup();
    await createTestUser(api, { id: "mcp-hp-user", email: "mcp-hp@example.com" });

    const session = await createTestSession(api, "mcp-hp-user", {
      mcpServerId: "mcp-server-1",
      mcpSessionId: "mcp-session-abc",
    });

    const result = await api.hotPath.getSessionWithUserByToken({
      token: session.token as string,
      now: Date.now(),
    });

    expect(result.session).not.toBeNull();
    expect(result.user).not.toBeNull();
    expect(result.user!.email).toBe("mcp-hp@example.com");
    expect(result.session!.mcpServerId).toBe("mcp-server-1");
    expect(result.session!.mcpSessionId).toBe("mcp-session-abc");
  });

  it("updates MCP metadata fields on an existing session", async () => {
    const { api } = setup();
    await createTestUser(api, { id: "mcp-update-user" });

    const session = await createTestSession(api, "mcp-update-user", {
      mcpServerId: "mcp-server-old",
      mcpTransport: "sse",
    });

    const updated = await api.crud.updateOne({
      model: "session",
      where: [{ field: "id", value: session.id as string }],
      update: {
        mcpServerId: "mcp-server-new",
        mcpTransport: "streamable-http",
        updatedAt: Date.now(),
      },
    });

    expect(updated).not.toBeNull();
    expect(updated!.mcpServerId).toBe("mcp-server-new");
    expect(updated!.mcpTransport).toBe("streamable-http");
  });

  it("MCP sessions can coexist with regular sessions for the same user", async () => {
    const { api } = setup();
    await createTestUser(api, { id: "mcp-coexist-user" });

    // Regular session
    await createTestSession(api, "mcp-coexist-user", {
      id: "regular-sess",
    });

    // MCP session
    await createTestSession(api, "mcp-coexist-user", {
      id: "mcp-sess",
      mcpServerId: "mcp-server-1",
      mcpTransport: "streamable-http",
    });

    const allSessions = await api.crud.findMany(
      "session",
      [{ field: "userId", value: "mcp-coexist-user" }],
      { limit: 100 },
    );

    expect(allSessions).toHaveLength(2);

    const mcpSession = allSessions.find((s) => s.mcpServerId === "mcp-server-1");
    const regularSession = allSessions.find((s) => !s.mcpServerId);
    expect(mcpSession).toBeDefined();
    expect(regularSession).toBeDefined();
  });
});
