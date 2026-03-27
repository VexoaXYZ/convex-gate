import { describe, expect, it } from "vitest";
import { setup, createTestUser, createTestSession } from "../../helpers/mock-db.js";

describe("plugin: username", () => {
  it("creates user with username and displayUsername fields", async () => {
    const { api } = setup();
    const user = await createTestUser(api, {
      id: "uname-create",
      username: "johndoe",
      displayUsername: "JohnDoe",
    });

    expect(user.username).toBe("johndoe");
    expect(user.displayUsername).toBe("JohnDoe");
  });

  it("finds user by username", async () => {
    const { api } = setup();
    await createTestUser(api, {
      id: "uname-find",
      email: "findbyname@example.com",
      username: "findable",
      displayUsername: "Findable",
    });
    await createTestUser(api, {
      id: "uname-other",
      email: "other@example.com",
      username: "othername",
      displayUsername: "OtherName",
    });

    const found = await api.crud.findOne("user", [
      { field: "username", value: "findable" },
    ]);
    expect(found).not.toBeNull();
    expect(found!.email).toBe("findbyname@example.com");
    expect(found!.id).toBe("uname-find");
  });

  it("updates username (rename)", async () => {
    const { api } = setup();
    await createTestUser(api, {
      id: "uname-rename",
      username: "oldname",
      displayUsername: "OldName",
    });

    const updated = await api.crud.updateOne({
      model: "user",
      where: [{ field: "id", value: "uname-rename" }],
      update: {
        username: "newname",
        displayUsername: "NewName",
        updatedAt: Date.now(),
      },
    });

    expect(updated).not.toBeNull();
    expect(updated!.username).toBe("newname");
    expect(updated!.displayUsername).toBe("NewName");

    // Old username should no longer match
    const oldLookup = await api.crud.findOne("user", [
      { field: "username", value: "oldname" },
    ]);
    expect(oldLookup).toBeNull();

    // New username should resolve
    const newLookup = await api.crud.findOne("user", [
      { field: "username", value: "newname" },
    ]);
    expect(newLookup).not.toBeNull();
    expect(newLookup!.id).toBe("uname-rename");
  });

  it("handles null/undefined username gracefully", async () => {
    const { api } = setup();

    // User created without username field at all
    const userNoUsername = await createTestUser(api, {
      id: "uname-null",
      email: "nousername@example.com",
    });
    expect(userNoUsername.username).toBeUndefined();

    // User created with explicit null username
    const userNullUsername = await createTestUser(api, {
      id: "uname-explicit-null",
      email: "nullname@example.com",
      username: null,
      displayUsername: null,
    });
    expect(userNullUsername.username).toBeNull();

    // Searching for null should not throw
    const results = await api.crud.findMany(
      "user",
      [{ field: "username", value: null }],
      { limit: 100 },
    );
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("case-insensitive lookup via where clause on lowercased username", async () => {
    const { api } = setup();

    // Better Auth stores username lowercased and display cased separately
    await createTestUser(api, {
      id: "uname-case-1",
      email: "caseuser@example.com",
      username: "cooluser",
      displayUsername: "CoolUser",
    });
    await createTestUser(api, {
      id: "uname-case-2",
      email: "another@example.com",
      username: "anotheruser",
      displayUsername: "AnotherUser",
    });

    // Lookup using the lowercased username field (as Better Auth does internally)
    const found = await api.crud.findOne("user", [
      { field: "username", value: "cooluser" },
    ]);
    expect(found).not.toBeNull();
    expect(found!.displayUsername).toBe("CoolUser");
    expect(found!.id).toBe("uname-case-1");

    // A differently-cased search against the lowercased field yields no match
    const notFound = await api.crud.findOne("user", [
      { field: "username", value: "CoolUser" },
    ]);
    expect(notFound).toBeNull();
  });

  it("username is distinct across users", async () => {
    const { api } = setup();
    await createTestUser(api, {
      id: "uname-unique-1",
      email: "unique1@example.com",
      username: "uniquename",
      displayUsername: "UniqueName",
    });
    await createTestUser(api, {
      id: "uname-unique-2",
      email: "unique2@example.com",
      username: "differentname",
      displayUsername: "DifferentName",
    });

    const matches = await api.crud.findMany(
      "user",
      [{ field: "username", value: "uniquename" }],
      { limit: 100 },
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe("uname-unique-1");
  });
});
