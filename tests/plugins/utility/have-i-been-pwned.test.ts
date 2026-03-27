import { describe, expect, it } from "vitest";
import { setup, createTestUser } from "../../helpers/mock-db.js";

describe("plugin: have-i-been-pwned — pure logic, no DB schema changes", () => {
  it("credential account creation with password works alongside HIBP", async () => {
    const { api } = setup();
    const user = await createTestUser(api, {
      id: "hibp-user",
      email: "hibp@example.com",
    });

    const account = await api.crud.create("account", {
      id: "hibp-acct",
      userId: user.id as string,
      accountId: "hibp@example.com",
      providerId: "credential",
      password: "$2b$10$hashedpassword",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    expect(account.providerId).toBe("credential");
    expect(account.password).toBe("$2b$10$hashedpassword");
  });

  it("user with password account can be retrieved after creation", async () => {
    const { api } = setup();
    await createTestUser(api, { id: "hibp-retrieve", email: "retrieve@example.com" });
    await api.crud.create("account", {
      id: "hibp-acct-2",
      userId: "hibp-retrieve",
      accountId: "retrieve@example.com",
      providerId: "credential",
      password: "$2b$10$anotherhash",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const found = await api.crud.findOne("account", [
      { field: "accountId", value: "retrieve@example.com" },
      { field: "providerId", value: "credential" },
    ]);
    expect(found).not.toBeNull();
    expect(found!.userId).toBe("hibp-retrieve");
  });
});
