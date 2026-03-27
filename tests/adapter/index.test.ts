import { describe, expect, it, vi } from "vitest";
import type { BetterAuthOptions } from "better-auth";
import { createConvexGateAdapter, type ConvexGateStore } from "../../src/adapter/index.js";

function createStore(): ConvexGateStore {
  return {
    create: vi.fn(async ({ data }) => ({ ...data, _id: "created-id" })),
    findOne: vi.fn(async () => ({ _id: "session-1", token: "token-1" })),
    findMany: vi.fn(async () => [{ _id: "user-1" }]),
    count: vi.fn(async () => 1),
    updateOne: vi.fn(async () => ({ _id: "user-1", name: "updated" })),
    updateMany: vi.fn(async () => 2),
    deleteOne: vi.fn(async () => undefined),
    deleteMany: vi.fn(async () => 3),
  };
}

describe("createConvexGateAdapter", () => {
  it("delegates CRUD operations to the configured store", async () => {
    const store = createStore();
    const adapter = createConvexGateAdapter({ store })({} as BetterAuthOptions);

    await adapter.create({
      model: "user",
      data: { email: "hello@example.com" },
      select: ["id", "email"],
    });
    await adapter.findOne({
      model: "session",
      where: [{ field: "token", value: "abc" }],
      select: ["id", "token"],
    });
    await adapter.update({
      model: "user",
      where: [{ field: "id", value: "user-1" }],
      update: { name: "updated" },
    });
    await adapter.delete({
      model: "session",
      where: [{ field: "id", value: "session-1" }],
    });

    expect(store.create).toHaveBeenCalledTimes(1);
    expect(store.findOne).toHaveBeenCalledTimes(1);
    expect(store.updateOne).toHaveBeenCalledTimes(1);
    expect(store.deleteOne).toHaveBeenCalledTimes(1);
  });

  it("uses Better Auth's default findMany limit when one is not supplied", async () => {
    const store = createStore();
    const adapter = createConvexGateAdapter({ store })({} as BetterAuthOptions);

    await adapter.findMany({
      model: "user",
      where: [{ field: "email", value: "hello@example.com" }],
    });

    expect(store.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "user",
        limit: 100,
      })
    );
  });
});
