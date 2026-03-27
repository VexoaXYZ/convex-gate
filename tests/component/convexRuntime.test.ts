import { describe, expect, it } from "vitest";
import { createConvexAuthComponent, type ConvexCollectionReader, type ConvexDbLike, type ConvexQuery, type ConvexDbRecord } from "../../src/component/convexRuntime.js";

class FakeQuery implements ConvexQuery {
  constructor(private readonly filters: Array<(record: ConvexDbRecord) => boolean>) {}

  private next(filter: (record: ConvexDbRecord) => boolean) {
    return new FakeQuery([...this.filters, filter]);
  }

  eq(field: string, value: unknown) {
    return this.next((record) => record[field] === value);
  }

  gt(field: string, value: number) {
    return this.next(
      (record) => typeof record[field] === "number" && (record[field] as number) > value
    );
  }

  gte(field: string, value: number) {
    return this.next(
      (record) => typeof record[field] === "number" && (record[field] as number) >= value
    );
  }

  lt(field: string, value: number) {
    return this.next(
      (record) => typeof record[field] === "number" && (record[field] as number) < value
    );
  }

  lte(field: string, value: number) {
    return this.next(
      (record) => typeof record[field] === "number" && (record[field] as number) <= value
    );
  }

  apply(records: ConvexDbRecord[]) {
    return records.filter((record) => this.filters.every((filter) => filter(record)));
  }
}

class FakeReader implements ConvexCollectionReader {
  private queryState = new FakeQuery([]);
  private direction: "asc" | "desc" = "asc";

  constructor(
    private readonly getRecords: () => ConvexDbRecord[]
  ) {}

  withIndex(_indexName: string, builder?: (query: ConvexQuery) => ConvexQuery) {
    if (builder) {
      this.queryState = builder(new FakeQuery([])) as FakeQuery;
    }
    return this;
  }

  order(direction: "asc" | "desc") {
    this.direction = direction;
    return this;
  }

  async collect() {
    const records = this.queryState.apply(this.getRecords());
    return this.direction === "asc" ? records : [...records].reverse();
  }

  async unique() {
    const records = await this.collect();
    return records[0] ?? null;
  }
}

function createFakeDb(initial: Record<string, ConvexDbRecord[]>): ConvexDbLike {
  const tables = new Map(
    Object.entries(initial).map(([table, records]) => [table, new Map(records.map((record) => [record._id, { ...record }]))])
  );

  const getTable = (table: string) => {
    const value = tables.get(table);
    if (!value) {
      throw new Error(`Missing table: ${table}`);
    }
    return value;
  };

  return {
    query(table) {
      const entries = getTable(table);
      return new FakeReader(() => [...entries.values()].map((record) => ({ ...record })));
    },
    async get(id) {
      for (const table of tables.values()) {
        if (table.has(id)) {
          return { ...(table.get(id) as ConvexDbRecord) };
        }
      }
      return null;
    },
    async insert(table, value) {
      const entries = getTable(table);
      const id = typeof value._id === "string" ? value._id : `${table}-${entries.size + 1}`;
      entries.set(id, {
        ...value,
        _id: id,
      } as ConvexDbRecord);
      return id;
    },
    async patch(id, value) {
      for (const table of tables.values()) {
        const record = table.get(id);
        if (!record) {
          continue;
        }
        table.set(id, {
          ...record,
          ...value,
          _id: id,
        });
        return;
      }
    },
    async delete(id) {
      for (const table of tables.values()) {
        if (table.delete(id)) {
          return;
        }
      }
    },
  };
}

describe("createConvexAuthComponent", () => {
  it("resolves session and user by token", async () => {
    const db = createFakeDb({
      user: [{ _id: "user-1", id: "user-1", email: "user@example.com", emailVerified: true, createdAt: 1, updatedAt: 1 }],
      session: [{ _id: "session-1", id: "session-1", userId: "user-1", token: "token-1", expiresAt: Date.now() + 60_000 }],
      account: [],
      verification: [],
    });
    const api = createConvexAuthComponent(db);

    const result = await api.hotPath.getSessionWithUserByToken({
      token: "token-1",
      now: Date.now(),
    });

    expect(result.session?.id).toBe("session-1");
    expect(result.user?.id).toBe("user-1");
  });

  it("invalidates all sessions for a user", async () => {
    const db = createFakeDb({
      user: [],
      session: [
        { _id: "session-1", id: "session-1", userId: "user-1", token: "token-1", expiresAt: Date.now() + 60_000 },
        { _id: "session-2", id: "session-2", userId: "user-1", token: "token-2", expiresAt: Date.now() + 60_000 },
      ],
      account: [],
      verification: [],
    });
    const api = createConvexAuthComponent(db);

    const count = await api.hotPath.invalidateUserSessions({ userId: "user-1" });

    expect(count).toBe(2);
    expect(await api.crud.count("session", [])).toBe(0);
  });

  it("supports CRUD create and update flows", async () => {
    const db = createFakeDb({
      user: [],
      session: [],
      account: [],
      verification: [],
    });
    const api = createConvexAuthComponent(db);

    const created = await api.crud.create("verification", {
      id: "verification-1",
      identifier: "user@example.com",
      value: "otp",
      expiresAt: 100,
    });
    expect(created.id).toBe("verification-1");

    const updated = await api.crud.updateOne({
      model: "verification",
      where: [{ field: "id", value: "verification-1", operator: "eq", connector: "AND" }],
      update: { value: "otp-2" },
    });

    expect(updated?.value).toBe("otp-2");
  });
});
