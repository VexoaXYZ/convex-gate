import { describe, expect, it } from "vitest";
import { setup, createTestUser } from "../../helpers/mock-db.js";

describe("plugin: i18n — locale preference on user", () => {
  it("creates user with locale preference field", async () => {
    const { api } = setup();
    const user = await createTestUser(api, {
      id: "i18n-user",
      email: "i18n@example.com",
      locale: "en-US",
    });
    expect(user.locale).toBe("en-US");
  });

  it("updates user locale preference", async () => {
    const { api } = setup();
    await createTestUser(api, {
      id: "i18n-update",
      email: "locale@example.com",
      locale: "en-US",
    });

    const updated = await api.crud.updateOne({
      model: "user",
      where: [{ field: "id", value: "i18n-update" }],
      update: { locale: "fr-FR" },
    });
    expect(updated!.locale).toBe("fr-FR");
  });

  it("user without locale field works normally", async () => {
    const { api } = setup();
    const user = await createTestUser(api, {
      id: "i18n-none",
      email: "nolocale@example.com",
    });
    expect(user.locale).toBeUndefined();
  });
});
