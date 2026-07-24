import { describe, expect, it } from "vite-plus/test";

import { resolveFloatingFileTarget } from "./open-floating-file";

describe("resolveFloatingFileTarget", () => {
  it("resolves a workspace-relative file into the floating editor target shape", () => {
    expect(resolveFloatingFileTarget("/repo", "src/main.ts")).toEqual({
      absolutePath: "/repo/src/main.ts",
      name: "main.ts",
      ext: ".ts",
    });
  });

  it("handles Windows separators and dotfiles", () => {
    expect(resolveFloatingFileTarget("C:\\repo", "src\\.env")).toEqual({
      absolutePath: "C:\\repo\\src\\.env",
      name: ".env",
      ext: "",
    });
  });
});
