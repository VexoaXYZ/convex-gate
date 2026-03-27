import { mutationGeneric, queryGeneric } from "convex/server";
import type { GenericDataModel, GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { createConvexAuthComponent, type ConvexDbLike } from "./convexRuntime.js";
import type { AuthComponentApi, AuthComponentModel } from "./index.js";
import {
  crudCountArgsValidator,
  crudCreateArgsValidator,
  crudDeleteManyArgsValidator,
  crudDeleteOneArgsValidator,
  crudFindManyArgsValidator,
  crudFindOneArgsValidator,
  crudUpdateManyArgsValidator,
  crudUpdateOneArgsValidator,
  getSessionWithUserBySessionIdArgsValidator,
  getSessionWithUserByTokenArgsValidator,
  invalidateSessionArgsValidator,
  invalidateUserSessionsArgsValidator,
} from "./validators.js";

type DbCtx = {
  db: ConvexDbLike;
};

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

function getApi(ctx: DbCtx) {
  return createConvexAuthComponent(ctx.db);
}

export function createComponentFunctions() {
  return {
    hotPath: {
      getSessionWithUserByToken: queryGeneric({
        args: getSessionWithUserByTokenArgsValidator,
        handler: async (ctx: GenericQueryCtx<GenericDataModel>, args) => {
          return getApi(ctx as unknown as DbCtx).hotPath.getSessionWithUserByToken(args);
        },
      }),
      getSessionWithUserBySessionId: queryGeneric({
        args: getSessionWithUserBySessionIdArgsValidator,
        handler: async (ctx: GenericQueryCtx<GenericDataModel>, args) => {
          return getApi(ctx as unknown as DbCtx).hotPath.getSessionWithUserBySessionId(
            args
          );
        },
      }),
      invalidateSession: mutationGeneric({
        args: invalidateSessionArgsValidator,
        handler: async (ctx: GenericMutationCtx<GenericDataModel>, args) => {
          return getApi(ctx as unknown as DbCtx).hotPath.invalidateSession(args);
        },
      }),
      invalidateUserSessions: mutationGeneric({
        args: invalidateUserSessionsArgsValidator,
        handler: async (ctx: GenericMutationCtx<GenericDataModel>, args) => {
          return getApi(ctx as unknown as DbCtx).hotPath.invalidateUserSessions(args);
        },
      }),
    },
    crud: {
      create: mutationGeneric({
        args: crudCreateArgsValidator,
        handler: async (ctx: GenericMutationCtx<GenericDataModel>, args) => {
          return getApi(ctx as unknown as DbCtx).crud.create(
            args.model as AuthComponentModel,
            args.data as never
          );
        },
      }),
      findOne: queryGeneric({
        args: crudFindOneArgsValidator,
        handler: async (ctx: GenericQueryCtx<GenericDataModel>, args) => {
          return getApi(ctx as unknown as DbCtx).crud.findOne(
            args.model as AuthComponentModel,
            args.where as never
          );
        },
      }),
      findMany: queryGeneric({
        args: crudFindManyArgsValidator,
        handler: async (ctx: GenericQueryCtx<GenericDataModel>, args) => {
          return getApi(ctx as unknown as DbCtx).crud.findMany(
            args.model as AuthComponentModel,
            args.where as never,
            withOptional(
              withOptional({ limit: args.limit }, "offset", args.offset),
              "sortBy",
              args.sortBy as never
            ) as never
          );
        },
      }),
      count: queryGeneric({
        args: crudCountArgsValidator,
        handler: async (ctx: GenericQueryCtx<GenericDataModel>, args) => {
          return getApi(ctx as unknown as DbCtx).crud.count(
            args.model as AuthComponentModel,
            args.where as never
          );
        },
      }),
      updateOne: mutationGeneric({
        args: crudUpdateOneArgsValidator,
        handler: async (ctx: GenericMutationCtx<GenericDataModel>, args) => {
          return getApi(ctx as unknown as DbCtx).crud.updateOne(
            args as Parameters<AuthComponentApi["crud"]["updateOne"]>[0]
          );
        },
      }),
      updateMany: mutationGeneric({
        args: crudUpdateManyArgsValidator,
        handler: async (ctx: GenericMutationCtx<GenericDataModel>, args) => {
          return getApi(ctx as unknown as DbCtx).crud.updateMany(
            args as Parameters<AuthComponentApi["crud"]["updateMany"]>[0]
          );
        },
      }),
      deleteOne: mutationGeneric({
        args: crudDeleteOneArgsValidator,
        handler: async (ctx: GenericMutationCtx<GenericDataModel>, args) => {
          return getApi(ctx as unknown as DbCtx).crud.deleteOne(
            args as Parameters<AuthComponentApi["crud"]["deleteOne"]>[0]
          );
        },
      }),
      deleteMany: mutationGeneric({
        args: crudDeleteManyArgsValidator,
        handler: async (ctx: GenericMutationCtx<GenericDataModel>, args) => {
          return getApi(ctx as unknown as DbCtx).crud.deleteMany(
            args as Parameters<AuthComponentApi["crud"]["deleteMany"]>[0]
          );
        },
      }),
    },
  };
}

export type ConvexGateComponentFunctions = ReturnType<typeof createComponentFunctions>;
