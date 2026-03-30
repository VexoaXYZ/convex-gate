import type {
  AuthComponentApi,
  AuthComponentModel,
  AuthComponentRecordByModel,
  AuthComponentSession,
  AuthComponentUser,
} from "./index.js";
import { resolveSession, resolveSessionWithUser } from "./hotPath.js";

type Direction = "asc" | "desc";

export interface ConvexDbRecord {
  _id: string;
  [key: string]: unknown;
}

export interface ConvexQuery {
  eq(field: string, value: unknown): ConvexQuery;
  gt(field: string, value: number): ConvexQuery;
  gte(field: string, value: number): ConvexQuery;
  lt(field: string, value: number): ConvexQuery;
  lte(field: string, value: number): ConvexQuery;
}

export interface ConvexCollectionReader {
  withIndex(
    indexName: string,
    builder?: (query: ConvexQuery) => ConvexQuery
  ): ConvexCollectionReader;
  order(direction: Direction): ConvexCollectionReader;
  collect(): Promise<ConvexDbRecord[]>;
  unique(): Promise<ConvexDbRecord | null>;
}

export interface ConvexDbLike {
  query(table: string): ConvexCollectionReader;
  get(id: string): Promise<ConvexDbRecord | null>;
  insert(table: string, value: Record<string, unknown>): Promise<string>;
  patch(id: string, value: Record<string, unknown>): Promise<void>;
  delete(id: string): Promise<void>;
}

type WhereClause = Readonly<Record<string, unknown>>;

const INDEXED_FIELDS: Partial<Record<AuthComponentModel, Record<string, string>>> = {
  user: {
    id: "id",
    email: "email",
    createdAt: "createdAt",
  },
  session: {
    id: "id",
    token: "token",
    userId: "userId",
    expiresAt: "expiresAt",
  },
  account: {
    id: "id",
    userId: "userId",
    accountId: "accountId_providerId",
    providerId: "providerId_userId",
  },
  verification: {
    id: "id",
    identifier: "identifier",
    expiresAt: "expiresAt",
  },
  rateLimit: {
    key: "key",
  },
  twoFactor: {
    userId: "userId",
  },
  oauthApplication: {
    clientId: "clientId",
    userId: "userId",
  },
  oauthAccessToken: {
    accessToken: "accessToken",
    refreshToken: "refreshToken",
    clientId: "clientId",
    userId: "userId",
  },
  oauthConsent: {
    userId: "userId",
  },
};

function isAndOnly(where: ReadonlyArray<WhereClause>) {
  return where.every((clause) => clause.connector === undefined || clause.connector === "AND");
}

function getIndexedFieldMap(model: string) {
  return INDEXED_FIELDS[model as AuthComponentModel] ?? null;
}

function getEqClause(where: ReadonlyArray<WhereClause>, field: string) {
  return where.find(
    (clause) => String(clause.field) === field && String(clause.operator ?? "eq") === "eq"
  );
}

function getRangeClause(where: ReadonlyArray<WhereClause>, field: string) {
  return where.find((clause) => {
    if (String(clause.field) !== field) {
      return false;
    }
    const operator = String(clause.operator ?? "eq");
    return operator === "gt" || operator === "gte" || operator === "lt" || operator === "lte";
  });
}

function buildIndexedReader(args: {
  db: ConvexDbLike;
  model: string;
  where: ReadonlyArray<WhereClause>;
  sortBy?: { field: string; direction: Direction };
}) {
  const { db, model, where, sortBy } = args;
  if (!where.length || !isAndOnly(where)) {
    return null;
  }

  const indexMap = getIndexedFieldMap(model);
  if (!indexMap) {
    return null;
  }

  const userIdClause = getEqClause(where, "userId");
  const expiresAtRangeClause = getRangeClause(where, "expiresAt");
  if (model === "session" && userIdClause && expiresAtRangeClause) {
    let reader = db.query(model).withIndex("userId_expiresAt", (query) => {
      let next = query.eq("userId", userIdClause.value);
      const rangeValue = expiresAtRangeClause.value;
      if (typeof rangeValue !== "number") {
        return next;
      }
      switch (String(expiresAtRangeClause.operator)) {
        case "gt":
          return next.gt("expiresAt", rangeValue);
        case "gte":
          return next.gte("expiresAt", rangeValue);
        case "lt":
          return next.lt("expiresAt", rangeValue);
        case "lte":
          return next.lte("expiresAt", rangeValue);
        default:
          return next;
      }
    });
    if (sortBy) {
      reader = reader.order(sortBy.direction);
    }
    return reader;
  }

  for (const clause of where) {
    const field = String(clause.field);
    const operator = String(clause.operator ?? "eq");
    const indexName = indexMap[field];
    if (!indexName) {
      continue;
    }

    let reader = db.query(model).withIndex(indexName, (query) => {
      switch (operator) {
        case "eq":
          return query.eq(field, clause.value);
        case "gt":
          return typeof clause.value === "number" ? query.gt(field, clause.value) : query;
        case "gte":
          return typeof clause.value === "number" ? query.gte(field, clause.value) : query;
        case "lt":
          return typeof clause.value === "number" ? query.lt(field, clause.value) : query;
        case "lte":
          return typeof clause.value === "number" ? query.lte(field, clause.value) : query;
        default:
          return query;
      }
    });
    if (sortBy) {
      reader = reader.order(sortBy.direction);
    }
    return reader;
  }

  return null;
}

