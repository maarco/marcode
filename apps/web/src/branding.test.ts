import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  formatAppDisplayName,
  resolveServerBackedAppDisplayName,
  resolveServerBackedAppStageLabel,
} from "./branding.logic";

const originalWindow = globalThis.window;

afterEach(() => {
  vi.resetModules();

  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, "window");
    return;
  }

  globalThis.window = originalWindow;
});

describe("branding", () => {
  it("uses injected desktop branding when available", async () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        desktopBridge: {
          getAppBranding: () => ({
            baseName: "Marcode",
            stageLabel: "Nightly",
            displayName: "Marcode (Nightly)",
          }),
        },
      },
    });

    const branding = await import("./branding");

    expect(branding.APP_BASE_NAME).toBe("Marcode");
    expect(branding.APP_STAGE_LABEL).toBe("Nightly");
    expect(branding.APP_DISPLAY_NAME).toBe("Marcode (Nightly)");
  });

  it("normalizes hosted app channel metadata", async () => {
    vi.stubEnv("VITE_HOSTED_APP_CHANNEL", "nightly");

    const branding = await import("./branding");

    expect(branding.HOSTED_APP_CHANNEL).toBe("nightly");
    expect(branding.HOSTED_APP_CHANNEL_LABEL).toBe("Nightly");
    expect(branding.APP_STAGE_LABEL).toBe("Nightly");
    expect(branding.APP_DISPLAY_NAME).toBe("Marcode (Nightly)");
  });

  it("does not label the latest hosted app channel", async () => {
    vi.stubEnv("VITE_HOSTED_APP_CHANNEL", "latest");

    const branding = await import("./branding");

    expect(branding.HOSTED_APP_CHANNEL).toBe("latest");
    expect(branding.HOSTED_APP_CHANNEL_LABEL).toBe("Latest");
    expect(branding.APP_STAGE_LABEL).toBe("Latest");
    expect(branding.APP_DISPLAY_NAME).toBe("Marcode");
  });

  it("ignores unknown hosted app channels", async () => {
    vi.stubEnv("VITE_HOSTED_APP_CHANNEL", "preview");

    const branding = await import("./branding");

    expect(branding.HOSTED_APP_CHANNEL).toBeNull();
    expect(branding.HOSTED_APP_CHANNEL_LABEL).toBeNull();
  });
});

describe("branding logic", () => {
  it("returns Nightly for nightly primary server versions", () => {
    expect(
      resolveServerBackedAppStageLabel({
        primaryServerVersion: "0.0.28-nightly.20260616.12",
        fallbackStageLabel: "",
      }),
    ).toBe("Nightly");
  });

  it("updates the display name for nightly primary server versions", () => {
    expect(
      resolveServerBackedAppDisplayName({
        baseName: "Marcode",
        fallbackDisplayName: "Marcode",
        fallbackStageLabel: "",
        primaryServerVersion: "0.0.28-nightly.20260616.12",
      }),
    ).toBe("Marcode (Nightly)");
  });

  it("keeps the fallback display name for stable primary server versions", () => {
    expect(
      resolveServerBackedAppDisplayName({
        baseName: "Marcode",
        fallbackDisplayName: "Marcode",
        fallbackStageLabel: "",
        primaryServerVersion: "0.0.27",
      }),
    ).toBe("Marcode");
  });

  it("keeps the fallback display name for malformed nightly primary server versions", () => {
    expect(
      resolveServerBackedAppDisplayName({
        baseName: "Marcode",
        fallbackDisplayName: "Marcode",
        fallbackStageLabel: "",
        primaryServerVersion: "0.0.28-nightly.20260616",
      }),
    ).toBe("Marcode");
  });
});

describe("formatAppDisplayName", () => {
  it("renders the bare base name for an empty (GA/stable) stage label", () => {
    expect(formatAppDisplayName({ baseName: "Marcode", stageLabel: "" })).toBe("Marcode");
  });

  it("renders the bare base name for the latest hosted channel label", () => {
    expect(formatAppDisplayName({ baseName: "Marcode", stageLabel: "latest" })).toBe("Marcode");
  });

  it("appends a parenthetical for any other stage label", () => {
    expect(formatAppDisplayName({ baseName: "Marcode", stageLabel: "Dev" })).toBe("Marcode (Dev)");
    expect(formatAppDisplayName({ baseName: "Marcode", stageLabel: "Nightly" })).toBe(
      "Marcode (Nightly)",
    );
  });
});
