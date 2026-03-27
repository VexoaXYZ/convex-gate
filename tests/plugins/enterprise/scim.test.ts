import { describe, expect, it } from "vitest";
import { setup, createTestUser } from "../../helpers/mock-db.js";

describe("plugin: scim — CRUD compatibility", () => {
  it("creates a user via SCIM provisioning with externalId", async () => {
    const { api } = setup();
    const user = await createTestUser(api, {
      id: "scim-user-1",
      email: "scim-provisioned@acme.com",
      name: "SCIM Provisioned User",
      externalId: "scim-ext-abc123",
      active: true,
    });

    expect(user.externalId).toBe("scim-ext-abc123");
    expect(user.active).toBe(true);
    expect(user.email).toBe("scim-provisioned@acme.com");
  });

  it("finds a user by SCIM externalId", async () => {
    const { api } = setup();
    await createTestUser(api, {
      id: "scim-find-user",
      email: "find-scim@acme.com",
      name: "Find By ExternalId",
      externalId: "scim-ext-find-me",
      active: true,
    });

    const found = await api.crud.findOne("user", [
      { field: "externalId", value: "scim-ext-find-me" },
    ]);

    expect(found).not.toBeNull();
    expect(found!.email).toBe("find-scim@acme.com");
    expect(found!.name).toBe("Find By ExternalId");
  });

  it("updates a user via SCIM (name, email change)", async () => {
    const { api } = setup();
    await createTestUser(api, {
      id: "scim-update-user",
      email: "old-email@acme.com",
      name: "Old Name",
      externalId: "scim-ext-update",
      active: true,
    });

    const updated = await api.crud.updateOne({
      model: "user",
      where: [{ field: "externalId", value: "scim-ext-update" }],
      update: {
        email: "new-email@acme.com",
        name: "New Name",
        updatedAt: Date.now(),
      },
    });

    expect(updated).not.toBeNull();
    expect(updated!.email).toBe("new-email@acme.com");
    expect(updated!.name).toBe("New Name");
    expect(updated!.externalId).toBe("scim-ext-update");
  });

  it("maps a SCIM group to an organization", async () => {
    const { api } = setup();

    // SCIM group maps to organization table
    const org = await api.crud.create("organization", {
      id: "scim-org-1",
      name: "SCIM Group: Engineering",
      slug: "scim-engineering",
      logo: null,
      metadata: JSON.stringify({
        scimGroupId: "scim-group-eng-123",
        scimSource: "okta",
      }),
      createdAt: Date.now(),
    });

    expect(org.name).toBe("SCIM Group: Engineering");
    const meta = JSON.parse(org.metadata as string);
    expect(meta.scimGroupId).toBe("scim-group-eng-123");
    expect(meta.scimSource).toBe("okta");

    // Add SCIM-provisioned user to the group/org
    await createTestUser(api, {
      id: "scim-group-user",
      email: "eng-member@acme.com",
      externalId: "scim-ext-eng-1",
      active: true,
    });

    await api.crud.create("member", {
      id: "scim-mem-1",
      userId: "scim-group-user",
      organizationId: "scim-org-1",
      role: "member",
      createdAt: Date.now(),
    });

    const members = await api.crud.findMany(
      "member",
      [{ field: "organizationId", value: "scim-org-1" }],
      { limit: 100 },
    );
    expect(members).toHaveLength(1);
    expect(members[0].userId).toBe("scim-group-user");
  });

  it("bulk provisions users via updateMany (activate batch)", async () => {
    const { api } = setup();

    // Create a batch of inactive users (simulating pre-provisioning)
    for (let i = 0; i < 5; i++) {
      await createTestUser(api, {
        id: `scim-bulk-${i}`,
        email: `bulk-${i}@acme.com`,
        name: `Bulk User ${i}`,
        externalId: `scim-ext-bulk-${i}`,
        active: false,
        scimProvisioned: true,
      });
    }

    // Bulk activate all SCIM-provisioned inactive users
    const activatedCount = await api.crud.updateMany({
      model: "user",
      where: [
        { field: "scimProvisioned", value: true },
        { field: "active", value: false },
      ],
      update: { active: true, updatedAt: Date.now() },
    });

    expect(activatedCount).toBe(5);

    // Verify all are now active
    const activeUsers = await api.crud.findMany(
      "user",
      [{ field: "scimProvisioned", value: true }],
      { limit: 100 },
    );
    expect(activeUsers).toHaveLength(5);
    expect(activeUsers.every((u) => u.active === true)).toBe(true);
  });

  it("deactivates a user via SCIM (sets active to false)", async () => {
    const { api } = setup();
    await createTestUser(api, {
      id: "scim-deactivate",
      email: "leaving@acme.com",
      name: "Leaving Employee",
      externalId: "scim-ext-deactivate",
      active: true,
    });

    // SCIM PATCH to deactivate
    const updated = await api.crud.updateOne({
      model: "user",
      where: [{ field: "externalId", value: "scim-ext-deactivate" }],
      update: { active: false, updatedAt: Date.now() },
    });

    expect(updated).not.toBeNull();
    expect(updated!.active).toBe(false);

    // Verify the user still exists but is inactive
    const found = await api.crud.findOne("user", [{ field: "id", value: "scim-deactivate" }]);
    expect(found).not.toBeNull();
    expect(found!.active).toBe(false);
    expect(found!.email).toBe("leaving@acme.com");
  });

  it("counts active vs inactive SCIM-provisioned users", async () => {
    const { api } = setup();

    await createTestUser(api, { id: "scim-a1", email: "a1@acme.com", externalId: "ext-a1", active: true, scimProvisioned: true });
    await createTestUser(api, { id: "scim-a2", email: "a2@acme.com", externalId: "ext-a2", active: true, scimProvisioned: true });
    await createTestUser(api, { id: "scim-i1", email: "i1@acme.com", externalId: "ext-i1", active: false, scimProvisioned: true });
    // Non-SCIM user should not be counted
    await createTestUser(api, { id: "non-scim", email: "ns@acme.com", active: true });

    const totalScim = await api.crud.count("user", [
      { field: "scimProvisioned", value: true },
    ]);
    expect(totalScim).toBe(3);

    const activeScim = await api.crud.count("user", [
      { field: "scimProvisioned", value: true },
      { field: "active", value: true },
    ]);
    expect(activeScim).toBe(2);

    const inactiveScim = await api.crud.count("user", [
      { field: "scimProvisioned", value: true },
      { field: "active", value: false },
    ]);
    expect(inactiveScim).toBe(1);
  });

  it("deletes a SCIM-provisioned user completely (hard delete)", async () => {
    const { api } = setup();
    await createTestUser(api, {
      id: "scim-delete",
      email: "delete-me@acme.com",
      externalId: "scim-ext-delete",
      active: false,
    });

    await api.crud.deleteOne({
      model: "user",
      where: [{ field: "externalId", value: "scim-ext-delete" }],
    });

    const found = await api.crud.findOne("user", [
      { field: "externalId", value: "scim-ext-delete" },
    ]);
    expect(found).toBeNull();
  });
});
