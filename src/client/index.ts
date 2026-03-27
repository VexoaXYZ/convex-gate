import type { GenericDataModel } from "convex/server";

export interface SessionSnapshot {
  sessionId: string;
  userId: string;
  token: string | null;
  expiresAt: number | null;
}

export interface ConvexGateSessionTransport {
  getSession(): Promise<SessionSnapshot | null>;
  getToken(options?: { forceRefresh?: boolean }): Promise<string | null>;
  clearSession(): Promise<void>;
}

export interface ConvexGateClientConfig<
  DataModel extends GenericDataModel = GenericDataModel,
> {
  dataModel?: DataModel;
  transport: ConvexGateSessionTransport;
}

export interface ConvexGateClient {
  getSession(): Promise<SessionSnapshot | null>;
  getToken(options?: { forceRefresh?: boolean }): Promise<string | null>;
  signOut(): Promise<void>;
}

export interface ConvexGateClientCache {
  session: SessionSnapshot | null;
  token: string | null;
}

export interface ConvexGateCachedClient extends ConvexGateClient {
  clearCache(): void;
}

export function createConvexGateClient<
  DataModel extends GenericDataModel = GenericDataModel,
>(config: ConvexGateClientConfig<DataModel>): ConvexGateCachedClient {
  const cache: ConvexGateClientCache = {
    session: null,
    token: null,
  };

  return {
    async getSession() {
      if (cache.session) {
        return cache.session;
      }
      const session = await config.transport.getSession();
      cache.session = session;
      cache.token = session?.token ?? cache.token;
      return session;
    },
    async getToken(options) {
      if (!options?.forceRefresh && cache.token) {
        return cache.token;
      }
      const token = await config.transport.getToken(options);
      cache.token = token;
      if (cache.session) {
        cache.session = {
          ...cache.session,
          token,
        };
      }
      return token;
    },
    async signOut() {
      cache.session = null;
      cache.token = null;
      await config.transport.clearSession();
    },
    clearCache() {
      cache.session = null;
      cache.token = null;
    },
  };
}
