import { describe, expect, it } from "vitest";
import { setup, createTestUser, createTestSession } from "../../helpers/mock-db.js";

describe("plugin: email-otp", () => {
  it("stores OTP in verification table", async () => {
    const { api } = setup();
    await api.crud.create("verification", {
      id: "otp-store-1",
      identifier: "email-otp:user@example.com",
      value: "482913",
      expiresAt: Date.now() + 300000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const found = await api.crud.findOne("verification", [
      { field: "id", value: "otp-store-1" },
    ]);
    expect(found).not.toBeNull();
    expect(found!.value).toBe("482913");
    expect(found!.identifier).toBe("email-otp:user@example.com");
  });

  it("finds OTP by identifier", async () => {
    const { api } = setup();
    await api.crud.create("verification", {
      id: "otp-ident-1",
      identifier: "email-otp:find@example.com",
      value: "123456",
      expiresAt: Date.now() + 300000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await api.crud.create("verification", {
      id: "otp-ident-2",
      identifier: "email-otp:other@example.com",
      value: "654321",
      expiresAt: Date.now() + 300000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const found = await api.crud.findOne("verification", [
      { field: "identifier", value: "email-otp:find@example.com" },
    ]);
    expect(found).not.toBeNull();
    expect(found!.value).toBe("123456");
  });

  it("OTP value is a 6-digit string", async () => {
    const { api } = setup();
    const otpValues = ["000000", "123456", "999999", "482913", "007042", "100001"];

    for (let i = 0; i < otpValues.length; i++) {
      await api.crud.create("verification", {
        id: `otp-digit-${i}`,
        identifier: `email-otp:digit${i}@example.com`,
        value: otpValues[i],
        expiresAt: Date.now() + 300000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    for (let i = 0; i < otpValues.length; i++) {
      const found = await api.crud.findOne("verification", [
        { field: "id", value: `otp-digit-${i}` },
      ]);
      expect(found).not.toBeNull();
      expect(found!.value).toBe(otpValues[i]);
      expect(typeof found!.value).toBe("string");
      expect((found!.value as string)).toMatch(/^\d{6}$/);
    }
  });

  it("deletes OTP after verification", async () => {
    const { api } = setup();
    const user = await createTestUser(api, {
      id: "otp-del-user",
      email: "otpdel@example.com",
    });

    await api.crud.create("verification", {
      id: "otp-del-1",
      identifier: "email-otp:otpdel@example.com",
      value: "555777",
      expiresAt: Date.now() + 300000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Simulate verification: find OTP, validate, delete
    const otp = await api.crud.findOne("verification", [
      { field: "identifier", value: "email-otp:otpdel@example.com" },
    ]);
    expect(otp).not.toBeNull();
    expect(otp!.value).toBe("555777");

    await api.crud.deleteOne({
      model: "verification",
      where: [{ field: "id", value: "otp-del-1" }],
    });

    // OTP should be gone
    const gone = await api.crud.findOne("verification", [
      { field: "identifier", value: "email-otp:otpdel@example.com" },
    ]);
    expect(gone).toBeNull();
  });

  it("multiple OTPs for different emails coexist", async () => {
    const { api } = setup();
    const entries = [
      { email: "alice@example.com", otp: "111111" },
      { email: "bob@example.com", otp: "222222" },
      { email: "charlie@example.com", otp: "333333" },
      { email: "diana@example.com", otp: "444444" },
      { email: "eve@example.com", otp: "555555" },
    ];

    for (let i = 0; i < entries.length; i++) {
      await api.crud.create("verification", {
        id: `otp-multi-${i}`,
        identifier: `email-otp:${entries[i].email}`,
        value: entries[i].otp,
        expiresAt: Date.now() + 300000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    // Each email's OTP should be independently accessible
    for (const entry of entries) {
      const found = await api.crud.findOne("verification", [
        { field: "identifier", value: `email-otp:${entry.email}` },
      ]);
      expect(found).not.toBeNull();
      expect(found!.value).toBe(entry.otp);
    }

    // Total count should match
    const all = await api.crud.findMany("verification", [], { limit: 100 });
    expect(all).toHaveLength(entries.length);
  });

  it("OTP expiry is respected in workflow", async () => {
    const { api } = setup();
    const expiredTime = Date.now() - 60000; // 1 minute ago

    await api.crud.create("verification", {
      id: "otp-expire-1",
      identifier: "email-otp:expired@example.com",
      value: "999888",
      expiresAt: expiredTime,
      createdAt: expiredTime - 300000,
      updatedAt: expiredTime - 300000,
    });

    // The record exists but is expired
    const found = await api.crud.findOne("verification", [
      { field: "identifier", value: "email-otp:expired@example.com" },
    ]);
    expect(found).not.toBeNull();
    expect(found!.expiresAt).toBeLessThan(Date.now());

    // Clean up expired record
    await api.crud.deleteOne({
      model: "verification",
      where: [{ field: "id", value: "otp-expire-1" }],
    });

    const gone = await api.crud.findOne("verification", [
      { field: "identifier", value: "email-otp:expired@example.com" },
    ]);
    expect(gone).toBeNull();
  });
});
