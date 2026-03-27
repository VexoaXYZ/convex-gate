import { createAdapterFactory } from "better-auth/adapters";
import type { BetterAuthOptions } from "better-auth";
import type {
  CleanedWhere,
  DBAdapterDebugLogOption,
} from "better-auth/adapters";

export type ConvexGateSort = {
  field: string;
  direction: "asc" | "desc";
};

export interface ConvexGateStoreRecord {
  [key: string]: unknown;
}

export interface ConvexGateStore {
  create(args: {
    model: string;
    data: Record<string, unknown>;
    select?: string[];
  }): Promise<ConvexGateStoreRecord>;
  findOne(args: {
    model: string;
    where: CleanedWhere[];
    select?: string[];
    join?: unknown;
  }): Promise<ConvexGateStoreRecord | null>;
  findMany(args: {
    model: string;
    where?: CleanedWhere[];
    limit: number;
    select?: string[];
    sortBy?: ConvexGateSort;
    offset?: number;
    join?: unknown;
  }): Promise<ConvexGateStoreRecord[]>;
  count(args: {
    model: string;
    where?: CleanedWhere[];
  }): Promise<number>;
  updateOne(args: {
    model: string;
    where: CleanedWhere[];
    update: Record<string, unknown>;
  }): Promise<ConvexGateStoreRecord | null>;
  updateMany(args: {
    model: string;
    where: CleanedWhere[];
    update: Record<string, unknown>;
  }): Promise<number>;
  deleteOne(args: {
    model: string;
    where: CleanedWhere[];
  }): Promise<void>;
  deleteMany(args: {
    model: string;
    where: CleanedWhere[];
  }): Promise<number>;
}

export interface ConvexGateAdapterConfig {
  store: ConvexGateStore;
  debugLogs?: DBAdapterDebugLogOption;
}

function cloneWhere(where: CleanedWhere[] | undefined): CleanedWhere[] | undefined {
  return where?.map((clause) => ({ ...clause }));
}

function cloneSelect(select: string[] | undefined): string[] | undefined {
  return select ? [...select] : undefined;
}

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

export function createConvexGateAdapter({
  store,
  debugLogs = false,
}: ConvexGateAdapterConfig) {
  return createAdapterFactory({
    config: {
      adapterId: "convex-gate",
      adapterName: "Convex Gate",
      debugLogs,
      usePlural: false,
      supportsNumericIds: false,
      supportsJSON: false,
      supportsDates: false,
      supportsArrays: true,
      transaction: false,
      customTransformInput({ data, fieldAttributes }) {
        if (data && fieldAttributes.type === "date") {
          return new Date(data).getTime();
        }
        return data;
      },
      customTransformOutput({ data, fieldAttributes }) {
        if (data && fieldAttributes.type === "date") {
          return new Date(data);
        }
        return data;
      },
    },
    adapter: () => ({
      create<T extends Record<string, unknown>>({
        model,
        data,
        select,
      }: {
        model: string;
        data: T;
        select?: string[] | undefined;
      }) {
        return store.create(
          withOptional(
            {
              model,
              data,
            },
            "select",
            cloneSelect(select)
          )
        ) as Promise<T>;
      },
      findOne<T>({
        model,
        where,
        select,
        join,
      }: {
        model: string;
        where: CleanedWhere[];
        select?: string[] | undefined;
        join?: unknown;
      }) {
        return store.findOne(
          withOptional(
            withOptional(
              {
                model,
                where: cloneWhere(where) ?? [],
              },
              "select",
              cloneSelect(select)
            ),
            "join",
            join
          )
        ) as Promise<T | null>;
      },
      findMany<T>({
        model,
        where,
        limit,
        select,
        sortBy,
        offset,
        join,
      }: {
        model: string;
        where?: CleanedWhere[] | undefined;
        limit: number;
        select?: string[] | undefined;
        sortBy?: ConvexGateSort | undefined;
        offset?: number | undefined;
        join?: unknown;
      }) {
        return store.findMany(
          withOptional(
            withOptional(
              withOptional(
                withOptional(
                  withOptional(
                    {
                      model,
                      limit,
                    },
                    "where",
                    cloneWhere(where)
                  ),
                  "select",
                  cloneSelect(select)
                ),
                "sortBy",
                sortBy
              ),
              "offset",
              offset
            ),
            "join",
            join
          )
        ) as Promise<T[]>;
      },
      count({
        model,
        where,
      }: {
        model: string;
        where?: CleanedWhere[] | undefined;
      }) {
        return store.count(
          withOptional(
            {
              model,
            },
            "where",
            cloneWhere(where)
          )
        );
      },
      update<T>({
        model,
        where,
        update,
      }: {
        model: string;
        where: CleanedWhere[];
        update: T;
      }) {
        return store.updateOne({
          model,
          where: cloneWhere(where) ?? [],
          update: update as Record<string, unknown>,
        }) as Promise<T | null>;
      },
      updateMany({
        model,
        where,
        update,
      }: {
        model: string;
        where: CleanedWhere[];
        update: Record<string, unknown>;
      }) {
        return store.updateMany({
          model,
          where: cloneWhere(where) ?? [],
          update,
        });
      },
      delete({
        model,
        where,
      }: {
        model: string;
        where: CleanedWhere[];
      }) {
        return store.deleteOne({
          model,
          where: cloneWhere(where) ?? [],
        });
      },
      deleteMany({
        model,
        where,
      }: {
        model: string;
        where: CleanedWhere[];
      }) {
        return store.deleteMany({
          model,
          where: cloneWhere(where) ?? [],
        });
      },
    }),
  });
}

export type ConvexGateAdapterFactory = ReturnType<typeof createConvexGateAdapter>;
export type ConvexGateAdapterInstance = ReturnType<ConvexGateAdapterFactory>;
export type ConvexGateBetterAuthOptions = BetterAuthOptions;

export * from "./componentStore.js";
