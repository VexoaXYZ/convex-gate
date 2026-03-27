import { describe, expect, it } from "vitest";
import { setup, createTestUser } from "../../helpers/mock-db.js";

describe("plugin: agent-auth — agent token management", () => {
  it("creates agent token record with scope and expiry", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "agent-owner", email: "agent@example.com" });

    const agentToken = await api.crud.create("agentToken", {
      id: "at-1",
      userId: user.id as string,
      name: "CI Bot",
      token: "agt_secure_random_token_abc123",
      scope: "read:data write:data",
      expiresAt: Date.now() + 7776000000, // 90 days
      lastUsedAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(agentToken.name).toBe("CI Bot");
    expect(agentToken.scope).toBe("read:data write:data");
    expect(agentToken.expiresAt).toBeGreaterThan(Date.now());
  });

  it("finds agent token by token value for authentication", async () => {
    const { api } = setup();
    await createTestUser(api, { id: "agent-auth-user" });
    await api.crud.create("agentToken", {
      id: "at-find-1",
      userId: "agent-auth-user",
      name: "Deploy Bot",
      token: "agt_find_me_token",
      scope: "deploy:*",
      expiresAt: Date.now() + 86400000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const found = await api.crud.findOne("agentToken", [
      { field: "token", value: "agt_find_me_token" },
    ]);
    expect(found).not.toBeNull();
    expect(found!.userId).toBe("agent-auth-user");
    expect(found!.scope).toBe("deploy:*");
  });

  it("revokes agent token by deletion", async () => {
    const { api } = setup();
    await createTestUser(api, { id: "revoke-user" });
    await api.crud.create("agentToken", {
      id: "at-revoke-1",
      userId: "revoke-user",
      name: "Temp Bot",
      token: "agt_revoke_me",
      scope: "read:*",
      expiresAt: Date.now() + 86400000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await api.crud.deleteOne({
      model: "agentToken",
      where: [{ field: "id", value: "at-revoke-1" }],
    });

    const found = await api.crud.findOne("agentToken", [
      { field: "token", value: "agt_revoke_me" },
    ]);
    expect(found).toBeNull();
  });

  it("supports multiple agent tokens per user", async () => {
    const { api } = setup();
    const user = await createTestUser(api, { id: "multi-agent-user" });

    await api.crud.create("agentToken", {
      id: "mat-1",
      userId: user.id as string,
      name: "CI Bot",
      token: "agt_ci_token",
      scope: "read:* write:*",
      expiresAt: Date.now() + 86400000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await api.crud.create("agentToken", {
      id: "mat-2",
      userId: user.id as string,
      name: "Monitoring Bot",
      token: "agt_monitor_token",
      scope: "read:metrics",
      expiresAt: Date.now() + 86400000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await api.crud.create("agentToken", {
      id: "mat-3",
      userId: user.id as string,
      name: "Backup Bot",
      token: "agt_backup_token",
      scope: "read:data backup:*",
      expiresAt: Date.now() + 86400000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const tokens = await api.crud.findMany(
      "agentToken",
      [{ field: "userId", value: "multi-agent-user" }],
      { limit: 100 },
    );
    expect(tokens).toHaveLength(3);

    const names = tokens.map((t) => t.name);
    expect(names).toContain("CI Bot");
    expect(names).toContain("Monitoring Bot");
    expect(names).toContain("Backup Bot");
  });

  it("updates lastUsedAt on token usage", async () => {
    const { api } = setup();
    await createTestUser(api, { id: "usage-user" });
    await api.crud.create("agentToken", {
      id: "at-usage-1",
      userId: "usage-user",
      name: "API Bot",
      token: "agt_usage_token",
      scope: "api:*",
      expiresAt: Date.now() + 86400000,
      lastUsedAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const now = Date.now();
    const updated = await api.crud.updateOne({
      model: "agentToken",
      where: [{ field: "token", value: "agt_usage_token" }],
      update: { lastUsedAt: now },
    });
    expect(updated!.lastUsedAt).toBe(now);
  });
});
