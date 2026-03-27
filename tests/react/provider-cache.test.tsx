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
});
