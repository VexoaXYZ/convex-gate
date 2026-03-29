import type {
  AuthComponentApi,
  AuthComponentCreateInputByModel,
  AuthComponentModel,
  AuthComponentSortBy,
  AuthComponentWhereClause,
} from "./index.js";

export function createComponentBindings(api: AuthComponentApi) {
  return {
    hotPath: {
      getSessionByToken(args: Parameters<AuthComponentApi["hotPath"]["getSessionByToken"]>[0]) {
        return api.hotPath.getSessionByToken(args);
      },
      getSessionBySessionId(
        args: Parameters<AuthComponentApi["hotPath"]["getSessionBySessionId"]>[0]
      ) {
        return api.hotPath.getSessionBySessionId(args);
      },
      getSessionWithUserByToken(args: Parameters<AuthComponentApi["hotPath"]["getSessionWithUserByToken"]>[0]) {
        return api.hotPath.getSessionWithUserByToken(args);
      },
      getSessionWithUserBySessionId(
        args: Parameters<AuthComponentApi["hotPath"]["getSessionWithUserBySessionId"]>[0]
      ) {
        return api.hotPath.getSessionWithUserBySessionId(args);
      },
      invalidateSession(
        args: Parameters<AuthComponentApi["hotPath"]["invalidateSession"]>[0]
      ) {
        return api.hotPath.invalidateSession(args);
      },
      invalidateUserSessions(
        args: Parameters<AuthComponentApi["hotPath"]["invalidateUserSessions"]>[0]
      ) {
        return api.hotPath.invalidateUserSessions(args);
      },
    },
    crud: {
      create<Model extends AuthComponentModel>(
        model: Model,
        data: AuthComponentCreateInputByModel<Model>
      ) {
        return api.crud.create(model, data);
      },
      findOne<Model extends AuthComponentModel>(
        model: Model,
        where: ReadonlyArray<AuthComponentWhereClause<Model>>
      ) {
        return api.crud.findOne(model, where);
      },
      findMany<Model extends AuthComponentModel>(
        model: Model,
        where: ReadonlyArray<AuthComponentWhereClause<Model>>,
        options: {
          limit: number;
          offset?: number;
          sortBy?: AuthComponentSortBy<Model>;
        }
      ) {
        return api.crud.findMany(model, where, options);
      },
      count<Model extends AuthComponentModel>(
        model: Model,
        where: ReadonlyArray<AuthComponentWhereClause<Model>>
      ) {
        return api.crud.count(model, where);
      },
      updateOne(args: Parameters<AuthComponentApi["crud"]["updateOne"]>[0]) {
        return api.crud.updateOne(args);
      },
      updateMany(args: Parameters<AuthComponentApi["crud"]["updateMany"]>[0]) {
        return api.crud.updateMany(args);
      },
      deleteOne(args: Parameters<AuthComponentApi["crud"]["deleteOne"]>[0]) {
        return api.crud.deleteOne(args);
      },
      deleteMany(args: Parameters<AuthComponentApi["crud"]["deleteMany"]>[0]) {
        return api.crud.deleteMany(args);
      },
    },
  };
}
