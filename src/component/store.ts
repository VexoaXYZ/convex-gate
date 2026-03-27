import type { CleanedWhere } from "better-auth/adapters";
import type { ConvexGateStore, ConvexGateStoreRecord } from "../adapter/index.js";
import type {
  AuthComponentApi,
  AuthComponentModel,
  AuthComponentSession,
  AuthComponentUser,
  GetSessionWithUserResult,
} from "./index.js";
import { resolveSessionWithUser } from "./hotPath.js";

function withOptional<T extends object, K extends string, V>(
  target: T,
  key: K,
  value: V | undefined
): T & Partial<Record<K, V>> {
  if (value === undefined) {
    return target;
  }
  return {
    ...target,
    [key]: value,
  };
}

function normalizeWhere(where: CleanedWhere[] | undefined) {
  return (where ?? []).map((clause) => ({ ...clause }));
}

function pickFields(
  record: ConvexGateStoreRecord | null,
  select?: string[]
): ConvexGateStoreRecord | null {
  if (!record || !select?.length) {
    return record;
  }

  const selected: ConvexGateStoreRecord = {};
  for (const field of select) {
    selected[field] = record[field];
  }
  return selected;
}

async function fallbackFindOne(args: {
  api: AuthComponentApi;
  model: string;
  where: CleanedWhere[] | undefined;
  select?: string[];
}) {
  const records = await args.api.crud.findMany(
    args.model as AuthComponentModel,
    normalizeWhere(args.where) as never,
    {
      limit: 1,
    } as never
  );
  return pickFields((records[0] as ConvexGateStoreRecord | undefined) ?? null, args.select);
}

function isSessionModel(model: string) {
  return model === "session";
}

function isSessionByToken(where: CleanedWhere[] | undefined) {
  const tokenClause = where?.find((clause) => clause.field === "token");
  return typeof tokenClause?.value === "string" ? tokenClause.value : null;
}

function isSessionById(where: CleanedWhere[] | undefined) {
  const idClause = where?.find(
    (clause) => clause.field === "id" || clause.field === "_id"
  );
  return typeof idClause?.value === "string" ? idClause.value : null;
}

function materializeSessionWithUser(result: GetSessionWithUserResult) {
  if (!result.session) {
    return null;
  }
  return {
    ...result.session,
    user: result.user,
  };
}

export function createComponentStore(api: AuthComponentApi): ConvexGateStore {
  return {
    async create({ model, data, select }) {
      const created = await api.crud.create(model as AuthComponentModel, data as never);
      return pickFields(created as ConvexGateStoreRecord, select) ?? {};
    },
    async findOne({ model, where, select }) {
      if (isSessionModel(model)) {
        const token = isSessionByToken(where);
        if (token) {
          const result = await api.hotPath.getSessionWithUserByToken({
            token,
            now: Date.now(),
          });
          return pickFields(materializeSessionWithUser(result), select);
        }

        const sessionId = isSessionById(where);
        if (sessionId) {
          const result = await api.hotPath.getSessionWithUserBySessionId({
            sessionId,
            now: Date.now(),
          });
          return pickFields(materializeSessionWithUser(result), select);
        }
      }

      const found = await api.crud.findOne(
        model as AuthComponentModel,
        normalizeWhere(where) as never
      );
      return pickFields(found as ConvexGateStoreRecord | null, select);
    },
    async findMany({ model, where, limit, select, sortBy, offset }) {
      const records = await api.crud.findMany(
        model as AuthComponentModel,
        normalizeWhere(where) as never,
        withOptional(withOptional({ limit }, "offset", offset), "sortBy", sortBy) as never
      );
      return select?.length
        ? records
            .map((record) => pickFields(record as ConvexGateStoreRecord, select))
            .filter((record): record is ConvexGateStoreRecord => Boolean(record))
        : (records as ConvexGateStoreRecord[]);
    },
    count({ model, where }) {
      return api.crud.count(model as AuthComponentModel, normalizeWhere(where) as never);
    },
    async updateOne({ model, where, update }) {
      const updated = await api.crud.updateOne({
        model: model as AuthComponentModel,
        where: normalizeWhere(where) as never,
        update: update as never,
      } as never);
      return (updated as ConvexGateStoreRecord | null) ?? null;
    },
    updateMany({ model, where, update }) {
      return api.crud.updateMany({
        model: model as AuthComponentModel,
        where: normalizeWhere(where) as never,
        update: update as never,
      } as never);
    },
    async deleteOne({ model, where }) {
      if (isSessionModel(model)) {
        const sessionId = isSessionById(where);
        if (sessionId) {
          await api.hotPath.invalidateSession({ sessionId });
          return;
        }
      }

      await api.crud.deleteOne({
        model: model as AuthComponentModel,
        where: normalizeWhere(where) as never,
      } as never);
    },
    deleteMany({ model, where }) {
      return api.crud.deleteMany({
        model: model as AuthComponentModel,
        where: normalizeWhere(where) as never,
      } as never);
    },
  };
}

export function createResolvedSessionResult(args: {
  session: AuthComponentSession | null;
  user: AuthComponentUser | null;
  now: number;
}) {
  return resolveSessionWithUser(args);
}
