import { describe, expect, it } from "vitest";
import { createComponentFunctions } from "../../src/component/functions.js";

describe("createComponentFunctions", () => {
  it("creates the expected function groups", () => {
    const functions = createComponentFunctions();

    expect(Object.keys(functions.hotPath)).toEqual([
      "getSessionByToken",
      "getSessionBySessionId",
      "getSessionWithUserByToken",
      "getSessionWithUserBySessionId",
      "invalidateSession",
      "invalidateUserSessions",
    ]);
    expect(Object.keys(functions.crud)).toEqual([
      "create",
      "findOne",
      "findMany",
      "count",
      "updateOne",
      "updateMany",
      "deleteOne",
      "deleteMany",
    ]);
  });
});
