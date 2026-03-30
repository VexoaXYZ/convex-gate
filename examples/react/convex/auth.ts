import { createClient, type GenericCtx } from "convex-gate";
import { convex, crossDomain } from "convex-gate/plugins";
import { requireActionCtx } from "convex-gate/utils";
import { components } from "./_generated/api";
import { query } from "./_generated/server";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { anonymous } from "better-auth/plugins/anonymous";
import { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";

const siteUrl = process.env.SITE_URL!;

export const authComponent = createClient<DataModel>(components.betterAuth, {
  verbose: false,
});

export const createAuthOptions = (ctx: GenericCtx<DataModel>) =>
  ({
    trustedOrigins: [siteUrl],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    socialProviders: {
      ...(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET
        ? {
            discord: {
              clientId: process.env.DISCORD_CLIENT_ID,
              clientSecret: process.env.DISCORD_CLIENT_SECRET,
            },
          }
        : {}),
      ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
        ? {
            github: {
              clientId: process.env.GITHUB_CLIENT_ID,
              clientSecret: process.env.GITHUB_CLIENT_SECRET,
            },
          }
        : {}),
      ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: process.env.GOOGLE_CLIENT_ID,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            },
          }
        : {}),
    },
    user: {
      deleteUser: {
        enabled: true,
      },
    },
    plugins: [
      anonymous(),
      crossDomain({ siteUrl }) as any,
      convex({ authConfig }) as any,
    ],
    account: {
      accountLinking: {
        enabled: true,
      },
    },
  }) as BetterAuthOptions;

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth(createAuthOptions(ctx)) as any;

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return await authComponent.getAuthUser(ctx);
  },
});
