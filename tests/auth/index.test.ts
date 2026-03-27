import { describe, expect, it } from "vitest";
import { createInMemoryAuthComponent } from "../../src/component/runtime.js";
import { createConvexGateAuth } from "../../src/auth/index.js";

describe("createConvexGateAuth", () => {
  it("composes auth options, adapter, and component functions", () => {
    const component = createInMemoryAuthComponent();
    const result = createConvexGateAuth({
      component,
      options: {
        emailAndPassword: {
          enabled: true,
        },
        secret: "test-secret",
      },
    });

    expect(result.auth).toBeTruthy();
    expect(result.options.database).toBeTruthy();
    expect(result.adapter).toBeTruthy();
    expect(result.component.functions.hotPath.getSessionWithUserByToken).toBeTruthy();
  });
});
