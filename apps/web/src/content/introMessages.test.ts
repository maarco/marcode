import { describe, expect, it } from "vite-plus/test";

import { INTRO_MESSAGES } from "./introMessages";

describe("INTRO_MESSAGES", () => {
  it("keeps a varied, unique prompt bank for new threads", () => {
    expect(INTRO_MESSAGES).toHaveLength(50);
    expect(new Set(INTRO_MESSAGES).size).toBe(INTRO_MESSAGES.length);
    expect(INTRO_MESSAGES.every((message) => message.trim().length > 0)).toBe(true);
  });
});
