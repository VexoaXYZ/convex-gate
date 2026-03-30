import { describe, expect, it } from "vitest";
import { getTokenExpiry, isTokenExpired } from "../../src/react/index.js";

// Helper to create a fake JWT with a given exp
function createFakeJwt(exp: number): string {
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ sub: "user-1", exp }));
  return `${header}.${payload}.fake-signature`;
}

describe("JWT expiry parsing", () => {
  it("extracts exp from a valid JWT", () => {
    const exp = Math.floor(Date.now() / 1000) + 900; // 15 min from now
    const token = createFakeJwt(exp);
    expect(getTokenExpiry(token)).toBe(exp * 1000);
  });

  it("returns null for malformed token", () => {
    expect(getTokenExpiry("not-a-jwt")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(getTokenExpiry("")).toBeNull();
  });

  it("returns null if payload has no exp", () => {
    const header = btoa(JSON.stringify({ alg: "RS256" }));
    const payload = btoa(JSON.stringify({ sub: "user-1" }));
    const token = `${header}.${payload}.sig`;
    expect(getTokenExpiry(token)).toBeNull();
  });

  it("returns null if exp is not a number", () => {
    const header = btoa(JSON.stringify({ alg: "RS256" }));
    const payload = btoa(JSON.stringify({ sub: "user-1", exp: "not-a-number" }));
    const token = `${header}.${payload}.sig`;
    expect(getTokenExpiry(token)).toBeNull();
  });
});

describe("isTokenExpired", () => {
  it("returns false for token expiring in 15 minutes", () => {
    const exp = Math.floor(Date.now() / 1000) + 900;
    expect(isTokenExpired(createFakeJwt(exp))).toBe(false);
  });

  it("returns true for token expiring in 20 seconds (within 30s margin)", () => {
    const exp = Math.floor(Date.now() / 1000) + 20;
    expect(isTokenExpired(createFakeJwt(exp))).toBe(true);
  });

  it("returns true for already expired token", () => {
    const exp = Math.floor(Date.now() / 1000) - 60;
    expect(isTokenExpired(createFakeJwt(exp))).toBe(true);
  });

  it("returns false for token expiring in exactly 31 seconds", () => {
    const exp = Math.floor(Date.now() / 1000) + 31;
    expect(isTokenExpired(createFakeJwt(exp))).toBe(false);
  });

  it("returns true for malformed token (forces refresh)", () => {
    expect(isTokenExpired("garbage")).toBe(true);
  });
});
