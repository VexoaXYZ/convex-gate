import { betterAuth } from "better-auth";
import type { BetterAuthOptions } from "better-auth";
import type { AuthComponentApi } from "../component/index.js";
import { createComponentFunctions } from "../component/functions.js";
import { createConvexGateAuthOptions } from "./options.js";
import { createComponentBackedAdapter } from "../adapter/componentStore.js";

export interface CreateConvexGateAuthConfig {
  component: AuthComponentApi;
  options?: Omit<BetterAuthOptions, "database">;
}

export function createConvexGateAuth(config: CreateConvexGateAuthConfig) {
  const authOptions = createConvexGateAuthOptions(config);
  const auth = betterAuth(authOptions);

  return {
    auth,
    options: authOptions,
    adapter: createComponentBackedAdapter({
      component: config.component,
    }),
    component: {
      api: config.component,
      functions: createComponentFunctions(),
    },
  };
}
