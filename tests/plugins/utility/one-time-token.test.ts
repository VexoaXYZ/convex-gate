import { describe, expect, it } from "vitest";
import { setup, createTestUser } from "../../helpers/mock-db.js";

describe("plugin: one-time-token — OTT via verification table", () => {
  it("stores one-time token in verification table", async () => {
    const { api } = setup();
    const ott = await api.crud.create("verification", {
      id: "ott-1",
      identifier: "one-time-token:action-reset-password",
      value: "ott-secure-random-abc123",
      expiresAt: Date.now() + 300000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(ott.identifier).toBe("one-time-token:action-reset-password");
    expect(ott.value).toBe("ott-secure-random-abc123");
  });

  it("retrieves token and deletes after single use", async () => {
    const { api } = setup();
    await api.crud.create("verification", {
      id: "ott-use-1",
      identifier: "one-time-token:email-verify",
      value: "ott-single-use-token",
      expiresAt: Date.now() + 300000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Retrieve
    const found = await api.crud.findOne("verification", [
      { field: "value", value: "ott-single-use-token" },
    ]);
    expect(found).not.toBeNull();
    expect(found!.identifier).toBe("one-time-token:email-verify");

    // Consume (delete after use)
    await api.crud.deleteOne({
      model: "verification",
      where: [{ field: "id", value: "ott-use-1" }],
    });

    // Verify it's gone
    const gone = await api.crud.findOne("verification", [
      { field: "value", value: "ott-single-use-token" },
    ]);
    expect(gone).toBeNull();
  });

  it("expired one-time token is still in DB but identifiable as expired", async () => {
    const { api } = setup();
    const expiredAt = Date.now() - 5000;
    await api.crud.create("verification", {
      id: "ott-exp-1",
      identifier: "one-time-token:expired-action",
      value: "ott-expired-token",
      expiresAt: expiredAt,
      createdAt: Date.now() - 305000,
      updatedAt: Date.now() - 305000,
    });

    const found = await api.crud.findOne("verification", [
      { field: "value", value: "ott-expired-token" },
    ]);
    expect(found).not.toBeNull();
    expect(found!.expiresAt).toBeLessThan(Date.now());
  });

  it("multiple OTTs for different actions coexist", async () => {
    const { api } = setup();
    await api.crud.create("verification", {
      id: "ott-multi-1",
      identifier: "one-time-token:reset-password",
      value: "ott-reset-abc",
      expiresAt: Date.now() + 300000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await api.crud.create("verification", {
      id: "ott-multi-2",
      identifier: "one-time-token:email-change",
      value: "ott-change-def",
      expiresAt: Date.now() + 300000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const reset = await api.crud.findOne("verification", [
      { field: "identifier", value: "one-time-token:reset-password" },
    ]);
    const change = await api.crud.findOne("verification", [
      { field: "identifier", value: "one-time-token:email-change" },
    ]);
    expect(reset).not.toBeNull();
    expect(change).not.toBeNull();
    expect(reset!.value).not.toBe(change!.value);
  });
});
