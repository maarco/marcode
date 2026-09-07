import { describe, expect, it } from "vite-plus/test";

import {
  MARCODE_FORK_IDENTITY,
  MARCODE_HOME_ENV,
  MARCODE_PRODUCT_NAME,
  MARCODE_SERVICE_NAME,
  MARCODE_SERVICE_UNIT_FILE,
} from "./forkIdentity.ts";

describe("Marcode fork identity", () => {
  it("keeps fork-owned product and service values typed and consistent", () => {
    expect(MARCODE_PRODUCT_NAME).toBe("Marcode");
    expect(MARCODE_HOME_ENV).toBe("MARCODE_HOME");
    expect(MARCODE_SERVICE_NAME).toBe("marcode");
    expect(MARCODE_SERVICE_UNIT_FILE).toBe("marcode.service");
    expect(MARCODE_FORK_IDENTITY).toEqual({
      productName: "Marcode",
      homeEnvironmentVariable: "MARCODE_HOME",
      serviceName: "marcode",
      serviceUnitFile: "marcode.service",
    });
  });
});
