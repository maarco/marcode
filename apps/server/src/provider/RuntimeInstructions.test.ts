import { describe, expect, it } from "vite-plus/test";
import { buildRuntimeInstructions } from "./RuntimeInstructions.ts";

describe("buildRuntimeInstructions", () => {
  it.each(["Codex", "Claude Code", "Cursor", "Grok", "OpenCode", "Antigravity"])(
    "identifies the %s harness and describes media embedding",
    (harness) => {
      const instructions = buildRuntimeInstructions({ harness });
      // Marcode fork seam: upstream names the product "T3 Code" here. Assert
      // Marcode's identity so an upstream sync that reinstates theirs fails
      // loudly instead of silently telling every agent the wrong product name.
      expect(instructions).toContain(`running in Marcode through the ${harness} harness.`);
      expect(instructions).not.toContain("T3 Code");
      expect(instructions).toContain("embed images and videos");
      expect(instructions).toContain("Markdown with absolute file paths");
      expect(instructions).not.toContain("undefined");
    },
  );

  it("keeps known model and effort metadata on one line", () => {
    expect(
      buildRuntimeInstructions({
        harness: "Codex",
        model: "  custom\nmodel  ",
        reasoningEffort: " high\n",
      }),
    ).toContain("through the Codex harness, as custom model with high reasoning effort.");
  });

  it.each([undefined, "", "auto", "default"])("omits unresolved model %s", (model) => {
    const instructions = buildRuntimeInstructions({ harness: "Cursor", model });
    expect(instructions).toContain("through the Cursor harness.");
    expect(instructions).not.toContain("reasoning effort");
  });
});
