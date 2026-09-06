import { describe, expect, it } from "vite-plus/test";

import chatViewSource from "./ChatView.tsx?raw";

describe("persistent terminal drawer layout", () => {
  it("keeps the bottom drawer host shrinkable inside narrow chat columns", () => {
    expect(chatViewSource).toContain('className="min-h-0 min-w-0 overflow-clip"');
  });
});
