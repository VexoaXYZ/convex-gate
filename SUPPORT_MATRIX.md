# Support Matrix

This matrix is intentionally strict. Items listed as supported are either part
of the public package surface or covered by the current test suite.

## Core package surface

| Area | Status | Notes |
|---|---|---|
| Better Auth adapter | Supported | Core adapter is public and tested |
| Convex component storage | Supported | Component-backed auth storage and hot paths |
| React bindings | Supported | Includes token caching and forced refresh behavior |
| Server helpers | Supported | `getHeaders()`, `getAuth()`, `registerRoutes()`, `registerRoutesLazy()` |
| Static JWKS | Supported | Config helpers plus Convex plugin support |
| JWT caching | Supported | React cache plus server-side token lookup helpers |
| Schema-derived typing | Supported | CRUD types derive from Convex auth schema |

## Framework support

| Framework / runtime | Status | Notes |
|---|---|---|
| Convex backend | Supported | Primary target |
| React | Supported | Exported from `./react` |
| Next.js-specific wrapper | Not supported | Can be used manually, but no dedicated package surface |
| TanStack Start / React Start | Not supported | No dedicated integration yet |
| SvelteKit / Expo wrappers | Not supported | No dedicated integration yet |

## Better Auth plugin coverage

The following plugins have package-level coverage in `tests/plugins/` and are
the strongest support claims today.

| Plugin area | Status |
|---|---|
| Anonymous | Supported |
| Email OTP | Supported |
| Generic OAuth | Supported |
| Magic Link | Supported |
| One Tap | Supported |
| Passkey | Supported |
| Phone Number | Supported |
| SIWE | Supported |
| Two Factor | Supported |
| Username | Supported |
| Admin | Supported |
| API Key | Supported |
| MCP | Supported |
| Organization | Supported |
| OAuth Provider | Supported |
| OIDC Provider | Supported |
| SCIM | Supported |
| SSO | Supported |
| Agent Auth | Supported |
| Generic Payment | Supported |
| Stripe | Supported |
| Bearer | Supported |
| Captcha | Supported |
| Device Authorization | Supported |
| Have I Been Pwned | Supported |
| I18n | Supported |
| JWT | Supported |
| Last Login Method | Supported |
| Multi Session | Supported |
| OAuth Proxy | Supported |
| One Time Token | Supported |
| OpenAPI | Supported |

## Intentional gaps

| Feature | Status | Why |
|---|---|---|
| Trigger API | Missing | No lifecycle hook surface yet |
| Broad SSR framework helpers | Missing | Current server helpers are Convex-first |
| Dedicated Next.js package | Missing | No framework-specific wrapper yet |
| Dedicated Expo / SvelteKit package | Missing | No framework-specific wrapper yet |
| Upstream feature parity docs | Missing | Productization still catching up to core implementation |

## Migration notes from upstream Convex Better Auth

| Topic | Current migration story |
|---|---|
| Core Better Auth adapter usage | Straightforward |
| Convex component storage model | Straightforward |
| React client usage | Straightforward if you are already React-first |
| Upstream-specific framework helpers | Manual rewrite required |
| Trigger-based workflows | Not available yet |
| Broad SSR helper usage | Manual rewrite required |

## Validation snapshot

Current local verification:

- `npm run typecheck`
- `npm test`
- `50` test files passed
- `258` tests passed
