import { afterAll, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { toNodeHandler } from "better-auth/node";
import { createInMemoryAuthComponent } from "../../src/component/runtime.js";
import { createConvexGateAuth } from "../../src/auth/index.js";

function copySetCookie(headers: Headers) {
  const next = new Headers();
  for (const cookie of headers.getSetCookie()) {
    next.append("cookie", cookie);
  }
  return next;
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  return JSON.parse(text) as unknown;
}

describe("convex-gate node handler", () => {
  const component = createInMemoryAuthComponent();
  const { auth } = createConvexGateAuth({
    component,
    options: {
      secret: "test-secret",
      baseURL: "http://localhost:3000/api/auth",
      trustedOrigins: ["http://localhost:5173"],
      emailAndPassword: {
        enabled: true,
      },
      session: {
        cookieCache: {
          enabled: true,
          maxAge: 60,
        },
      },
    },
  });

  const server = createServer(toNodeHandler(auth));
  let origin = "";

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });

  it("serves a full email/password auth flow over HTTP", async () => {
    if (!origin) {
      await new Promise<void>((resolve, reject) => {
        server.listen(0, "127.0.0.1", () => {
          const address = server.address();
          if (!address || typeof address === "string") {
            reject(new Error("Failed to resolve test server address."));
            return;
          }
          origin = `http://127.0.0.1:${address.port}`;
          resolve();
        });
      });
    }

    const signUpResponse = await fetch(`${origin}/api/auth/sign-up/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Node Handler User",
        email: "node-handler@example.com",
        password: "super-secret-password",
      }),
    });
    const signUp = (await readJson(signUpResponse)) as { user: { email: string } };

    expect(signUpResponse.ok).toBe(true);
    expect(signUp.user.email).toBe("node-handler@example.com");

    const signInResponse = await fetch(`${origin}/api/auth/sign-in/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: "node-handler@example.com",
        password: "super-secret-password",
      }),
    });
    const signIn = (await readJson(signInResponse)) as { user: { email: string } };
    const sessionHeaders = copySetCookie(signInResponse.headers);

    expect(signInResponse.ok).toBe(true);
    expect(signIn.user.email).toBe("node-handler@example.com");

    const sessionResponse = await fetch(`${origin}/api/auth/get-session`, {
      method: "GET",
      headers: sessionHeaders,
    });
    const session = (await readJson(sessionResponse)) as { user: { email: string } };

    expect(sessionResponse.ok).toBe(true);
    expect(session.user.email).toBe("node-handler@example.com");

    const signOutResponse = await fetch(`${origin}/api/auth/sign-out`, {
      method: "POST",
      headers: sessionHeaders,
    });
    const clearedHeaders = copySetCookie(signOutResponse.headers);

    expect(signOutResponse.ok).toBe(true);

    const afterSignOutResponse = await fetch(`${origin}/api/auth/get-session`, {
      method: "GET",
      headers: clearedHeaders,
    });
    const afterSignOut = await readJson(afterSignOutResponse);

    expect(afterSignOutResponse.ok).toBe(true);
    expect(afterSignOut).toBeNull();
  });
});
