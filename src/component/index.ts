import type { WhereOperator } from "better-auth/adapters";
import type { AuthComponentModel } from "./models.js";
import type { AuthDocumentByName } from "./schema.js";

export type AuthComponentRecordByModel<
  Model extends AuthComponentModel,
> = Omit<AuthDocumentByName<Model>, "_id" | "_creationTime"> & {
  id: string;
};

export type AuthComponentCreateInputByModel<
  Model extends AuthComponentModel,
> = Omit<AuthDocumentByName<Model>, "_id" | "_creationTime">;

export type AuthComponentUpdateInputByModel<
  Model extends AuthComponentModel,
> = Partial<AuthComponentCreateInputByModel<Model>>;

type AuthComparablePrimitive = string | number | boolean | Date;

type AuthWhereValue<Value> =
  | Extract<NonNullable<Value>, AuthComparablePrimitive>
  | null
  | Array<Extract<NonNullable<Value>, string | number>>;

export type AuthComponentWhereClause<
  Model extends AuthComponentModel,
> = {
  [Field in keyof AuthComponentRecordByModel<Model> & string]: {
    field: Field;
    value: AuthWhereValue<AuthComponentRecordByModel<Model>[Field]>;
    operator?: WhereOperator;
    connector?: "AND" | "OR";
  };
}[keyof AuthComponentRecordByModel<Model> & string];

export type AuthComponentSortBy<Model extends AuthComponentModel> = {
  field: keyof AuthComponentRecordByModel<Model> & string;
  direction: "asc" | "desc";
};

export type AuthComponentUser = AuthComponentRecordByModel<"user">;
export type AuthComponentSession = AuthComponentRecordByModel<"session">;
export type AuthComponentAccount = AuthComponentRecordByModel<"account">;
export type AuthComponentVerification = AuthComponentRecordByModel<"verification">;

export interface GetSessionWithUserResult {
  session: AuthComponentSession | null;
  user: AuthComponentUser | null;
}

export interface AuthComponentHotPathApi {
  getSessionWithUserByToken(args: {
    token: string;
    now: number;
  }): Promise<GetSessionWithUserResult>;
  getSessionWithUserBySessionId(args: {
    sessionId: string;
    now: number;
  }): Promise<GetSessionWithUserResult>;
  invalidateSession(args: {
    sessionId: string;
  }): Promise<void>;
  invalidateUserSessions(args: {
    userId: string;
  }): Promise<number>;
}

export interface AuthComponentCrudApi {
  create<Model extends AuthComponentModel>(
    model: Model,
    data: AuthComponentCreateInputByModel<Model>
  ): Promise<AuthComponentRecordByModel<Model>>;
  findOne<Model extends AuthComponentModel>(
    model: Model,
    where: ReadonlyArray<AuthComponentWhereClause<Model>>
  ): Promise<AuthComponentRecordByModel<Model> | null>;
  findMany<Model extends AuthComponentModel>(
    model: Model,
    where: ReadonlyArray<AuthComponentWhereClause<Model>>,
    options: {
      limit: number;
      offset?: number;
      sortBy?: AuthComponentSortBy<Model>;
    }
  ): Promise<Array<AuthComponentRecordByModel<Model>>>;
  count<Model extends AuthComponentModel>(
    model: Model,
    where: ReadonlyArray<AuthComponentWhereClause<Model>>
  ): Promise<number>;
  updateOne<Model extends AuthComponentModel>(args: {
    model: Model;
    where: ReadonlyArray<AuthComponentWhereClause<Model>>;
    update: AuthComponentUpdateInputByModel<Model>;
  }): Promise<AuthComponentRecordByModel<Model> | null>;
  updateMany<Model extends AuthComponentModel>(args: {
    model: Model;
    where: ReadonlyArray<AuthComponentWhereClause<Model>>;
    update: AuthComponentUpdateInputByModel<Model>;
  }): Promise<number>;
  deleteOne<Model extends AuthComponentModel>(args: {
    model: Model;
    where: ReadonlyArray<AuthComponentWhereClause<Model>>;
  }): Promise<void>;
  deleteMany<Model extends AuthComponentModel>(args: {
    model: Model;
    where: ReadonlyArray<AuthComponentWhereClause<Model>>;
  }): Promise<number>;
}

export interface AuthComponentApi {
  hotPath: AuthComponentHotPathApi;
  crud: AuthComponentCrudApi;
}

export * from "./hotPath.js";
export * from "./bindings.js";
export * from "./convex.config.js";
export * from "./convexRuntime.js";
export * from "./functions.js";
export * from "./models.js";
export * from "./runtime.js";
export * from "./schema.js";
export * from "./store.js";
export * from "./validators.js";