function matchesWhere(
  record: ConvexDbRecord,
  where: ReadonlyArray<WhereClause>
) {
  if (!where.length) {
    return true;
  }

  let result: boolean | undefined;
  for (const clause of where) {
    const field = String(clause.field);
    const operator = String(clause.operator ?? "eq");
    const connector = clause.connector === "OR" ? "OR" : "AND";
    const actual = field === "id" ? (record.id ?? record._id) : record[field];
    const expected = clause.value;
    let clauseResult = false;

    switch (operator) {
      case "eq":
        clauseResult = actual === expected;
        break;
      case "ne":
        clauseResult = actual !== expected;
        break;
      case "gt":
        clauseResult =
          typeof actual === "number" &&
          typeof expected === "number" &&
          actual > expected;
        break;
      case "gte":
        clauseResult =
          typeof actual === "number" &&
          typeof expected === "number" &&
          actual >= expected;
        break;
      case "lt":
        clauseResult =
          typeof actual === "number" &&
          typeof expected === "number" &&
          actual < expected;
        break;
      case "lte":
        clauseResult =
          typeof actual === "number" &&
          typeof expected === "number" &&
          actual <= expected;
        break;
      case "in":
        clauseResult = Array.isArray(expected) && expected.includes(actual);
        break;
      case "not_in":
        clauseResult = Array.isArray(expected) && !expected.includes(actual);
        break;
      case "contains":
        clauseResult =
          typeof actual === "string" && typeof expected === "string"
            ? actual.includes(expected)
            : Array.isArray(actual)
              ? actual.includes(expected)
              : false;
        break;
      case "starts_with":
        clauseResult =
          typeof actual === "string" && typeof expected === "string"
            ? actual.startsWith(expected)
            : false;
        break;
      case "ends_with":
        clauseResult =
          typeof actual === "string" && typeof expected === "string"
            ? actual.endsWith(expected)
            : false;
        break;
      default:
        throw new Error(`Unsupported where operator: ${operator}`);
    }

    if (result === undefined) {
      result = clauseResult;
      continue;
    }
    result = connector === "OR" ? result || clauseResult : result && clauseResult;
  }

  return result ?? true;
}

function applySort(
  records: ConvexDbRecord[],
  sortBy:
    | {
        field: string;
        direction: Direction;
      }
    | undefined
) {
  if (!sortBy) {
    return records;
  }
  return [...records].sort((left, right) => {
    const a = left[sortBy.field];
    const b = right[sortBy.field];
    const comparison =
      typeof a === "number" && typeof b === "number"
        ? a - b
        : String(a).localeCompare(String(b));
    return sortBy.direction === "asc" ? comparison : -comparison;
  });
}

function toPublicRecord(record: ConvexDbRecord | null) {
  if (!record) {
    return null;
  }
  return {
    ...record,
    id: typeof record.id === "string" ? record.id : record._id,
  };
}

async function queryAll(db: ConvexDbLike, model: string) {
  return db.query(model).collect();
}

async function queryByWhere(args: {
  db: ConvexDbLike;
  model: string;
  where: ReadonlyArray<WhereClause>;
  sortBy?: { field: string; direction: Direction };
}) {
  const reader = buildIndexedReader(args);
  if (reader) {
    return reader.collect();
  }
  return queryAll(args.db, args.model);
}

async function findOneByField(
  db: ConvexDbLike,
  table: string,
  indexName: string,
  field: string,
  value: string
) {
  return db
    .query(table)
    .withIndex(indexName, (query) => query.eq(field, value))
    .unique();
}

async function findSessionByToken(db: ConvexDbLike, token: string) {
  return findOneByField(db, "session", "token", "token", token);
}

async function findSessionById(db: ConvexDbLike, sessionId: string) {
  return findOneByField(db, "session", "id", "id", sessionId);
}

async function findUserById(db: ConvexDbLike, userId: string) {
  return findOneByField(db, "user", "id", "id", userId);
}

