import type { AuthConfig } from "convex/server";
import { getAuthConfigProvider } from "convex-gate/auth-config";

export default {
  providers: [getAuthConfigProvider()],
} satisfies AuthConfig;
