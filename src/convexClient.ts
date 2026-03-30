import { httpActionGeneric, queryGeneric } from "convex/server";
import type {
  FunctionReference,
  FunctionReturnType,
  FunctionVisibility,
  GenericDataModel,
  GenericQueryCtx,
  HttpRouter,
  OptionalRestArgs,
} from "convex/server";
import type { BetterAuthOptions } from "better-auth";
import type { CleanedWhere, Where } from "better-auth/adapters";
import { createConvexGateAdapter, type ConvexGateStore } from "./adapter/index.js";
import type { ConvexGateSort, ConvexGateStoreRecord } from "./adapter/index.js";

type QueryRunner = <Query extends FunctionReference<"query", "public" | "internal">>(
  query: Query,
  ...args: OptionalRestArgs<Query>
) => Promise<FunctionReturnType<Query>>;

type MutationRunner = <
  Mutation extends FunctionReference<"mutation", "public" | "internal">,
>(
  mutation: Mutation,
  ...args: OptionalRestArgs<Mutation>
) => Promise<FunctionReturnType<Mutation>>;

export type GenericReadCtx<_DataModel extends GenericDataModel = GenericDataModel> = {
  auth: {
    getUserIdentity(): Promise<{
      subject: string;
      sessionId?: string | null;
    } | null>;
  };
  runQuery: QueryRunner;
};

export type GenericCtx<DataModel extends GenericDataModel = GenericDataModel> =
  GenericReadCtx<DataModel> & {
    runMutation: MutationRunner;
  };

export type CreateAuth<DataModel extends GenericDataModel = GenericDataModel> = (
  ctx: GenericCtx<DataModel>
) => {
  handler(request: Request): Promise<Response>;
  options: BetterAuthOptions;
};

type TrustedOriginsOption = BetterAuthOptions["trustedOrigins"];

