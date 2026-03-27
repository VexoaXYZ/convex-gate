import type { BetterAuthOptions } from "better-auth";
import type { AuthComponentApi } from "../component/index.js";
import { createComponentBackedAdapter } from "../adapter/componentStore.js";

export interface CreateConvexGateAuthOptions {
  component: AuthComponentApi;
  options?: Omit<BetterAuthOptions, "database">;
}

export function createConvexGateAuthOptions({
  component,
  options,
}: CreateConvexGateAuthOptions): BetterAuthOptions {
  return {
    ...(options ?? {}),
    database: createComponentBackedAdapter({ component }),
  } as BetterAuthOptions;
}
