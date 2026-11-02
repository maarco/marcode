import { describe, expect, it } from "vite-plus/test";

import terminalHostSource from "./PersistentThreadTerminals.tsx?raw";

describe("persistent terminal drawer layout", () => {
  it("keeps the bottom drawer host shrinkable inside narrow chat columns", () => {
    expect(terminalHostSource).toContain('className="min-h-0 min-w-0 overflow-clip"');
  });
});
