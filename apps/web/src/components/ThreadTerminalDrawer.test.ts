import { describe, expect, it } from "vite-plus/test";

import {
  isTerminalFindShortcut,
  resolveTerminalSelectionActionPosition,
  shouldHandleTerminalSelectionMouseUp,
  terminalFindShortcutLabel,
  terminalSelectionActionDelayForClickCount,
  visibleTerminalPlacementOptions,
} from "./ThreadTerminalDrawer";

describe("visibleTerminalPlacementOptions", () => {
  it("never renders the placement the terminal is already in", () => {
    for (const placement of ["bottom", "right", "floating"] as const) {
      const options = visibleTerminalPlacementOptions(placement);
      expect(options).toHaveLength(2);
      expect(options.map((option) => option.value)).not.toContain(placement);
    }
  });

  it("keeps the button count constant so the control row cannot shift", () => {
    const counts = (["bottom", "right", "floating"] as const).map(
      (placement) => visibleTerminalPlacementOptions(placement).length,
    );
    expect(new Set(counts).size).toBe(1);
  });

  it("gives every placement a distinct Title Case label and a distinct icon", () => {
    const all = visibleTerminalPlacementOptions("bottom").concat(
      visibleTerminalPlacementOptions("floating"),
    );
    const labels = all.map((option) => option.label);
    expect(new Set(labels).size).toBe(new Set(all.map((option) => option.value)).size);
    for (const label of labels) {
      expect(label[0]).toBe(label[0]?.toUpperCase());
    }
    expect(new Set(all.map((option) => option.Icon)).size).toBe(
      new Set(all.map((option) => option.value)).size,
    );
  });
});

describe("isTerminalFindShortcut", () => {
  const keydown = (init: Partial<KeyboardEvent>) =>
    ({
      type: "keydown",
      key: "f",
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      ...init,
    }) as KeyboardEvent;

  it("matches Cmd+F and Ctrl+Shift+F", () => {
    expect(isTerminalFindShortcut(keydown({ metaKey: true }))).toBe(true);
    expect(isTerminalFindShortcut(keydown({ key: "F", metaKey: true }))).toBe(true);
    expect(isTerminalFindShortcut(keydown({ ctrlKey: true, shiftKey: true }))).toBe(true);
  });

  it("leaves bare Ctrl+F to readline and ignores non-keydown events", () => {
    expect(isTerminalFindShortcut(keydown({ ctrlKey: true }))).toBe(false);
    expect(isTerminalFindShortcut(keydown({ metaKey: true, altKey: true }))).toBe(false);
    expect(isTerminalFindShortcut(keydown({ key: "g", metaKey: true }))).toBe(false);
    expect(isTerminalFindShortcut(keydown({ type: "keyup", metaKey: true }))).toBe(false);
  });

  it("labels the shortcut for the actual platform", () => {
    expect(terminalFindShortcutLabel("MacIntel")).toBe("⌘F");
    expect(terminalFindShortcutLabel("Win32")).toBe("Ctrl+Shift+F");
  });
});
