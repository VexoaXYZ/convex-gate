import { describe, expect, it } from "vitest";
import { setup, createTestUser, createTestSession } from "../../helpers/mock-db.js";

describe("plugin: anonymous", () => {
  it("creates anonymous user with isAnonymous=true and temp email", async () => {
    const { api } = setup();
    const tempEmail = `anon-${Date.now()}@temp.localhost`;
    const user = await createTestUser(api, {
      id: "anon-1",
      email: tempEmail,
      emailVerified: false,
      name: "Anonymous",
      isAnonymous: true,
    });

    expect(user.isAnonymous).toBe(true);
    expect(user.email).toBe(tempEmail);
    expect(user.emailVerified).toBe(false);
  });

  it("converts anonymous to real user (isAnonymous=false, update email/name)", async () => {
    const { api } = setup();
    await createTestUser(api, {
      id: "anon-convert",
      email: "anon-temp@temp.localhost",
      emailVerified: false,
      name: "Anonymous",
      isAnonymous: true,
    });

    const updated = await api.crud.updateOne({
      model: "user",
      where: [{ field: "id", value: "anon-convert" }],
      update: {
        isAnonymous: false,
        email: "real@example.com",
        emailVerified: true,
        name: "Real User",
        updatedAt: Date.now(),
      },
    });

    expect(updated).not.toBeNull();
    expect(updated!.isAnonymous).toBe(false);
    expect(updated!.email).toBe("real@example.com");
    expect(updated!.emailVerified).toBe(true);
    expect(updated!.name).toBe("Real User");
  });

  it("deletes anonymous user", async () => {
    const { api } = setup();
    await createTestUser(api, {
      id: "anon-delete",
      email: "anon-del@temp.localhost",
      emailVerified: false,
      name: "Anonymous",
      isAnonymous: true,
    });

    await api.crud.deleteOne({
      model: "user",
      where: [{ field: "id", value: "anon-delete" }],
    });

    const found = await api.crud.findOne("user", [
      { field: "id", value: "anon-delete" },
    ]);
    expect(found).toBeNull();
  });

  it("multiple anonymous users can coexist", async () => {
    const { api } = setup();
    await createTestUser(api, {
      id: "anon-multi-1",
      email: "anon1@temp.localhost",
      isAnonymous: true,
      name: "Anonymous 1",
    });
    await createTestUser(api, {
      id: "anon-multi-2",
      email: "anon2@temp.localhost",
      isAnonymous: true,
      name: "Anonymous 2",
    });
    await createTestUser(api, {
      id: "anon-multi-3",
      email: "anon3@temp.localhost",
      isAnonymous: true,
      name: "Anonymous 3",
    });

    const anonUsers = await api.crud.findMany(
      "user",
      [{ field: "isAnonymous", value: true }],
      { limit: 100 },
    );
    expect(anonUsers).toHaveLength(3);
    expect(anonUsers.every((u) => u.isAnonymous === true)).toBe(true);
  });

  it("anonymous user can have sessions", async () => {
    const { api } = setup();
    const user = await createTestUser(api, {
      id: "anon-session-user",
      email: "anon-sess@temp.localhost",
      isAnonymous: true,
      name: "Anonymous",
    });

    const session = await createTestSession(api, user.id as string);
    expect(session.userId).toBe("anon-session-user");

    // Session resolution should work for anonymous users
    const result = await api.hotPath.getSessionWithUserByToken({
      token: session.token as string,
      now: Date.now(),
    });
    expect(result.session).not.toBeNull();
    expect(result.user).not.toBeNull();
    expect(result.user!.isAnonymous).toBe(true);
  });

  it("converting anonymous user preserves existing sessions", async () => {
    const { api } = setup();
    const user = await createTestUser(api, {
      id: "anon-preserve",
      email: "anon-preserve@temp.localhost",
      isAnonymous: true,
      name: "Anonymous",
    });

    const session = await createTestSession(api, user.id as string);

    // Convert to real user
    await api.crud.updateOne({
      model: "user",
      where: [{ field: "id", value: "anon-preserve" }],
      update: {
        isAnonymous: false,
        email: "converted@example.com",
        name: "Converted User",
        updatedAt: Date.now(),
      },
    });

    // Session should still resolve and return updated user
    const result = await api.hotPath.getSessionWithUserByToken({
      token: session.token as string,
      now: Date.now(),
    });
    expect(result.session).not.toBeNull();
    expect(result.user).not.toBeNull();
    expect(result.user!.isAnonymous).toBe(false);
    expect(result.user!.email).toBe("converted@example.com");
  });
});