type ComponentRef = {
  adapter: {
    create: FunctionReference<
      "mutation",
      "internal",
      { model: string; data: Record<string, unknown> },
      ConvexGateStoreRecord
    >;
    findOne: FunctionReference<
      "query",
      "internal",
      { model: string; where: Where[]; select?: string[]; join?: unknown },
      ConvexGateStoreRecord | null
    >;
    findMany: FunctionReference<
      "query",
      "internal",
      {
        model: string;
        where: Where[];
        limit: number;
        select?: string[];
        sortBy?: ConvexGateSort;
        offset?: number;
        join?: unknown;
      },
      ConvexGateStoreRecord[]
    >;
    count: FunctionReference<
      "query",
      "internal",
      { model: string; where: Where[] },
      number
    >;
    updateOne: FunctionReference<
      "mutation",
      "internal",
      { model: string; where: Where[]; update: Record<string, unknown> },
      ConvexGateStoreRecord | null
    >;
    updateMany: FunctionReference<
      "mutation",
      "internal",
      { model: string; where: Where[]; update: Record<string, unknown> },
      number
    >;
    deleteOne: FunctionReference<
      "mutation",
      "internal",
      { model: string; where: Where[] },
      void
    >;
    deleteMany: FunctionReference<
      "mutation",
      "internal",
      { model: string; where: Where[] },
      number
    >;
  };
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

function createComponentStore<DataModel extends GenericDataModel>(
  ctx: GenericCtx<DataModel>,
  component: ComponentRef
): ConvexGateStore {
  return {
    create({ model, data }) {
      return ctx.runMutation(component.adapter.create, { model, data });
    },
    findOne({ model, where, select, join }) {
      return ctx.runQuery(
        component.adapter.findOne,
        withOptional(
          withOptional(
            {
              model,
              where,
            },
            "select",
            select
          ),
          "join",
          join
        )
      );
    },
    findMany({ model, where, limit, select, sortBy, offset, join }) {
      return ctx.runQuery(
        component.adapter.findMany,
        withOptional(
          withOptional(
            withOptional(
              withOptional(
                {
                  model,
                  where: where ?? [],
                  limit,
                },
                "select",
                select
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
      );
    },
    count({ model, where }) {
      return ctx.runQuery(component.adapter.count, {
        model,
        where: where ?? [],
      });
    },
    updateOne({ model, where, update }) {
      return ctx.runMutation(component.adapter.updateOne, {
        model,
        where,
        update,
      });
    },
    updateMany({ model, where, update }) {
      return ctx.runMutation(component.adapter.updateMany, {
        model,
        where,
        update,
      });
    },
    deleteOne({ model, where }) {
      return ctx.runMutation(component.adapter.deleteOne, {
        model,
        where,
      });
    },
    deleteMany({ model, where }) {
      return ctx.runMutation(component.adapter.deleteMany, {
        model,
        where,
      });
    },
  };
}

function applyCorsHeaders(
  response: Response,
  request: Request,
  allowedOrigins: string[],
  exposedHeaders: string[]
) {
  const origin = request.headers.get("origin");
  if (!origin || (allowedOrigins.length && !allowedOrigins.includes(origin))) {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-credentials", "true");
  headers.set("vary", "Origin");
  if (exposedHeaders.length) {
    headers.set("access-control-expose-headers", exposedHeaders.join(", "));
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function resolveTrustedOrigins(
  trustedOrigins: TrustedOriginsOption,
  request?: Request
): Promise<string[]> {
  if (!trustedOrigins) {
    return [];
  }
  const resolved = Array.isArray(trustedOrigins)
    ? trustedOrigins
    : await trustedOrigins(request);
  return resolved.filter((value): value is string => typeof value === "string");
}

export function createClient<DataModel extends GenericDataModel = GenericDataModel>(
  component: ComponentRef,
  config?: { verbose?: boolean }
) {
  type AuthUser = Record<string, unknown> & { _id: string };

  const safeGetAuthUser = async (ctx: GenericReadCtx<DataModel>): Promise<AuthUser | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }
    return (await ctx.runQuery(component.adapter.findOne, {
      model: "user",
      where: [{ field: "id", operator: "eq", connector: "AND", value: identity.subject }],
    })) as AuthUser | null;
  };

  const getAuthUser = async (ctx: GenericReadCtx<DataModel>): Promise<AuthUser> => {
    const user = await safeGetAuthUser(ctx);
    if (!user) {
      throw new Error("Unauthenticated");
    }
    return user;
  };

  const getHeaders = async (ctx: GenericReadCtx<DataModel>): Promise<Headers> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.sessionId) {
      return new Headers();
    }
    const session = await ctx.runQuery(component.adapter.findOne, {
      model: "session",
      where: [
        {
          field: "id",
          operator: "eq",
          connector: "AND",
          value: identity.sessionId,
        },
      ],
    });
    return new Headers({
      ...(typeof session?.token === "string"
        ? { authorization: `Bearer ${session.token}` }
        : {}),
      ...(typeof session?.ipAddress === "string"
        ? { "x-forwarded-for": session.ipAddress }
        : {}),
    });
  };

  return {
    adapter: (ctx: GenericCtx<DataModel>) =>
      createConvexGateAdapter({
        store: createComponentStore(ctx, component),
        debugLogs: config?.verbose ?? false,
        adapterOptions: {
          isRunMutationCtx: "runMutation" in ctx,
        },
      }),
    getAuth: async (createAuth: CreateAuth<DataModel>, ctx: GenericCtx<DataModel>) => ({
      auth: createAuth(ctx),
      headers: await getHeaders(ctx),
    }),
    getHeaders,
    safeGetAuthUser,
    getAuthUser,
    clientApi: () => ({
      getAuthUser: queryGeneric({
        args: {},
        handler: async (ctx: GenericQueryCtx<DataModel>) => {
          return await getAuthUser(ctx as unknown as GenericReadCtx<DataModel>);
        },
      }),
    }),
    registerRoutes(
      http: HttpRouter,
      createAuth: CreateAuth<DataModel>,
      opts: {
        cors?:
          | boolean
          | {
              allowedOrigins?: string[];
              allowedHeaders?: string[];
              exposedHeaders?: string[];
            };
      } = {}
    ) {
      const staticAuth = createAuth({} as GenericCtx<DataModel>);
      return this.registerRoutesLazy(http, createAuth, {
        ...opts,
        basePath: staticAuth.options.basePath ?? "/api/auth",
        trustedOrigins: staticAuth.options.trustedOrigins,
      });
    },
    registerRoutesLazy(
      http: HttpRouter,
      createAuth: CreateAuth<DataModel>,
      opts: {
        basePath?: string;
        trustedOrigins?: TrustedOriginsOption;
        cors?:
          | boolean
          | {
              allowedOrigins?: string[];
              allowedHeaders?: string[];
              exposedHeaders?: string[];
            };
      } = {}
    ) {
      let registrationAuth: ReturnType<typeof createAuth> | undefined;
      const getRegistrationAuth = () => {
        registrationAuth ??= createAuth({} as GenericCtx<DataModel>);
        return registrationAuth;
      };
      const path = opts.basePath ?? "/api/auth";
      let trustedOriginsOption = opts.trustedOrigins;
      const extraCors = typeof opts.cors === "boolean" ? {} : opts.cors ?? {};
      const exposedHeaders = ["Set-Better-Auth-Cookie"].concat(
        extraCors.exposedHeaders ?? []
      );

      const getAllowedOrigins = async (request?: Request) => {
        const resolvedTrustedOrigins =
          trustedOriginsOption ?? getRegistrationAuth().options.trustedOrigins;
        trustedOriginsOption = resolvedTrustedOrigins;
        return [
          ...(await resolveTrustedOrigins(resolvedTrustedOrigins, request)),
          ...(extraCors.allowedOrigins ?? []),
        ];
      };

      const authRequestHandler = httpActionGeneric(async (ctx, request) => {
        const auth = createAuth(ctx as GenericCtx<DataModel>);
        const response = await auth.handler(request);
        if (!opts.cors) {
          return response;
        }
        return applyCorsHeaders(
          response,
          request,
          await getAllowedOrigins(request),
          exposedHeaders
        );
      });

      if (opts.cors) {
        http.route({
          pathPrefix: `${path}/`,
          method: "OPTIONS",
          handler: httpActionGeneric(async (_ctx, request) => {
            const origin = request.headers.get("origin");
            const allowedOrigins = await getAllowedOrigins(request);
            const headers = new Headers();
            if (origin && (!allowedOrigins.length || allowedOrigins.includes(origin))) {
              headers.set("access-control-allow-origin", origin);
              headers.set("access-control-allow-credentials", "true");
              headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
              headers.set(
                "access-control-allow-headers",
                ["Content-Type", "Better-Auth-Cookie", "Authorization"]
                  .concat(extraCors.allowedHeaders ?? [])
                  .join(", ")
              );
              headers.set("vary", "Origin");
            }
            return new Response(null, { status: 204, headers });
          }),
        });
      }

      http.route({
        pathPrefix: `${path}/`,
        method: "GET",
        handler: authRequestHandler,
      });
      http.route({
        pathPrefix: `${path}/`,
        method: "POST",
        handler: authRequestHandler,
      });
    },
  };
}
