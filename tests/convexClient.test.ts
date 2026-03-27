import { describe, expect, it, vi } from "vitest";
import { createClient, type GenericCtx } from "../src/convexClient.js";

function createComponentRef() {
  return {
    adapter: {
      create: {} as never,
      findOne: {} as never,
      findMany: {} as never,
      count: {} as never,
      updateOne: {} as never,
      updateMany: {} as never,
      deleteOne: {} as never,
      deleteMany: {} as never,
    },
  };
}

describe("createClient server helpers", () => {
  it("builds auth headers from the current session", async () => {
    const component = createComponentRef();
    const client = createClient(component);
    const session = {
      id: "session-1",
      userId: "user-1",
      token: "jwt-token-1",
      ipAddress: "127.0.0.1",
    };
    const ctx = {
      auth: {
        getUserIdentity: vi.fn(async () => ({
          subject: "user-1",
          sessionId: "session-1",
        })),
      },
      runQuery: vi.fn(async () => session),
      runMutation: vi.fn(),
    } satisfies GenericCtx;

    const headers = await client.getHeaders(ctx);

    expect(headers.get("authorization")).toBe("Bearer jwt-token-1");
    expect(headers.get("x-forwarded-for")).toBe("127.0.0.1");
    expect(ctx.runQuery).toHaveBeenCalledTimes(1);
  });

  it("returns auth and derived headers from getAuth", async () => {
    const component = createComponentRef();
    const client = createClient(component);
    const ctx = {
      auth: {
        getUserIdentity: vi.fn(async () => ({
          subject: "user-1",
          sessionId: "session-1",
        })),
      },
      runQuery: vi.fn(async () => ({
        id: "session-1",
        userId: "user-1",
        token: "jwt-token-2",
      })),
      runMutation: vi.fn(),
    } satisfies GenericCtx;
    const authInstance = {
      handler: vi.fn(async () => new Response("ok")),
      options: {},
    };
    const createAuth = vi.fn(() => authInstance);

    const result = await client.getAuth(createAuth, ctx);

    expect(result.auth).toBe(authInstance);
    expect(result.headers.get("authorization")).toBe("Bearer jwt-token-2");
    expect(createAuth).toHaveBeenCalledWith(ctx);
  });
});

describe("createClient route registration", () => {
  it("registers lazy auth routes and applies CORS at request time", async () => {
    const component = createComponentRef();
    const client = createClient(component);
    const routes: Array<{
      pathPrefix: string;
      method: string;
      handler: (ctx: unknown, request: Request) => Promise<Response>;
    }> = [];
    const http = {
      route(route: (typeof routes)[number]) {
        routes.push(route);
      },
    } as never;
    const createAuth = vi.fn((_ctx: GenericCtx) => ({
      handler: vi.fn(async () => new Response("ok", { headers: { "x-test": "1" } })),
      options: {
        basePath: "/custom-auth",
        trustedOrigins: ["https://app.example.com"],
      },
    }));

    client.registerRoutesLazy(http, createAuth, { cors: true, basePath: "/custom-auth" });

    expect(routes.map((route) => route.method)).toEqual(["OPTIONS", "GET", "POST"]);

    const getRoute = routes.find((route) => route.method === "GET");
    expect(getRoute).toBeDefined();

    const response = await getRoute!.handler(
      {
        auth: { getUserIdentity: async () => null },
        runQuery: vi.fn(),
        runMutation: vi.fn(),
      },
      new Request("https://example.convex.site/custom-auth/session", {
        headers: { origin: "https://app.example.com" },
      })
    );

    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://app.example.com"
    );
    expect(createAuth).toHaveBeenCalledTimes(2);
  });
});
