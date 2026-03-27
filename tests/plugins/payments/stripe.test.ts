import { describe, expect, it } from "vitest";
import { setup, createTestUser } from "../../helpers/mock-db.js";

describe("plugin: stripe — customer and subscription management", () => {
  it("adds stripeCustomerId to user record", async () => {
    const { api } = setup();
    const user = await createTestUser(api, {
      id: "stripe-user",
      email: "stripe@example.com",
      stripeCustomerId: "cus_abc123def456",
    });
    expect(user.stripeCustomerId).toBe("cus_abc123def456");
  });

  it("updates user with stripeCustomerId after checkout", async () => {
    const { api } = setup();
    await createTestUser(api, { id: "stripe-late-user", email: "late@example.com" });

    const updated = await api.crud.updateOne({
      model: "user",
      where: [{ field: "id", value: "stripe-late-user" }],
      update: { stripeCustomerId: "cus_late789" },
    });
    expect(updated!.stripeCustomerId).toBe("cus_late789");
  });

  it("creates subscription record in dedicated table", async () => {
    const { api } = setup();
    const sub = await api.crud.create("subscription", {
      id: "sub-1",
      userId: "stripe-user",
      stripeSubscriptionId: "sub_abc123",
      plan: "pro",
      status: "active",
      currentPeriodStart: Date.now(),
      currentPeriodEnd: Date.now() + 2592000000, // 30 days
      cancelAtPeriodEnd: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(sub.stripeSubscriptionId).toBe("sub_abc123");
    expect(sub.status).toBe("active");
    expect(sub.plan).toBe("pro");
  });

  it("stores payment metadata on subscription", async () => {
    const { api } = setup();
    const sub = await api.crud.create("subscription", {
      id: "sub-meta-1",
      userId: "stripe-user",
      stripeSubscriptionId: "sub_meta123",
      plan: "enterprise",
      status: "active",
      metadata: JSON.stringify({
        seats: 50,
        billingEmail: "billing@company.com",
        taxId: "EU123456789",
      }),
      priceId: "price_enterprise_monthly",
      quantity: 50,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const meta = JSON.parse(sub.metadata as string);
    expect(meta.seats).toBe(50);
    expect(sub.priceId).toBe("price_enterprise_monthly");
  });

  it("updates subscription status on webhook event", async () => {
    const { api } = setup();
    await api.crud.create("subscription", {
      id: "sub-status-1",
      userId: "stripe-user",
      stripeSubscriptionId: "sub_status123",
      plan: "pro",
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Simulate webhook: subscription canceled
    const updated = await api.crud.updateOne({
      model: "subscription",
      where: [{ field: "id", value: "sub-status-1" }],
      update: {
        status: "canceled",
        cancelAtPeriodEnd: true,
        updatedAt: Date.now(),
      },
    });
    expect(updated!.status).toBe("canceled");
    expect(updated!.cancelAtPeriodEnd).toBe(true);
  });

  it("supports multiple subscriptions per user", async () => {
    const { api } = setup();
    await createTestUser(api, { id: "multi-sub-user", stripeCustomerId: "cus_multi" });

    await api.crud.create("subscription", {
      id: "ms-sub-1",
      userId: "multi-sub-user",
      stripeSubscriptionId: "sub_plan_a",
      plan: "starter",
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await api.crud.create("subscription", {
      id: "ms-sub-2",
      userId: "multi-sub-user",
      stripeSubscriptionId: "sub_plan_b",
      plan: "addon-storage",
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const subs = await api.crud.findMany(
      "subscription",
      [{ field: "userId", value: "multi-sub-user" }],
      { limit: 100 },
    );
    expect(subs).toHaveLength(2);
    const plans = subs.map((s) => s.plan);
    expect(plans).toContain("starter");
    expect(plans).toContain("addon-storage");
  });
});