export function createConvexAuthComponent(db: ConvexDbLike): AuthComponentApi {
  return {
    hotPath: {
      async getSessionByToken({ token }) {
        const session = (await findSessionByToken(db, token)) as
          | (ConvexDbRecord & AuthComponentSession)
          | null;
        return resolveSession({
          session: toPublicRecord(session) as AuthComponentSession | null,
          now: Date.now(),
        });
      },
      async getSessionBySessionId({ sessionId }) {
        const session = (await findSessionById(db, sessionId)) as
          | (ConvexDbRecord & AuthComponentSession)
          | null;
        return resolveSession({
          session: toPublicRecord(session) as AuthComponentSession | null,
          now: Date.now(),
        });
      },
      async getSessionWithUserByToken({ token, now }) {
        const session = (await findSessionByToken(db, token)) as
          | (ConvexDbRecord & AuthComponentSession)
          | null;
        if (!session) {
          return { session: null, user: null };
        }
        const user = (await findUserById(db, session.userId)) as
          | (ConvexDbRecord & AuthComponentUser)
          | null;
        return resolveSessionWithUser({
          session: toPublicRecord(session) as AuthComponentSession | null,
          user: toPublicRecord(user) as AuthComponentUser | null,
          now,
        });
      },
      async getSessionWithUserBySessionId({ sessionId, now }) {
        const session = (await findSessionById(db, sessionId)) as
          | (ConvexDbRecord & AuthComponentSession)
          | null;
        if (!session) {
          return { session: null, user: null };
        }
        const user = (await findUserById(db, session.userId)) as
          | (ConvexDbRecord & AuthComponentUser)
          | null;
        return resolveSessionWithUser({
          session: toPublicRecord(session) as AuthComponentSession | null,
          user: toPublicRecord(user) as AuthComponentUser | null,
          now,
        });
      },
      async invalidateSession({ sessionId }) {
        const session = await findOneByField(db, "session", "id", "id", sessionId);
        if (session) {
          await db.delete(session._id);
        }
      },
      async invalidateUserSessions({ userId }) {
        const sessions = await db
          .query("session")
          .withIndex("userId", (query) => query.eq("userId", userId))
          .collect();
        for (const session of sessions) {
          await db.delete(session._id);
        }
        return sessions.length;
      },
    },
    crud: {
      async create(model, data) {
        const createdId = await db.insert(model, data);
        const inserted = await db.get(createdId);
        return (toPublicRecord(inserted) ?? { id: createdId }) as AuthComponentRecordByModel<
          typeof model
        >;
      },
      async findOne(model, where) {
        const records = await queryByWhere({
          db,
          model,
          where: where as ReadonlyArray<WhereClause>,
        });
        const found = records.find((record) => matchesWhere(record, where)) ?? null;
        return toPublicRecord(found) as AuthComponentRecordByModel<typeof model> | null;
      },
      async findMany(model, where, options) {
        const records = await queryByWhere({
          db,
          model,
          where: where as ReadonlyArray<WhereClause>,
          ...(options.sortBy
            ? {
                sortBy: options.sortBy as { field: string; direction: Direction },
              }
            : {}),
        });
        const filtered = records.filter((record) => matchesWhere(record, where));
        const sorted = applySort(filtered, options.sortBy);
        const offset = options.offset ?? 0;
        return sorted
          .slice(offset, offset + options.limit)
          .map(
            (record) =>
              (toPublicRecord(record) ?? { id: record._id }) as AuthComponentRecordByModel<
                typeof model
              >
          );
      },
      async count(model, where) {
        const records = await queryByWhere({
          db,
          model,
          where: where as ReadonlyArray<WhereClause>,
        });
        return records.filter((record) => matchesWhere(record, where)).length;
      },
      async updateOne({ model, where, update }) {
        const records = await queryByWhere({
          db,
          model,
          where: where as ReadonlyArray<WhereClause>,
        });
        const found = records.find((record) => matchesWhere(record, where)) ?? null;
        if (!found) {
          return null;
        }
        await db.patch(found._id, update);
        const updated = await db.get(found._id);
        return toPublicRecord(updated) as AuthComponentRecordByModel<typeof model> | null;
      },
      async updateMany({ model, where, update }) {
        const records = await queryByWhere({
          db,
          model,
          where: where as ReadonlyArray<WhereClause>,
        });
        const matches = records.filter((record) => matchesWhere(record, where));
        for (const record of matches) {
          await db.patch(record._id, update);
        }
        return matches.length;
      },
      async deleteOne({ model, where }) {
        const records = await queryByWhere({
          db,
          model,
          where: where as ReadonlyArray<WhereClause>,
        });
        const found = records.find((record) => matchesWhere(record, where)) ?? null;
        if (found) {
          await db.delete(found._id);
        }
      },
      async deleteMany({ model, where }) {
        const records = await queryByWhere({
          db,
          model,
          where: where as ReadonlyArray<WhereClause>,
        });
        const matches = records.filter((record) => matchesWhere(record, where));
        for (const record of matches) {
          await db.delete(record._id);
        }
        return matches.length;
      },
    },
  };
}
