import { describe, expect, it } from "vitest";
import { setup, createTestUser } from "../../helpers/mock-db.js";

describe("plugin: generic payment patterns (Polar, Autumn, Dodo, Creem, Commet)", () => {
  it("adds customerId field to user record", async () => {
    const { api } = setup();
    const user = await createTestUser(api, {
      id: "pay-user",
      email: "pay@example.com",
      customerId: "cust_polar_abc123",
    });
    expect(user.customerId).toBe("cust_polar_abc123");
  });

  it("creates subscription record with arbitrary provider fields", async () => {
    const { api } = setup();
    const sub = await api.crud.create("subscription", {
      id: "gen-sub-1",
      userId: "pay-user",
      providerId: "polar",
      externalSubscriptionId: "pol_sub_xyz",
      plan: "pro",
      status: "active",
      interval: "monthly",
      amount: 2900,
      currency: "USD",
      currentPeriodStart: Date.now(),
      currentPeriodEnd: Date.now() + 2592000000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(sub.providerId).toBe("polar");
    expect(sub.amount).toBe(2900);
    expect(sub.currency).toBe("USD");
  });

  it("stores webhook event for audit trail", async () => {
    const { api } = setup();
    const event = await api.crud.create("webhookEvent", {
      id: "wh-evt-1",
      provider: "dodo",
      eventType: "subscription.created",
      externalId: "evt_dodo_123",
      payload: JSON.stringify({
        subscriptionId: "dodo_sub_abc",
        customerId: "dodo_cust_xyz",
        plan: "starter",
      }),
      processed: true,
      createdAt: Date.now(),
    });

    expect(event.provider).toBe("dodo");
    expect(event.eventType).toBe("subscription.created");
    expect(event.processed).toBe(true);

    const found = await api.crud.findOne("webhookEvent", [
      { field: "externalId", value: "evt_dodo_123" },
    ]);
    expect(found).not.toBeNull();
  });

  it("updates payment/subscription status via webhook", async () => {
    const { api } = setup();
    await api.crud.create("subscription", {
      id: "gen-upd-sub",
      userId: "pay-user",
      providerId: "autumn",
      externalSubscriptionId: "aut_sub_001",
      status: "active",
      plan: "team",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const updated = await api.crud.updateOne({
      model: "subscription",
      where: [{ field: "id", value: "gen-upd-sub" }],
      update: {
        status: "past_due",
        updatedAt: Date.now(),
      },
    });
    expect(updated!.status).toBe("past_due");

    // Simulate payment recovery
    const recovered = await api.crud.updateOne({
      model: "subscription",
      where: [{ field: "id", value: "gen-upd-sub" }],
      update: {
        status: "active",
        updatedAt: Date.now(),
      },
    });
    expect(recovered!.status).toBe("active");
  });

  it("creates one-time payment record", async () => {
    const { api } = setup();
    const payment = await api.crud.create("payment", {
      id: "pay-once-1",
      userId: "pay-user",
      providerId: "creem",
      externalPaymentId: "creem_pay_abc",
      amount: 4999,
      currency: "EUR",
      status: "succeeded",
      description: "Lifetime license",
      createdAt: Date.now(),
    });

    expect(payment.amount).toBe(4999);
    expect(payment.status).toBe("succeeded");

    const found = await api.crud.findOne("payment", [
      { field: "externalPaymentId", value: "creem_pay_abc" },
    ]);
    expect(found).not.toBeNull();
    expect(found!.providerId).toBe("creem");
  });

  it("handles multiple webhook events for same subscription", async () => {
    const { api } = setup();
    const events = [
      { type: "subscription.created", time: Date.now() - 30000 },
      { type: "invoice.paid", time: Date.now() - 20000 },
      { type: "subscription.updated", time: Date.now() - 10000 },
    ];

    for (let i = 0; i < events.length; i++) {
      await api.crud.create("webhookEvent", {
        id: `wh-multi-${i}`,
        provider: "commet",
        eventType: events[i].type,
        externalId: `evt_commet_${i}`,
        payload: JSON.stringify({ subscriptionId: "commet_sub_001" }),
        processed: true,
        createdAt: events[i].time,
      });
    }

    const allEvents = await api.crud.findMany(
      "webhookEvent",
      [{ field: "provider", value: "commet" }],
      { limit: 100 },
    );
    expect(allEvents).toHaveLength(3);
  });
});
