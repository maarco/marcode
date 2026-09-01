import { describe, expect, it } from "vite-plus/test";

import {
  CHAT_AMBIENT_FRAME_INTERVAL_MS,
  canRunChatAmbientAnimation,
  shouldRenderChatAmbientFrame,
} from "./chatAmbientAnimation";

describe("chat ambient animation budget", () => {
  it("requires a visible foreground canvas and motion permission", () => {
    expect(
      canRunChatAmbientAnimation({
        documentVisible: true,
        inViewport: true,
        reducedMotion: false,
      }),
    ).toBe(true);
    expect(
      canRunChatAmbientAnimation({
        documentVisible: false,
        inViewport: true,
        reducedMotion: false,
      }),
    ).toBe(false);
    expect(
      canRunChatAmbientAnimation({
        documentVisible: true,
        inViewport: false,
        reducedMotion: false,
      }),
    ).toBe(false);
    expect(
      canRunChatAmbientAnimation({
        documentVisible: true,
        inViewport: true,
        reducedMotion: true,
      }),
    ).toBe(false);
  });

  it("limits renders to the configured 30fps interval", () => {
    expect(shouldRenderChatAmbientFrame(0, Number.NEGATIVE_INFINITY)).toBe(true);
    expect(shouldRenderChatAmbientFrame(CHAT_AMBIENT_FRAME_INTERVAL_MS - 0.01, 0)).toBe(false);
    expect(shouldRenderChatAmbientFrame(CHAT_AMBIENT_FRAME_INTERVAL_MS, 0)).toBe(true);
  });
});
