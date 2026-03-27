# convex-gate

> **This package is in alpha.** APIs may change between releases. Not recommended for production use yet.

A [Better Auth](https://better-auth.com) adapter for [Convex](https://convex.dev). Auth data lives in an isolated Convex component — separate from your app tables.

## Features

- Isolated auth storage via Convex component boundary
- Dedicated hot-path for fast session resolution
- Server-side JWT caching with configurable TTL
- Client-side token expiry awareness
- Static JWKS support
- React bindings with `ConvexBetterAuthProvider`
- Works with all Better Auth plugins (2FA, SSO, organizations, passkeys, etc.)

## Install

```bash
npm install convex-gate better-auth convex
```

## Quick Start

### 1. Convex Component

Register the auth component in your Convex app:

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import betterAuth from "convex-gate/convex.config";

const app = defineApp();
app.use(betterAuth);

export default app;
```

### 2. Auth Config

Tell Convex how to validate tokens:

```ts
// convex/auth.config.ts
import type { AuthConfig } from "convex/server";
import { getAuthConfigProvider } from "convex-gate/auth-config";

export default {
  providers: [getAuthConfigProvider()],
} satisfies AuthConfig;
```

### 3. Server Auth

Set up the auth client and Better Auth instance:

```ts
// convex/auth.ts
import { createClient, type GenericCtx } from "convex-gate";
import { convex, crossDomain } from "convex-gate/plugins";
import { components } from "./_generated/api";
import { query } from "./_generated/server";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
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
    plugins: [
      crossDomain({ siteUrl }) as any,
      convex({ authConfig }) as any,
    ],
    account: {
      accountLinking: { enabled: true },
    },
  }) as BetterAuthOptions;

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth(createAuthOptions(ctx));

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return await authComponent.getAuthUser(ctx);
  },
});
```

### 4. HTTP Routes

Register the auth API routes:

```ts
// convex/http.ts
import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();
authComponent.registerRoutes(http, createAuth, { cors: true });

export default http;
```

### 5. Client Auth

Set up the Better Auth client:

```ts
// src/lib/auth-client.ts
import { createAuthClient } from "better-auth/react";
import { convexClient, crossDomainClient } from "convex-gate/client/plugins";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_CONVEX_SITE_URL,
  plugins: [
    crossDomainClient(),
    convexClient(),
  ],
});
```

### 6. React Provider

Wrap your app:

```tsx
// src/main.tsx
import { ConvexReactClient } from "convex/react";
import { ConvexBetterAuthProvider } from "convex-gate/react";
import { authClient } from "./lib/auth-client";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ConvexBetterAuthProvider client={convex} authClient={authClient}>
    <App />
  </ConvexBetterAuthProvider>
);
```

### 7. Use It

```tsx
import { Authenticated, Unauthenticated } from "convex/react";
import { authClient } from "./lib/auth-client";

function App() {
  return (
    <>
      <Unauthenticated>
        <button onClick={() => authClient.signIn.email({ email, password })}>
          Sign in
        </button>
      </Unauthenticated>
      <Authenticated>
        <button onClick={() => authClient.signOut()}>Sign out</button>
      </Authenticated>
    </>
  );
}
```

## Environment Variables

Set these on your Convex deployment:

```bash
npx convex env set BETTER_AUTH_SECRET "your-secret"
npx convex env set BETTER_AUTH_URL "https://your-app.convex.site"
npx convex env set SITE_URL "http://localhost:5173"
```

And in your `.env.local`:

```
VITE_CONVEX_URL=https://your-app.convex.cloud
VITE_CONVEX_SITE_URL=https://your-app.convex.site
```

## Plugins

All Better Auth plugins work out of the box. The component uses `schemaValidation: false` so plugins can add any fields or tables without schema changes.

```ts
import { anonymous } from "better-auth/plugins/anonymous";
import { twoFactor } from "better-auth/plugins/two-factor";
import { organization } from "better-auth/plugins/organization";

// Add to your createAuthOptions plugins array:
plugins: [
  anonymous(),
  twoFactor(),
  organization(),
  crossDomain({ siteUrl }) as any,
  convex({ authConfig }) as any,
],
```

## Protected Queries & Mutations

Use `authComponent.getAuthUser(ctx)` in any query or mutation:

```ts
import { ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import { authComponent } from "./auth";

export const getMyData = query({
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new ConvexError("Unauthenticated");

    return ctx.db
      .query("myTable")
      .withIndex("userId", (q) => q.eq("userId", user._id))
      .collect();
  },
});
```

## Static JWKS

For production deployments that need stable signing keys:

```ts
// convex/auth.config.ts
import { getAuthConfigProvider } from "convex-gate/auth-config";

export default {
  providers: [
    getAuthConfigProvider({
      jwks: process.env.STATIC_JWKS, // JSON string of key array
    }),
  ],
};
```

```ts
// In your convex() plugin config:
convex({
  authConfig,
  jwks: process.env.STATIC_JWKS,
})
```

## API Reference

### Exports

| Path | Contents |
|------|----------|
| `convex-gate` | `createClient`, types |
| `convex-gate/react` | `ConvexBetterAuthProvider`, `ConvexGateProvider`, `useConvexGate` |
| `convex-gate/plugins` | `convex`, `crossDomain` (server plugins) |
| `convex-gate/client/plugins` | `convexClient`, `crossDomainClient` (client plugins) |
| `convex-gate/adapter` | `createConvexGateAdapter`, store types |
| `convex-gate/client` | `createConvexGateClient`, session types |
| `convex-gate/auth-config` | `getAuthConfigProvider`, `createPublicJwks` |
| `convex-gate/convex.config` | Convex component definition |

## License

MIT
