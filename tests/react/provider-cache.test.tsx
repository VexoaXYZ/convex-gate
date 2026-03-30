// @vitest-environment jsdom

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

let latestAuthState:
  | {
      isLoading: boolean;
      isAuthenticated: boolean;
      fetchAccessToken(args?: { forceRefreshToken?: boolean }): Promise<string | null>;
    }
  | null = null;

vi.mock("convex/react", () => ({
  ConvexProviderWithAuth({
    children,
    useAuth,
  }: {
    children: React.ReactNode;
    useAuth(): {
      isLoading: boolean;
      isAuthenticated: boolean;
      fetchAccessToken(args?: { forceRefreshToken?: boolean }): Promise<string | null>;
    };
  }) {
    latestAuthState = useAuth();
    return React.createElement(React.Fragment, null, children);
  },
}));

import { ConvexBetterAuthProvider } from "../../src/react/index.js";

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createAuthClient(options?: {
  initialSession?: { session: { id: string } } | null;
  tokenSequence?: Array<string | null>;
  verifyOneTimeTokenResponse?: unknown;
}) {
  let session = options?.initialSession ?? { session: { id: "session-1" } };
  const tokenSequence = [...(options?.tokenSequence ?? [])];
  const getToken = vi.fn(async () => ({
    data: {
      token: tokenSequence.length ? tokenSequence.shift() ?? null : null,
    },
  }));

  return {
    convex: {
      getToken,
    },
    useSession() {
      return {
        data: session,
        isPending: false,
      };
    },
    crossDomain: {
      oneTimeToken: {
        verify: vi.fn(async () => options?.verifyOneTimeTokenResponse ?? { data: session }),
      },
    },
    getSession: vi.fn(async () => ({ data: session })),
    updateSession: vi.fn(),
    setSession(nextSession: typeof session) {
      session = nextSession;
    },
    getTokenMock() {
      return getToken;
    },
  };
}

