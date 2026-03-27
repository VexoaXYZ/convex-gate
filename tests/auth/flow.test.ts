import { describe, expect, it } from "vitest";
import { createInMemoryAuthComponent } from "../../src/component/runtime.js";
import { createConvexGateAuth } from "../../src/auth/index.js";

describe("convex-gate auth flow", () => {
  it("supports sign up, sign in, get session, and sign out", async () => {
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

    const signUp = await auth.api.signUpEmail({
      body: {
        name: "Test User",
        email: "test@example.com",
        password: "super-secret-password",
      },
    });

    expect(signUp.user.email).toBe("test@example.com");

    const signIn = await auth.api.signInEmail({
      body: {
        email: "test@example.com",
        password: "super-secret-password",
      },
      returnHeaders: true,
    });

    expect(signIn.response.user.email).toBe("test@example.com");

    const sessionHeaders = new Headers();
    const setCookies = signIn.headers.getSetCookie();
    for (const cookie of setCookies) {
      sessionHeaders.append("cookie", cookie);
    }

    const session = await auth.api.getSession({
      headers: sessionHeaders,
    });

    expect(session?.user.email).toBe("test@example.com");

    const signOut = await auth.api.signOut({
      headers: sessionHeaders,
      returnHeaders: true,
    });

    sessionHeaders.delete("cookie");
    const clearedCookies = signOut.headers.getSetCookie();
    for (const cookie of clearedCookies) {
      sessionHeaders.append("cookie", cookie);
    }

    const afterSignOut = await auth.api.getSession({
      headers: sessionHeaders,
    });

    expect(afterSignOut).toBeNull();
  });
});
