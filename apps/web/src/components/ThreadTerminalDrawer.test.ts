<<<<<<< HEAD
import { describe, expect, it } from "vite-plus/test";

import {
  isTerminalFindShortcut,
  resolveTerminalSelectionActionPosition,
  shouldHandleTerminalSelectionMouseUp,
  terminalFindShortcutLabel,
  terminalSelectionActionDelayForClickCount,
  visibleTerminalPlacementOptions,
} from "./ThreadTerminalDrawer";

describe("resolveTerminalSelectionActionPosition", () => {
  it("prefers the selection rect over the last pointer position", () => {
    expect(
      resolveTerminalSelectionActionPosition({
        bounds: { left: 100, top: 50, width: 500, height: 220 },
        selectionRect: { right: 260, bottom: 140 },
        pointer: { x: 520, y: 200 },
        viewport: { width: 1024, height: 768 },
      }),
    ).toEqual({
      x: 260,
      y: 144,
    });
  });

  it("falls back to the pointer position when no selection rect is available", () => {
    expect(
      resolveTerminalSelectionActionPosition({
        bounds: { left: 100, top: 50, width: 500, height: 220 },
        selectionRect: null,
        pointer: { x: 180, y: 130 },
        viewport: { width: 1024, height: 768 },
      }),
    ).toEqual({
      x: 180,
      y: 130,
    });
  });

  it("clamps the pointer fallback into the terminal drawer bounds", () => {
    expect(
      resolveTerminalSelectionActionPosition({
        bounds: { left: 100, top: 50, width: 500, height: 220 },
        selectionRect: null,
        pointer: { x: 720, y: 340 },
        viewport: { width: 1024, height: 768 },
      }),
    ).toEqual({
      x: 600,
      y: 270,
    });

    expect(
      resolveTerminalSelectionActionPosition({
        bounds: { left: 100, top: 50, width: 500, height: 220 },
        selectionRect: null,
        pointer: { x: 40, y: 20 },
        viewport: { width: 1024, height: 768 },
      }),
    ).toEqual({
      x: 100,
      y: 50,
    });
  });

  it("delays multi-click selection actions so triple-click selection can complete", () => {
    expect(terminalSelectionActionDelayForClickCount(1)).toBe(0);
    expect(terminalSelectionActionDelayForClickCount(2)).toBe(260);
    expect(terminalSelectionActionDelayForClickCount(3)).toBe(260);
  });

  it("only handles mouseup when the selection gesture started in the terminal", () => {
    expect(shouldHandleTerminalSelectionMouseUp(true, 0)).toBe(true);
    expect(shouldHandleTerminalSelectionMouseUp(false, 0)).toBe(false);
    expect(shouldHandleTerminalSelectionMouseUp(true, 1)).toBe(false);
  });
});
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
=======
import { describe, expect, it, vi } from "vite-plus/test";
import {
  applyTerminalAttachStreamEvent,
  combineTerminalSessionState,
  EMPTY_TERMINAL_BUFFER_STATE,
  INITIAL_TERMINAL_OUTPUT_CURSOR,
  nextTerminalAttachSeedState,
} from "@t3tools/client-runtime/state/terminal";

import {
  shouldClearTerminalSelectionAction,
  shouldHandleTerminalExit,
  synchronizeTerminalOutput,
  synchronizeTerminalSession,
} from "./ThreadTerminalDrawer";

describe("terminal selection actions", () => {
  it("does not let an old selection popup cancel its replacement right-click menu", () => {
    expect(
      shouldClearTerminalSelectionAction({
        actionPending: false,
        openMenuRequestId: 3,
        currentRequestId: 4,
      }),
    ).toBe(false);
    expect(
      shouldClearTerminalSelectionAction({
        actionPending: false,
        openMenuRequestId: null,
        currentRequestId: 4,
      }),
    ).toBe(false);
  });

  it("handles an exit that lands while the terminal surface is still loading", () => {
    expect(shouldHandleTerminalExit("exited", "running", false, 1)).toBe(true);
    expect(shouldHandleTerminalExit("exited", "exited", false, 1)).toBe(false);
    expect(shouldHandleTerminalExit("closed", "running", true, 1)).toBe(false);
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
  });
});

it("retains visible output and selection until a replacement subscription receives its snapshot", () => {
  const terminal = { resetAndWrite: vi.fn(), write: vi.fn(), clearSelection: vi.fn() };
  const snapshot = {
    threadId: "thread",
    terminalId: "term-1",
    cwd: "/repo",
    worktreePath: null,
    status: "running" as const,
    pid: 123,
    history: "host output",
    exitCode: null,
    exitSignal: null,
    label: "Terminal 1",
    updatedAt: "2026-09-05T00:00:00.000Z",
  };
  const attached = applyTerminalAttachStreamEvent(nextTerminalAttachSeedState(), {
    type: "snapshot",
    snapshot,
  });
  const cursor = synchronizeTerminalOutput(terminal, attached, INITIAL_TERMINAL_OUTPUT_CURSOR);
  expect(terminal.resetAndWrite).toHaveBeenLastCalledWith("host output");
  terminal.resetAndWrite.mockClear();
  terminal.clearSelection.mockClear();

  const pending = combineTerminalSessionState(
    { ...snapshot, hasRunningSubprocess: false },
    EMPTY_TERMINAL_BUFFER_STATE,
  );
  expect(pending.status).toBe("running");
  expect(synchronizeTerminalOutput(terminal, pending, cursor)).toBe(cursor);
  expect(terminal.resetAndWrite).not.toHaveBeenCalled();
  expect(terminal.write).not.toHaveBeenCalled();
  expect(terminal.clearSelection).not.toHaveBeenCalled();

  const observed = applyTerminalAttachStreamEvent(nextTerminalAttachSeedState(), {
    type: "snapshot",
    snapshot: { ...snapshot, history: "host output\nobserved output" },
  });
  const observedCursor = synchronizeTerminalOutput(terminal, observed, cursor);
  expect(terminal.resetAndWrite).toHaveBeenLastCalledWith("host output\nobserved output");

  const cleared = applyTerminalAttachStreamEvent(observed, {
    type: "cleared",
    threadId: "thread",
    terminalId: "term-1",
  });
  synchronizeTerminalOutput(terminal, cleared, observedCursor);
  expect(terminal.resetAndWrite).toHaveBeenLastCalledWith("");
});

it("reports an attach failure that leaves the output unchanged", () => {
  const terminal = { resetAndWrite: vi.fn(), write: vi.fn(), clearSelection: vi.fn() };
  const previous = { ...EMPTY_TERMINAL_BUFFER_STATE, error: null };
  const failed = { ...previous, error: "Terminal attach failed" };

  expect(
    synchronizeTerminalSession(terminal, previous, failed, INITIAL_TERMINAL_OUTPUT_CURSOR),
  ).toBe(INITIAL_TERMINAL_OUTPUT_CURSOR);
  expect(terminal.write).toHaveBeenCalledWith("\r\n[terminal] Terminal attach failed\r\n");
  expect(terminal.resetAndWrite).not.toHaveBeenCalled();
  expect(terminal.clearSelection).not.toHaveBeenCalled();
});
