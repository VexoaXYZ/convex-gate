import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Re-implement the cache logic from src/plugins/convex/index.ts for isolated testing
interface CachedToken {
  token: string;
  expiresAt: number;
}

function createTokenCache() {
  const cache = new Map<string, CachedToken>();

  return {
    get(sessionId: string): string | null {
      const entry = cache.get(sessionId);
      if (!entry) return null;
      if (Date.now() >= entry.expiresAt - 30_000) {
        cache.delete(sessionId);
        return null;
      }
      return entry.token;
    },
    set(sessionId: string, token: string, ttlSeconds: number) {
      cache.set(sessionId, {
        token,
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
    },
    invalidate(sessionId: string) {
      cache.delete(sessionId);
    },
    invalidateAll() {
      cache.clear();
    },
    _size() {
      return cache.size;
    },
  };
}

describe("server-side token cache", () => {
  let cache: ReturnType<typeof createTokenCache>;

  beforeEach(() => {
    cache = createTokenCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for uncached session", () => {
    expect(cache.get("session-1")).toBeNull();
  });

  it("caches and retrieves token", () => {
    cache.set("session-1", "jwt-token-abc", 300);
    expect(cache.get("session-1")).toBe("jwt-token-abc");
  });

  it("returns null after TTL expires", () => {
    cache.set("session-1", "jwt-token-abc", 300);
    // Advance past TTL
    vi.advanceTimersByTime(301_000);
    expect(cache.get("session-1")).toBeNull();
  });

  it("returns null 30s before TTL (safety margin)", () => {
    cache.set("session-1", "jwt-token-abc", 300);
    // Advance to 30s before expiry — should already be treated as expired
    vi.advanceTimersByTime(271_000);
    expect(cache.get("session-1")).toBeNull();
  });

  it("serves cached token within safe window", () => {
    cache.set("session-1", "jwt-token-abc", 300);
    // 4 minutes in — still within safe window (300s - 30s = 270s)
    vi.advanceTimersByTime(240_000);
    expect(cache.get("session-1")).toBe("jwt-token-abc");
  });

  it("invalidates specific session", () => {
    cache.set("session-1", "token-1", 300);
    cache.set("session-2", "token-2", 300);
    cache.invalidate("session-1");
    expect(cache.get("session-1")).toBeNull();
    expect(cache.get("session-2")).toBe("token-2");
  });

  it("invalidateAll clears everything", () => {
    cache.set("session-1", "token-1", 300);
    cache.set("session-2", "token-2", 300);
    cache.invalidateAll();
    expect(cache.get("session-1")).toBeNull();
    expect(cache.get("session-2")).toBeNull();
  });

  it("overwrites existing cache entry", () => {
    cache.set("session-1", "old-token", 300);
    cache.set("session-1", "new-token", 300);
    expect(cache.get("session-1")).toBe("new-token");
  });

  it("different sessions have independent TTLs", () => {
    cache.set("session-1", "token-1", 60);
    vi.advanceTimersByTime(50_000);
    cache.set("session-2", "token-2", 60);
    // session-1 is within 30s of expiry, session-2 is fresh
    vi.advanceTimersByTime(20_000);
    expect(cache.get("session-1")).toBeNull();
    expect(cache.get("session-2")).toBe("token-2");
  });
});
