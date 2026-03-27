import { createAuthClient } from "better-auth/react";
import { anonymousClient } from "better-auth/client/plugins";
import {
  convexClient,
  crossDomainClient,
} from "convex-gate/client/plugins";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_CONVEX_SITE_URL,
  plugins: [
    anonymousClient(),
    crossDomainClient(),
    convexClient(),
  ],
});
