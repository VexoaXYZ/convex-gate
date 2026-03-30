import { describe, expect, it } from "vitest";

import { getCookie, getSetCookie, parseSetCookieHeader } from "../../../src/plugins/crossDomain/client.js";

describe("plugin: cross-domain client cookie parsing", () => {
  it("parses multiple Set-Cookie values with Expires attributes", () => {
    const header =
      "better-auth.session_token=abc123; Path=/; Expires=Wed, 01 Jan 2030 00:00:00 GMT, " +
      "better-auth.session_data=%7B%22session%22%3Atrue%7D; Path=/; Expires=Wed, 01 Jan 2030 00:00:00 GMT";

    const parsed = parseSetCookieHeader(header);

    expect([...parsed.keys()]).toEqual([
      "better-auth.session_token",
      "better-auth.session_data",
    ]);
    expect(parsed.get("better-auth.session_token")?.value).toBe("abc123");
    expect(parsed.get("better-auth.session_data")?.value).toBe("%7B%22session%22%3Atrue%7D");
  });

  it("merges stored cookies without treating Expires commas as cookie separators", () => {
    const header =
      "better-auth.session_token=abc123; Path=/; Expires=Wed, 01 Jan 2030 00:00:00 GMT, " +
      "better-auth.session_data=%7B%22session%22%3Atrue%7D; Path=/; Expires=Wed, 01 Jan 2030 00:00:00 GMT";

    const stored = getSetCookie(header);

    expect(() => JSON.parse(stored)).not.toThrow();
    expect(getCookie(stored)).toContain("better-auth.session_token=abc123");
    expect(getCookie(stored)).toContain("better-auth.session_data=%7B%22session%22%3Atrue%7D");
  });

  it("serializes cookie headers without a leading separator", () => {
    const stored = JSON.stringify({
      "better-auth.session_token": {
        value: "abc123",
        expires: "2030-01-01T00:00:00.000Z",
      },
      "better-auth.session_data": {
        value: "%7B%22session%22%3Atrue%7D",
        expires: "2030-01-01T00:00:00.000Z",
      },
    });

    expect(getCookie(stored)).toBe(
      "better-auth.session_token=abc123; better-auth.session_data=%7B%22session%22%3Atrue%7D"
    );
  });
});
