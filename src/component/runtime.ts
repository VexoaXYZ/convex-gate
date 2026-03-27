import type {
  AuthComponentApi,
  AuthComponentCreateInputByModel,
  AuthComponentCrudApi,
  AuthComponentModel,
  AuthComponentRecordByModel,
  AuthComponentSession,
  AuthComponentSortBy,
  AuthComponentUser,
  AuthComponentWhereClause,
  GetSessionWithUserResult,
} from "./index.js";
import { AUTH_COMPONENT_MODELS } from "./models.js";
import { resolveSessionWithUser } from "./hotPath.js";

type AnyRecord = Record<string, unknown>;
type SortDirection = "asc" | "desc";

export type InMemoryAuthComponentState = {
  [Model in AuthComponentModel]: Map<string, AuthComponentRecordByModel<Model>>;
};

export interface CreateInMemoryAuthComponentOptions {
  initialState?: Partial<{
    [Model in AuthComponentModel]: Array<AuthComponentRecordByModel<Model>>;
  }>;
}

function createState(
  initialState: CreateInMemoryAuthComponentOptions["initialState"] = {}
): InMemoryAuthComponentState {
  return {
    user: new Map((initialState.user ?? []).map((record) => [record.id, record])),
    session: new Map((initialState.session ?? []).map((record) => [record.id, record])),
    account: new Map((initialState.account ?? []).map((record) => [record.id, record])),
    verification: new Map(
      (initialState.verification ?? []).map((record) => [record.id, record])
    ),
    rateLimit: new Map((initialState.rateLimit ?? []).map((record) => [record.id, record])),
    twoFactor: new Map((initialState.twoFactor ?? []).map((record) => [record.id, record])),
    oauthApplication: new Map(
      (initialState.oauthApplication ?? []).map((record) => [record.id, record])
    ),
    oauthAccessToken: new Map(
      (initialState.oauthAccessToken ?? []).map((record) => [record.id, record])
    ),
    oauthConsent: new Map(
      (initialState.oauthConsent ?? []).map((record) => [record.id, record])
    ),
    jwks: new Map((initialState.jwks ?? []).map((record) => [record.id, record])),
  };
}

function getTable<Model extends AuthComponentModel>(
  state: InMemoryAuthComponentState,
  model: Model
): Map<string, AuthComponentRecordByModel<Model>> {
  if (!AUTH_COMPONENT_MODELS.includes(model)) {
    throw new Error(`Unsupported auth component model: ${model}`);
  }
  return state[model] as Map<string, AuthComponentRecordByModel<Model>>;
}

function compareValues(
  left: unknown,
  operator: string | undefined,
  right: unknown
): boolean {
  switch (operator ?? "eq") {
    case "eq":
      return left === right;
    case "ne":
      return left !== right;
    case "gt":
      return typeof left === "number" && typeof right === "number" && left > right;
    case "gte":
      return typeof left === "number" && typeof right === "number" && left >= right;
    case "lt":
      return typeof left === "number" && typeof right === "number" && left < right;
    case "lte":
      return typeof left === "number" && typeof right === "number" && left <= right;
    case "in":
      return Array.isArray(right) && right.includes(left);
    case "not_in":
      return Array.isArray(right) && !right.includes(left);
    case "contains":
      return typeof left === "string" && typeof right === "string"
        ? left.includes(right)
        : Array.isArray(left)
          ? left.includes(right)
          : false;
    case "starts_with":
      return typeof left === "string" && typeof right === "string"
        ? left.startsWith(right)
        : false;
    case "ends_with":
      return typeof left === "string" && typeof right === "string"
        ? left.endsWith(right)
        : false;
    default:
      throw new Error(`Unsupported operator: ${operator}`);
  }
}

function matchesWhere(
  record: AnyRecord,
  where: ReadonlyArray<Record<string, unknown>>
) {
  if (!where.length) {
    return true;
  }

  let result: boolean | undefined;
  for (const clause of where) {
    const field = String(clause.field);
    const operator =
      clause.operator === undefined ? undefined : String(clause.operator);
    const connector = clause.connector === "OR" ? "OR" : "AND";
    const clauseResult = compareValues(record[field], operator, clause.value);

    if (result === undefined) {
      result = clauseResult;
      continue;
    }

    result = connector === "OR" ? result || clauseResult : result && clauseResult;
  }

  return result ?? true;
}

function matchesWhereByModel<Model extends AuthComponentModel>(
  record: AuthComponentRecordByModel<Model>,
  where: ReadonlyArray<AuthComponentWhereClause<Model>>
) {
  return matchesWhere(record as AnyRecord, where as ReadonlyArray<Record<string, unknown>>);
}

