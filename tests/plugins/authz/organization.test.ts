import { describe, expect, it } from "vitest";
import { setup, createTestUser } from "../../helpers/mock-db.js";

describe("plugin: organization — CRUD compatibility", () => {
  // ---- Organization table ----

  it("creates an organization with all fields", async () => {
    const { api } = setup();
    const org = await api.crud.create("organization", {
      id: "org-acme",
      name: "Acme Corporation",
      slug: "acme-corp",
      logo: "https://example.com/acme-logo.png",
      metadata: JSON.stringify({ industry: "tech", plan: "enterprise" }),
      createdAt: Date.now(),
    });

    expect(org.name).toBe("Acme Corporation");
    expect(org.slug).toBe("acme-corp");
    expect(org.logo).toBe("https://example.com/acme-logo.png");
    expect(org.metadata).toBeDefined();
    const meta = JSON.parse(org.metadata as string);
    expect(meta.industry).toBe("tech");
  });

  it("creates an organization with null optional fields", async () => {
    const { api } = setup();
    const org = await api.crud.create("organization", {
      id: "org-minimal",
      name: "Minimal Org",
      slug: "minimal-org",
      logo: null,
      metadata: null,
      createdAt: Date.now(),
    });

    expect(org.logo).toBeNull();
    expect(org.metadata).toBeNull();
  });

  // ---- Member table ----

  it("creates a member linking user to organization with role", async () => {
    const { api } = setup();
    await createTestUser(api, { id: "org-owner" });
    await api.crud.create("organization", {
      id: "org-1",
      name: "Test Org",
      slug: "test-org",
      logo: null,
      metadata: null,
      createdAt: Date.now(),
    });

    const member = await api.crud.create("member", {
      id: "mem-owner",
      userId: "org-owner",
      organizationId: "org-1",
      role: "owner",
      createdAt: Date.now(),
    });

    expect(member.userId).toBe("org-owner");
    expect(member.organizationId).toBe("org-1");
    expect(member.role).toBe("owner");
  });

  // ---- Invitation table ----

  it("creates an invitation with all fields", async () => {
    const { api } = setup();
    const expiresAt = Date.now() + 7 * 86400000;
    const invite = await api.crud.create("invitation", {
      id: "inv-1",
      email: "newbie@example.com",
      organizationId: "org-1",
      role: "member",
      inviterId: "org-owner",
      status: "pending",
      expiresAt,
      createdAt: Date.now(),
    });

    expect(invite.email).toBe("newbie@example.com");
    expect(invite.organizationId).toBe("org-1");
    expect(invite.role).toBe("member");
    expect(invite.inviterId).toBe("org-owner");
    expect(invite.status).toBe("pending");
    expect(invite.expiresAt).toBe(expiresAt);
  });

  // ---- Team table ----

  it("creates a team within an organization", async () => {
    const { api } = setup();
    await api.crud.create("organization", {
      id: "org-teams",
      name: "Team Org",
      slug: "team-org",
      logo: null,
      metadata: null,
      createdAt: Date.now(),
    });

    const team = await api.crud.create("team", {
      id: "team-eng",
      name: "Engineering",
      organizationId: "org-teams",
      createdAt: Date.now(),
    });

    expect(team.name).toBe("Engineering");
    expect(team.organizationId).toBe("org-teams");
  });

  // ---- TeamMember table ----

  it("creates a teamMember linking user to team", async () => {
    const { api } = setup();
    await createTestUser(api, { id: "team-user-1" });

    const teamMember = await api.crud.create("teamMember", {
      id: "tm-1",
      userId: "team-user-1",
      teamId: "team-eng",
      createdAt: Date.now(),
    });

    expect(teamMember.userId).toBe("team-user-1");
    expect(teamMember.teamId).toBe("team-eng");

    const found = await api.crud.findOne("teamMember", [
      { field: "userId", value: "team-user-1" },
      { field: "teamId", value: "team-eng" },
    ]);
    expect(found).not.toBeNull();
  });

  // ---- OrganizationRole table (custom permissions) ----

  it("creates an organizationRole with custom permissions", async () => {
    const { api } = setup();
    const role = await api.crud.create("organizationRole", {
      id: "role-billing-admin",
      organizationId: "org-1",
      name: "Billing Admin",
      permissions: JSON.stringify(["billing:read", "billing:write", "invoices:manage"]),
      createdAt: Date.now(),
    });

    expect(role.name).toBe("Billing Admin");
    const perms = JSON.parse(role.permissions as string);
    expect(perms).toContain("billing:read");
    expect(perms).toContain("billing:write");
    expect(perms).toHaveLength(3);
  });

  // ---- Query operations ----

  it("finds all members of an organization", async () => {
    const { api } = setup();
    await api.crud.create("organization", {
      id: "org-findmem",
      name: "Find Members Org",
      slug: "find-members",
      logo: null,
      metadata: null,
      createdAt: Date.now(),
    });

    await api.crud.create("member", {
      id: "fm-1", userId: "u1", organizationId: "org-findmem", role: "owner", createdAt: Date.now(),
    });
    await api.crud.create("member", {
      id: "fm-2", userId: "u2", organizationId: "org-findmem", role: "admin", createdAt: Date.now(),
    });
    await api.crud.create("member", {
      id: "fm-3", userId: "u3", organizationId: "org-findmem", role: "member", createdAt: Date.now(),
    });
    // Member of a different org
    await api.crud.create("member", {
      id: "fm-other", userId: "u4", organizationId: "org-other", role: "member", createdAt: Date.now(),
    });

    const members = await api.crud.findMany(
      "member",
      [{ field: "organizationId", value: "org-findmem" }],
      { limit: 100 },
    );

    expect(members).toHaveLength(3);
    const userIds = members.map((m) => m.userId);
    expect(userIds).toContain("u1");
    expect(userIds).toContain("u2");
    expect(userIds).toContain("u3");
  });

  it("updates a member's role within an organization", async () => {
    const { api } = setup();
    await api.crud.create("member", {
      id: "mem-promote",
      userId: "promote-user",
      organizationId: "org-1",
      role: "member",
      createdAt: Date.now(),
    });

    const updated = await api.crud.updateOne({
      model: "member",
      where: [{ field: "id", value: "mem-promote" }],
      update: { role: "admin" },
    });

    expect(updated).not.toBeNull();
    expect(updated!.role).toBe("admin");
  });

  it("accepts an invitation by updating status", async () => {
    const { api } = setup();
    await api.crud.create("invitation", {
      id: "inv-accept",
      email: "accept@example.com",
      organizationId: "org-1",
      role: "member",
      inviterId: "admin-1",
      status: "pending",
      expiresAt: Date.now() + 86400000,
      createdAt: Date.now(),
    });

    const updated = await api.crud.updateOne({
      model: "invitation",
      where: [{ field: "id", value: "inv-accept" }],
      update: { status: "accepted" },
    });

    expect(updated).not.toBeNull();
    expect(updated!.status).toBe("accepted");

    // Verify persistence
    const found = await api.crud.findOne("invitation", [{ field: "id", value: "inv-accept" }]);
    expect(found!.status).toBe("accepted");
  });

  it("deletes an invitation", async () => {
    const { api } = setup();
    await api.crud.create("invitation", {
      id: "inv-delete",
      email: "delete@example.com",
      organizationId: "org-1",
      role: "member",
      inviterId: "admin-1",
      status: "pending",
      expiresAt: Date.now() + 86400000,
      createdAt: Date.now(),
    });

    await api.crud.deleteOne({
      model: "invitation",
      where: [{ field: "id", value: "inv-delete" }],
    });

    const found = await api.crud.findOne("invitation", [{ field: "id", value: "inv-delete" }]);
    expect(found).toBeNull();
  });

  it("finds members after org and members are both created (cascading)", async () => {
    const { api } = setup();

    // Create org first
    const org = await api.crud.create("organization", {
      id: "org-cascade",
      name: "Cascade Org",
      slug: "cascade-org",
      logo: null,
      metadata: null,
      createdAt: Date.now(),
    });

    // Then create users and members
    await createTestUser(api, { id: "cascade-u1", email: "c1@example.com" });
    await createTestUser(api, { id: "cascade-u2", email: "c2@example.com" });

    await api.crud.create("member", {
      id: "cascade-m1",
      userId: "cascade-u1",
      organizationId: org.id as string,
      role: "owner",
      createdAt: Date.now(),
    });
    await api.crud.create("member", {
      id: "cascade-m2",
      userId: "cascade-u2",
      organizationId: org.id as string,
      role: "member",
      createdAt: Date.now(),
    });

    // Look up the org
    const foundOrg = await api.crud.findOne("organization", [{ field: "id", value: "org-cascade" }]);
    expect(foundOrg).not.toBeNull();

    // Look up members using the org id
    const members = await api.crud.findMany(
      "member",
      [{ field: "organizationId", value: foundOrg!.id }],
      { limit: 100 },
    );
    expect(members).toHaveLength(2);
  });

  it("supports multiple organizations per user", async () => {
    const { api } = setup();
    await createTestUser(api, { id: "multi-org-user", email: "multi@example.com" });

    await api.crud.create("organization", {
      id: "org-a", name: "Org A", slug: "org-a", logo: null, metadata: null, createdAt: Date.now(),
    });
    await api.crud.create("organization", {
      id: "org-b", name: "Org B", slug: "org-b", logo: null, metadata: null, createdAt: Date.now(),
    });
    await api.crud.create("organization", {
      id: "org-c", name: "Org C", slug: "org-c", logo: null, metadata: null, createdAt: Date.now(),
    });

    await api.crud.create("member", {
      id: "mo-a", userId: "multi-org-user", organizationId: "org-a", role: "owner", createdAt: Date.now(),
    });
    await api.crud.create("member", {
      id: "mo-b", userId: "multi-org-user", organizationId: "org-b", role: "admin", createdAt: Date.now(),
    });
    await api.crud.create("member", {
      id: "mo-c", userId: "multi-org-user", organizationId: "org-c", role: "member", createdAt: Date.now(),
    });

    const memberships = await api.crud.findMany(
      "member",
      [{ field: "userId", value: "multi-org-user" }],
      { limit: 100 },
    );

    expect(memberships).toHaveLength(3);
    const orgIds = memberships.map((m) => m.organizationId);
    expect(orgIds).toContain("org-a");
    expect(orgIds).toContain("org-b");
    expect(orgIds).toContain("org-c");
  });

  it("finds pending invitations for an organization", async () => {
    const { api } = setup();
    await api.crud.create("invitation", {
      id: "inv-p1", email: "p1@example.com", organizationId: "org-inv",
      role: "member", inviterId: "admin-1", status: "pending",
      expiresAt: Date.now() + 86400000, createdAt: Date.now(),
    });
    await api.crud.create("invitation", {
      id: "inv-p2", email: "p2@example.com", organizationId: "org-inv",
      role: "admin", inviterId: "admin-1", status: "pending",
      expiresAt: Date.now() + 86400000, createdAt: Date.now(),
    });
    await api.crud.create("invitation", {
      id: "inv-accepted", email: "a@example.com", organizationId: "org-inv",
      role: "member", inviterId: "admin-1", status: "accepted",
      expiresAt: Date.now() + 86400000, createdAt: Date.now(),
    });

    const pending = await api.crud.findMany(
      "invitation",
      [
        { field: "organizationId", value: "org-inv" },
        { field: "status", value: "pending" },
      ],
      { limit: 100 },
    );

    expect(pending).toHaveLength(2);
    expect(pending.every((i) => i.status === "pending")).toBe(true);
  });

  it("counts members in an organization", async () => {
    const { api } = setup();
    await api.crud.create("member", {
      id: "cnt-1", userId: "cu1", organizationId: "org-count", role: "owner", createdAt: Date.now(),
    });
    await api.crud.create("member", {
      id: "cnt-2", userId: "cu2", organizationId: "org-count", role: "member", createdAt: Date.now(),
    });
    await api.crud.create("member", {
      id: "cnt-3", userId: "cu3", organizationId: "org-count", role: "member", createdAt: Date.now(),
    });
    await api.crud.create("member", {
      id: "cnt-other", userId: "cu4", organizationId: "org-different", role: "member", createdAt: Date.now(),
    });

    const count = await api.crud.count("member", [
      { field: "organizationId", value: "org-count" },
    ]);
    expect(count).toBe(3);
  });
});
