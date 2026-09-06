import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

describe("retired marketing routes", () => {
  it("does not reintroduce the upstream-branded /95 page", () => {
    expect(NodeFS.existsSync(NodeURL.fileURLToPath(new URL("./95.astro", import.meta.url)))).toBe(
      false,
    );
  });
});