function applySort(
  records: AnyRecord[],
  sortBy:
    | {
        field: string;
        direction: SortDirection;
      }
    | undefined
) {
  if (!sortBy) {
    return records;
  }
  return [...records].sort((left, right) => {
    const a = left[sortBy.field];
    const b = right[sortBy.field];
    let comparison = 0;

    if (a === b) {
      comparison = 0;
    } else if (typeof a === "number" && typeof b === "number") {
      comparison = a - b;
    } else {
      comparison = String(a).localeCompare(String(b));
    }

    return sortBy.direction === "asc" ? comparison : -comparison;
  });
}

function applySortByModel<Model extends AuthComponentModel>(
  records: Array<AuthComponentRecordByModel<Model>>,
  sortBy: AuthComponentSortBy<Model> | undefined
) {
  return applySort(
    records as AnyRecord[],
    sortBy as { field: string; direction: SortDirection } | undefined
  ) as Array<AuthComponentRecordByModel<Model>>;
}

function createGeneratedId(model: AuthComponentModel) {
  return `${model}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

function toStoredRecord<Model extends AuthComponentModel>(
  model: Model,
  record: AuthComponentCreateInputByModel<Model>
): AuthComponentRecordByModel<Model> {
  const id =
    "id" in record && typeof record.id === "string"
      ? record.id
      : createGeneratedId(model);
  return {
    ...record,
    id,
  } as AuthComponentRecordByModel<Model>;
}

function findSessionWithUser(args: {
  state: InMemoryAuthComponentState;
  session: AuthComponentSession | null;
  now: number;
}): GetSessionWithUserResult {
  const { state, session, now } = args;
  const user = session
    ? ((state.user.get(session.userId) as AuthComponentUser | undefined) ?? null)
    : null;
  return resolveSessionWithUser({
    session,
    user,
    now,
  });
}

export function createInMemoryAuthComponent(
  options: CreateInMemoryAuthComponentOptions = {}
): AuthComponentApi {
  const state = createState(options.initialState);

  const crud: AuthComponentCrudApi = {
    async create(model, data) {
      const table = getTable(state, model);
      const record = toStoredRecord(model, data);
      table.set(record.id, record);
      return record;
    },
    async findOne(model, where) {
      const table = getTable(state, model);
      for (const record of table.values()) {
        if (matchesWhereByModel(record, where)) {
          return record;
        }
      }
      return null;
    },
    async findMany(model, where, options) {
      const table = getTable(state, model);
      const records = [...table.values()].filter((record) => matchesWhereByModel(record, where));
      const sorted = applySortByModel(records, options.sortBy);
      const offset = options.offset ?? 0;
      return sorted.slice(offset, offset + options.limit);
    },
    async count(model, where) {
      const table = getTable(state, model);
      return [...table.values()].filter((record) => matchesWhereByModel(record, where)).length;
    },
    async updateOne({ model, where, update }) {
      const table = getTable(state, model);
      for (const [id, record] of table.entries()) {
        if (!matchesWhereByModel(record, where)) {
          continue;
        }
        const next = {
          ...record,
          ...update,
          id,
        } as AuthComponentRecordByModel<typeof model>;
        table.set(id, next);
        return next;
      }
      return null;
    },
    async updateMany({ model, where, update }) {
      const table = getTable(state, model);
      let count = 0;
      for (const [id, record] of table.entries()) {
        if (!matchesWhereByModel(record, where)) {
          continue;
        }
        table.set(
          id,
          {
            ...record,
            ...update,
            id,
          } as AuthComponentRecordByModel<typeof model>
        );
        count += 1;
      }
      return count;
    },
    async deleteOne({ model, where }) {
      const table = getTable(state, model);
      for (const [id, record] of table.entries()) {
        if (!matchesWhereByModel(record, where)) {
          continue;
        }
        table.delete(id);
        return;
      }
    },
    async deleteMany({ model, where }) {
      const table = getTable(state, model);
      let count = 0;
      for (const [id, record] of [...table.entries()]) {
        if (!matchesWhereByModel(record, where)) {
          continue;
        }
        table.delete(id);
        count += 1;
      }
      return count;
    },
  };

  return {
    hotPath: {
      async getSessionWithUserByToken({ token, now }) {
        for (const session of state.session.values()) {
          if (session.token !== token) {
            continue;
          }
          return findSessionWithUser({
            state,
            session,
            now,
          });
        }
        return { session: null, user: null };
      },
      async getSessionWithUserBySessionId({ sessionId, now }) {
        const session = state.session.get(sessionId) ?? null;
        return findSessionWithUser({
          state,
          session,
          now,
        });
      },
      async invalidateSession({ sessionId }) {
        state.session.delete(sessionId);
      },
      async invalidateUserSessions({ userId }) {
        let count = 0;
        for (const [id, session] of [...state.session.entries()]) {
          if (session.userId !== userId) {
            continue;
          }
          state.session.delete(id);
          count += 1;
        }
        return count;
      },
    },
    crud,
  };
}
