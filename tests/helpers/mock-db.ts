import {
  createConvexAuthComponent,
  type ConvexDbLike,
  type ConvexDbRecord,
  type ConvexCollectionReader,
  type ConvexQuery,
} from "../../src/component/convexRuntime.js";

/**
 * In-memory Convex DB mock that simulates Convex's document store.
 * Accepts ANY table name and ANY fields — mirrors our component
 * with schemaValidation: false.
 */
export function createMockDb(): ConvexDbLike & { _tables: Map<string, ConvexDbRecord[]> } {
  const tables = new Map<string, ConvexDbRecord[]>();
  let idCounter = 0;

  function getTable(name: string): ConvexDbRecord[] {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name)!;
  }

  return {
    _tables: tables,
    query(table: string): ConvexCollectionReader {
      const records = [...getTable(table)];
      let filtered = records;
      let direction: "asc" | "desc" = "asc";

      const reader: ConvexCollectionReader = {
        withIndex(_indexName: string, builder?: (q: ConvexQuery) => ConvexQuery) {
          if (builder) {
            const constraints: Array<{ field: string; value: unknown; op: string }> = [];
            const q: ConvexQuery = {
              eq(field, value) { constraints.push({ field, value, op: "eq" }); return q; },
              gt(field, value) { constraints.push({ field, value, op: "gt" }); return q; },
              gte(field, value) { constraints.push({ field, value, op: "gte" }); return q; },
              lt(field, value) { constraints.push({ field, value, op: "lt" }); return q; },
              lte(field, value) { constraints.push({ field, value, op: "lte" }); return q; },
            };
            builder(q);
            filtered = filtered.filter((r) =>
              constraints.every((c) => {
                const val = r[c.field];
                if (c.op === "eq") return val === c.value;
                if (c.op === "gt") return typeof val === "number" && val > (c.value as number);
                if (c.op === "gte") return typeof val === "number" && val >= (c.value as number);
                if (c.op === "lt") return typeof val === "number" && val < (c.value as number);
                if (c.op === "lte") return typeof val === "number" && val <= (c.value as number);
                return false;
              })
            );
          }
          return reader;
        },
        order(dir) { direction = dir; return reader; },
        async collect() {
          return direction === "desc" ? [...filtered].reverse() : filtered;
        },
        async unique() {
          return filtered[0] ?? null;
        },
      };
      return reader;
    },
    async get(id: string) {
      for (const records of tables.values()) {
        const found = records.find((r) => r._id === id);
        if (found) return found;
      }
      return null;
    },
    async insert(table: string, value: Record<string, unknown>) {
      const id = `id_${++idCounter}`;
      const record = { _id: id, ...value } as ConvexDbRecord;
      getTable(table).push(record);
      return id;
    },
    async patch(id: string, value: Record<string, unknown>) {
      for (const records of tables.values()) {
        const found = records.find((r) => r._id === id);
        if (found) {
          Object.assign(found, value);
          return;
        }
      }
    },
    async delete(id: string) {
      for (const [, records] of tables.entries()) {
        const idx = records.findIndex((r) => r._id === id);
        if (idx !== -1) {
          records.splice(idx, 1);
          return;
        }
      }
    },
  };
}

export function setup() {
  const db = createMockDb();
  const api = createConvexAuthComponent(db);
  return { db, api };
}

/** Create a base user for tests that need one */
export async function createTestUser(api: ReturnType<typeof createConvexAuthComponent>, overrides: Record<string, unknown> = {}) {
  return api.crud.create("user", {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    email: "test@example.com",
    emailVerified: true,
    name: "Test User",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  });
}

/** Create a base session for tests that need one */
export async function createTestSession(api: ReturnType<typeof createConvexAuthComponent>, userId: string, overrides: Record<string, unknown> = {}) {
  const token = `tok-${Math.random().toString(36).slice(2)}`;
  return api.crud.create("session", {
    id: `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    userId,
    token,
    expiresAt: Date.now() + 86400000,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  });
}
