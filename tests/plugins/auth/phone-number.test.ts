import { describe, expect, it } from "vitest";
import { setup, createTestUser, createTestSession } from "../../helpers/mock-db.js";

describe("plugin: phone-number", () => {
  it("creates user with phoneNumber and phoneNumberVerified", async () => {
    const { api } = setup();
    const user = await createTestUser(api, {
      id: "phone-create",
      phoneNumber: "+15551234567",
      phoneNumberVerified: false,
    });

    expect(user.phoneNumber).toBe("+15551234567");
    expect(user.phoneNumberVerified).toBe(false);
  });

  it("verifies phone number via update", async () => {
    const { api } = setup();
    await createTestUser(api, {
      id: "phone-verify",
      phoneNumber: "+15559876543",
      phoneNumberVerified: false,
    });

    const updated = await api.crud.updateOne({
      model: "user",
      where: [{ field: "id", value: "phone-verify" }],
      update: {
        phoneNumberVerified: true,
        updatedAt: Date.now(),
      },
    });

    expect(updated).not.toBeNull();
    expect(updated!.phoneNumberVerified).toBe(true);
    expect(updated!.phoneNumber).toBe("+15559876543");
  });

  it("finds user by phoneNumber", async () => {
    const { api } = setup();
    await createTestUser(api, {
      id: "phone-find-1",
      email: "phone1@example.com",
      phoneNumber: "+15551111111",
      phoneNumberVerified: true,
    });
    await createTestUser(api, {
      id: "phone-find-2",
      email: "phone2@example.com",
      phoneNumber: "+15552222222",
      phoneNumberVerified: true,
    });

    const found = await api.crud.findOne("user", [
      { field: "phoneNumber", value: "+15551111111" },
    ]);
    expect(found).not.toBeNull();
    expect(found!.id).toBe("phone-find-1");
    expect(found!.email).toBe("phone1@example.com");
  });

  it("handles international formats (+1, +44, etc.)", async () => {
    const { api } = setup();

    const usUser = await createTestUser(api, {
      id: "phone-us",
      email: "us@example.com",
      phoneNumber: "+12025551234",
      phoneNumberVerified: true,
    });
    const ukUser = await createTestUser(api, {
      id: "phone-uk",
      email: "uk@example.com",
      phoneNumber: "+442071234567",
      phoneNumberVerified: true,
    });
    const jpUser = await createTestUser(api, {
      id: "phone-jp",
      email: "jp@example.com",
      phoneNumber: "+81312345678",
      phoneNumberVerified: true,
    });
    const brUser = await createTestUser(api, {
      id: "phone-br",
      email: "br@example.com",
      phoneNumber: "+5511987654321",
      phoneNumberVerified: true,
    });

    expect(usUser.phoneNumber).toBe("+12025551234");
    expect(ukUser.phoneNumber).toBe("+442071234567");
    expect(jpUser.phoneNumber).toBe("+81312345678");
    expect(brUser.phoneNumber).toBe("+5511987654321");

    // Each can be found by their unique number
    const foundUk = await api.crud.findOne("user", [
      { field: "phoneNumber", value: "+442071234567" },
    ]);
    expect(foundUk).not.toBeNull();
    expect(foundUk!.id).toBe("phone-uk");

    const foundJp = await api.crud.findOne("user", [
      { field: "phoneNumber", value: "+81312345678" },
    ]);
    expect(foundJp).not.toBeNull();
    expect(foundJp!.id).toBe("phone-jp");
  });

  it("unsets phone number (null)", async () => {
    const { api } = setup();
    await createTestUser(api, {
      id: "phone-unset",
      phoneNumber: "+15553334444",
      phoneNumberVerified: true,
    });

    const updated = await api.crud.updateOne({
      model: "user",
      where: [{ field: "id", value: "phone-unset" }],
      update: {
        phoneNumber: null,
        phoneNumberVerified: false,
        updatedAt: Date.now(),
      },
    });

    expect(updated).not.toBeNull();
    expect(updated!.phoneNumber).toBeNull();
    expect(updated!.phoneNumberVerified).toBe(false);
  });

  it("phone number verified user can authenticate with session", async () => {
    const { api } = setup();
    const user = await createTestUser(api, {
      id: "phone-auth",
      phoneNumber: "+15557778888",
      phoneNumberVerified: true,
    });

    const session = await createTestSession(api, user.id as string);

    const result = await api.hotPath.getSessionWithUserByToken({
      token: session.token as string,
      now: Date.now(),
    });
    expect(result.session).not.toBeNull();
    expect(result.user).not.toBeNull();
    expect(result.user!.phoneNumber).toBe("+15557778888");
    expect(result.user!.phoneNumberVerified).toBe(true);
  });
});
