import type { BetterAuthClientPlugin } from "better-auth/client";
import type { convex } from "./index.js";

export function convexClient() {
  return {
    id: "convex",
    $InferServerPlugin: {} as ReturnType<typeof convex>,
  } satisfies BetterAuthClientPlugin;
}