describe("ConvexBetterAuthProvider token cache behavior", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    latestAuthState = null;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    latestAuthState = null;
    vi.clearAllMocks();
  });

  it("forces a fresh token fetch when forceRefreshToken is true", async () => {
    const authClient = createAuthClient({
      tokenSequence: ["token-1", "token-2"],
    });

    await act(async () => {
      root.render(
        React.createElement(
          ConvexBetterAuthProvider,
          {
            authClient: authClient as any,
            client: {} as any,
          },
          React.createElement("div")
        )
      );
      await flushPromises();
    });

    expect(latestAuthState).not.toBeNull();

    const first = await latestAuthState!.fetchAccessToken();
    const second = await latestAuthState!.fetchAccessToken({ forceRefreshToken: true });

    expect(first).toBe("token-1");
    expect(second).toBe("token-2");
    expect(authClient.getTokenMock()).toHaveBeenCalledTimes(2);
  });

  it("scopes initialToken to each provider instance", async () => {
    const firstAuthClient = createAuthClient();

    await act(async () => {
      root.render(
        React.createElement(
          ConvexBetterAuthProvider,
          {
            authClient: firstAuthClient as any,
            client: {} as any,
            initialToken: "initial-token-1",
          },
          React.createElement("div")
        )
      );
      await flushPromises();
    });

    expect(latestAuthState).not.toBeNull();
    expect(await latestAuthState!.fetchAccessToken()).toBe("initial-token-1");

    await act(async () => {
      root.unmount();
    });

    root = createRoot(container);
    const secondAuthClient = createAuthClient();

    await act(async () => {
      root.render(
        React.createElement(
          ConvexBetterAuthProvider,
          {
            authClient: secondAuthClient as any,
            client: {} as any,
            initialToken: "initial-token-2",
          },
          React.createElement("div")
        )
      );
      await flushPromises();
    });

    expect(latestAuthState).not.toBeNull();
    expect(await latestAuthState!.fetchAccessToken()).toBe("initial-token-2");
    expect(secondAuthClient.getTokenMock()).not.toHaveBeenCalled();
  });

  it("clears cached auth state after sign-out", async () => {
    const authClient = createAuthClient({
      tokenSequence: ["token-1", "token-2"],
    });

    await act(async () => {
      root.render(
        React.createElement(
          ConvexBetterAuthProvider,
          {
            authClient: authClient as any,
            client: {} as any,
          },
          React.createElement("div")
        )
      );
      await flushPromises();
    });

    await latestAuthState!.fetchAccessToken();
    expect(latestAuthState!.isAuthenticated).toBe(true);

    authClient.setSession(null);

    await act(async () => {
      root.render(
        React.createElement(
          ConvexBetterAuthProvider,
          {
            authClient: authClient as any,
            client: {} as any,
          },
          React.createElement("div")
        )
      );
      await flushPromises();
    });

    expect(latestAuthState!.isAuthenticated).toBe(false);
    await latestAuthState!.fetchAccessToken();
    expect(authClient.getTokenMock()).toHaveBeenCalledTimes(2);
  });

  it("invalidates the cached token when the session id changes", async () => {
    const authClient = createAuthClient({
      tokenSequence: ["token-1", "token-2"],
    });

    await act(async () => {
      root.render(
        React.createElement(
          ConvexBetterAuthProvider,
          {
            authClient: authClient as any,
            client: {} as any,
          },
          React.createElement("div")
        )
      );
      await flushPromises();
    });

    expect(await latestAuthState!.fetchAccessToken()).toBe("token-1");

    authClient.setSession({ session: { id: "session-2" } });

    await act(async () => {
      root.render(
        React.createElement(
          ConvexBetterAuthProvider,
          {
            authClient: authClient as any,
            client: {} as any,
          },
          React.createElement("div")
        )
      );
      await flushPromises();
    });

    expect(await latestAuthState!.fetchAccessToken()).toBe("token-2");
    expect(authClient.getTokenMock()).toHaveBeenCalledTimes(2);
  });

  it("removes ott redirects while completing session recovery", async () => {
    const authClient = createAuthClient({
      initialSession: null,
      verifyOneTimeTokenResponse: {
        data: {
          session: {
            token: "ott-session-token",
          },
        },
      },
    });
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");

    window.history.replaceState({}, "", "/app?ott=test-ott");

    await act(async () => {
      root.render(
        React.createElement(
          ConvexBetterAuthProvider,
          {
            authClient: authClient as any,
            client: {} as any,
          },
          React.createElement("div")
        )
      );
      await flushPromises();
    });

    expect(authClient.crossDomain.oneTimeToken.verify).toHaveBeenCalledWith({
      token: "test-ott",
    });
    expect(authClient.updateSession).toHaveBeenCalledTimes(2);
    expect(authClient.getSession).toHaveBeenCalledTimes(1);
    expect(authClient.getSession).toHaveBeenCalledWith({
      fetchOptions: {
        headers: {
          Authorization: "Bearer ott-session-token",
        },
      },
    });
    const lastCall = replaceStateSpy.mock.calls.at(-1);
    expect(lastCall?.[0]).toEqual({});
    expect(lastCall?.[1]).toBe("");
    expect(String(lastCall?.[2])).toBe("http://localhost:3000/app");
  });

  it("treats top-level verify session payloads as a successful ott completion", async () => {
    const authClient = createAuthClient({
      initialSession: null,
      verifyOneTimeTokenResponse: {
        session: {
          token: "top-level-ott-token",
        },
      },
    });

    window.history.replaceState({}, "", "/app?ott=test-ott");

    await act(async () => {
      root.render(
        React.createElement(
          ConvexBetterAuthProvider,
          {
            authClient: authClient as any,
            client: {} as any,
          },
          React.createElement("div")
        )
      );
      await flushPromises();
    });

    expect(authClient.crossDomain.oneTimeToken.verify).toHaveBeenCalledWith({
      token: "test-ott",
    });
    expect(authClient.getSession).toHaveBeenCalledWith({
      fetchOptions: {
        headers: {
          Authorization: "Bearer top-level-ott-token",
        },
      },
    });
    expect(authClient.updateSession).toHaveBeenCalledTimes(2);
    expect(window.location.href).toBe("http://localhost:3000/app");
  });

  it("still completes ott handling when verify succeeds before session fetch catches up", async () => {
    const authClient = createAuthClient({
      initialSession: null,
      verifyOneTimeTokenResponse: {
        data: {
          session: {
            id: "session-from-verify",
            token: "ott-session-token",
          },
        },
      },
    });
    authClient.getSession = vi.fn(async () => ({ data: null }));

    window.history.replaceState({}, "", "/app?ott=test-ott");

    await act(async () => {
      root.render(
        React.createElement(
          ConvexBetterAuthProvider,
          {
            authClient: authClient as any,
            client: {} as any,
          },
          React.createElement("div")
        )
      );
      await flushPromises();
    });

    expect(authClient.crossDomain.oneTimeToken.verify).toHaveBeenCalledWith({
      token: "test-ott",
    });
    expect(authClient.updateSession).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe("http://localhost:3000/app");
  });
});
