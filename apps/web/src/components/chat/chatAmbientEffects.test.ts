import { describe, expect, it } from "vite-plus/test";

import {
  CHAT_AMBIENT_COLOR_PALETTES,
  CHAT_AMBIENT_EFFECT_NONE,
  CHAT_AMBIENT_EFFECT_PLUGINS,
  DEFAULT_CHAT_AMBIENT_APPEARANCE,
  DEFAULT_CHAT_AMBIENT_EFFECT,
  resolveChatAmbientAppearance,
  resolveChatAmbientEffect,
} from "./chatAmbientEffects";

describe("chat ambient effect plug-ins", () => {
  it("ships a lazy Three.js effect for the post-draft chat surface", () => {
    expect(DEFAULT_CHAT_AMBIENT_EFFECT).toBe("orbital-field");
    expect(CHAT_AMBIENT_EFFECT_PLUGINS[DEFAULT_CHAT_AMBIENT_EFFECT]?.label).toBe("Starfield");
    expect(CHAT_AMBIENT_EFFECT_PLUGINS[DEFAULT_CHAT_AMBIENT_EFFECT]?.component).toBeDefined();
    expect(CHAT_AMBIENT_EFFECT_PLUGINS["mystic-mist"]?.label).toBe("Mystic Electrifying Mist");
    expect(CHAT_AMBIENT_EFFECT_PLUGINS.swirl?.label).toBe("Swirl");
    expect(Object.keys(CHAT_AMBIENT_COLOR_PALETTES)).toHaveLength(5);
  });

  it("falls back safely for stale per-chat preferences and supports turning effects off", () => {
    expect(resolveChatAmbientEffect("removed-effect")).toBe(DEFAULT_CHAT_AMBIENT_EFFECT);
    expect(resolveChatAmbientEffect(CHAT_AMBIENT_EFFECT_NONE)).toBe(CHAT_AMBIENT_EFFECT_NONE);
  });

  it("normalizes per-chat appearance controls without letting stale values leak into the renderer", () => {
    expect(resolveChatAmbientAppearance(undefined)).toEqual(DEFAULT_CHAT_AMBIENT_APPEARANCE);
    expect(
      resolveChatAmbientAppearance({
        palette: "ember-rose",
        blur: "deep",
        dim: "none",
        frost: true,
      }),
    ).toEqual({ palette: "ember-rose", blur: "deep", dim: "none", frost: true });
    expect(
      resolveChatAmbientAppearance({
        palette: "removed-palette",
        blur: "removed-blur",
        dim: "removed-dim",
        frost: false,
      }),
    ).toEqual(DEFAULT_CHAT_AMBIENT_APPEARANCE);
  });
});
