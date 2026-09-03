import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/unstable/reactivity";

import { FileSaveCoordinator } from "./fileSaveCoordinator";

function deferred() {
  let resolve!: (result: AtomCommandResult<void, never>) => void;
  const promise = new Promise<AtomCommandResult<void, never>>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("FileSaveCoordinator", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces edits and persists only the latest contents", async () => {
    vi.useFakeTimers();
    const persist = vi
      .fn<(contents: string) => Promise<AtomCommandResult<void, never>>>()
      .mockResolvedValue(AsyncResult.success(undefined));
    const onPendingChange = vi.fn();
    const onConfirmed = vi.fn();
    const coordinator = new FileSaveCoordinator({
      debounceMs: 500,
      persist,
      onPendingChange,
      onConfirmed,
    });

    coordinator.change("first");
    await vi.advanceTimersByTimeAsync(300);
    coordinator.change("latest");
    await vi.advanceTimersByTimeAsync(499);
    expect(persist).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(persist).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledWith("latest");
    expect(onConfirmed).toHaveBeenCalledWith("latest");
    expect(onPendingChange.mock.calls).toEqual([[true], [true], [false]]);
  });

  it("keeps pending state until an edit made during a write is also saved", async () => {
    vi.useFakeTimers();
    const firstWrite = deferred();
    const persist = vi
      .fn<(contents: string) => Promise<AtomCommandResult<void, never>>>()
      .mockReturnValueOnce(firstWrite.promise)
      .mockResolvedValueOnce(AsyncResult.success(undefined));
    const onPendingChange = vi.fn();
    const coordinator = new FileSaveCoordinator({
      debounceMs: 500,
      persist,
      onPendingChange,
      onConfirmed: vi.fn(),
    });

    coordinator.change("first");
    await vi.advanceTimersByTimeAsync(500);
    coordinator.change("latest");
    await vi.advanceTimersByTimeAsync(500);
    expect(persist).toHaveBeenCalledTimes(1);

    firstWrite.resolve(AsyncResult.success(undefined));
    await vi.runAllTimersAsync();
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenLastCalledWith("latest");
    expect(onPendingChange.mock.calls.at(-1)).toEqual([false]);
  });

  it("saves an edit made inside the debounce window when the editor closes", async () => {
    vi.useFakeTimers();
    const persist = vi
      .fn<(contents: string) => Promise<AtomCommandResult<void, never>>>()
      .mockResolvedValue(AsyncResult.success(undefined));
    const coordinator = new FileSaveCoordinator({
      debounceMs: 500,
      persist,
      onPendingChange: vi.fn(),
      onConfirmed: vi.fn(),
    });

    coordinator.change("unsaved");
    coordinator.dispose();
    await vi.runAllTimersAsync();

    expect(persist).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledWith("unsaved");
  });

  it("flushes an edit made while a write was in flight when the editor closes", async () => {
    vi.useFakeTimers();
    const inFlight = deferred();
    const persist = vi
      .fn<(contents: string) => Promise<AtomCommandResult<void, never>>>()
      .mockReturnValueOnce(inFlight.promise)
      .mockResolvedValue(AsyncResult.success(undefined));
    const coordinator = new FileSaveCoordinator({
      debounceMs: 500,
      persist,
      onPendingChange: vi.fn(),
      onConfirmed: vi.fn(),
    });

    coordinator.change("first");
    await vi.advanceTimersByTimeAsync(500);
    coordinator.change("latest");
    coordinator.dispose();
    inFlight.resolve(AsyncResult.success(undefined));
    await vi.runAllTimersAsync();

    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenLastCalledWith("latest");
  });

  it("does not rewrite a write that lands while the editor closes", async () => {
    vi.useFakeTimers();
    const inFlight = deferred();
    const persist = vi
      .fn<(contents: string) => Promise<AtomCommandResult<void, never>>>()
      .mockReturnValueOnce(inFlight.promise)
      .mockResolvedValue(AsyncResult.success(undefined));
    const coordinator = new FileSaveCoordinator({
      debounceMs: 500,
      persist,
      onPendingChange: vi.fn(),
      onConfirmed: vi.fn(),
    });

    coordinator.change("only");
    await vi.advanceTimersByTimeAsync(500);
    coordinator.dispose();
    inFlight.resolve(AsyncResult.success(undefined));
    await vi.runAllTimersAsync();

    expect(persist).toHaveBeenCalledOnce();
  });

  it("retries a failed write when the editor closes", async () => {
    vi.useFakeTimers();
    const persist = vi
      .fn()
      .mockResolvedValueOnce(AsyncResult.failure(Cause.fail(new Error("write failed"))))
      .mockResolvedValue(AsyncResult.success(undefined));
    const coordinator = new FileSaveCoordinator({
      debounceMs: 500,
      persist,
      onPendingChange: vi.fn(),
      onConfirmed: vi.fn(),
    });

    coordinator.change("latest");
    await vi.advanceTimersByTimeAsync(500);
    expect(persist).toHaveBeenCalledOnce();

    coordinator.dispose();
    await vi.runAllTimersAsync();

    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenLastCalledWith("latest");
  });

  it("leaves the file pending when the latest write fails", async () => {
    vi.useFakeTimers();
    const onPendingChange = vi.fn();
    const onError = vi.fn();
    const coordinator = new FileSaveCoordinator({
      debounceMs: 500,
      persist: vi
        .fn()
        .mockResolvedValue(AsyncResult.failure(Cause.fail(new Error("write failed")))),
      onPendingChange,
      onConfirmed: vi.fn(),
      onError,
    });

    coordinator.change("latest");
    await vi.advanceTimersByTimeAsync(500);
    await Promise.resolve();
    expect(onPendingChange).toHaveBeenCalledWith(true);
    expect(onPendingChange).not.toHaveBeenCalledWith(false);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect((onError.mock.calls[0]?.[0] as Error).message).toBe("write failed");
  });

  it("cancel() forgets pending edits without persisting them", async () => {
    vi.useFakeTimers();
    const persist = vi
      .fn<(contents: string) => Promise<AtomCommandResult<void, never>>>()
      .mockResolvedValue(AsyncResult.success(undefined));
    const onPendingChange = vi.fn();
    const coordinator = new FileSaveCoordinator({
      debounceMs: 500,
      persist,
      onPendingChange,
      onConfirmed: vi.fn(),
    });

    coordinator.change("first");
    coordinator.cancel();
    expect(onPendingChange.mock.calls).toEqual([[true], [false]]);

    // the debounce timer was cancelled, so it must not fire a persist
    await vi.runAllTimersAsync();
    expect(persist).not.toHaveBeenCalled();

    // dispose() after cancel() sees latestRevision === 0 and must not
    // force-persist the discarded contents either
    coordinator.dispose();
    await vi.runAllTimersAsync();
    expect(persist).not.toHaveBeenCalled();
  });

  it("cancel() during an in-flight write prevents any further persist once it completes", async () => {
    vi.useFakeTimers();
    const firstWrite = deferred();
    const persist = vi
      .fn<(contents: string) => Promise<AtomCommandResult<void, never>>>()
      .mockReturnValueOnce(firstWrite.promise);
    const onPendingChange = vi.fn();
    const coordinator = new FileSaveCoordinator({
      debounceMs: 500,
      persist,
      onPendingChange,
      onConfirmed: vi.fn(),
    });

    coordinator.change("first");
    await vi.advanceTimersByTimeAsync(500);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith("first");

    // discard while the write for "first" is still in flight — cancel()
    // cannot abort the in-flight network call itself, but it must stop any
    // further persist once that call resolves.
    coordinator.cancel();
    expect(onPendingChange).toHaveBeenLastCalledWith(false);

    firstWrite.resolve(AsyncResult.success(undefined));
    await vi.runAllTimersAsync();

    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("persists an edit made after a discard whose write confirmed late", async () => {
    // Regression: `cancel()` used to zero `latestRevision` alone. An in-flight
    // write confirming afterwards recorded `confirmedRevision = 1`, so the next
    // edit — whose revision climbs back to 1 — compared equal to that stale
    // confirmation and was silently never persisted. Discard-then-edit is an
    // ordinary floating-editor sequence, so the lost write was real data loss.
    vi.useFakeTimers();
    const firstWrite = deferred();
    const persist = vi
      .fn<(contents: string) => Promise<AtomCommandResult<void, never>>>()
      .mockReturnValueOnce(firstWrite.promise)
      .mockResolvedValue(AsyncResult.success(undefined));
    const onConfirmed = vi.fn();
    const coordinator = new FileSaveCoordinator({
      debounceMs: 500,
      persist,
      onPendingChange: vi.fn(),
      onConfirmed,
    });

    coordinator.change("first");
    await vi.advanceTimersByTimeAsync(500);
    expect(persist).toHaveBeenCalledTimes(1);

    coordinator.cancel();
    firstWrite.resolve(AsyncResult.success(undefined));
    await vi.runAllTimersAsync();
    expect(persist).toHaveBeenCalledTimes(1);

    coordinator.change("second");
    await vi.advanceTimersByTimeAsync(500);

    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenLastCalledWith("second");
    expect(onConfirmed).toHaveBeenLastCalledWith("second");
  });

  it("flush() persists immediately without waiting for the debounce", async () => {
    vi.useFakeTimers();
    const persist = vi
      .fn<(contents: string) => Promise<AtomCommandResult<void, never>>>()
      .mockResolvedValue(AsyncResult.success(undefined));
    const onConfirmed = vi.fn();
    const coordinator = new FileSaveCoordinator({
      debounceMs: 500,
      persist,
      onPendingChange: vi.fn(),
      onConfirmed,
    });

    coordinator.change("first");
    await vi.advanceTimersByTimeAsync(100);
    expect(persist).not.toHaveBeenCalled();

    await coordinator.flush();
    expect(persist).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledWith("first");
    expect(onConfirmed).toHaveBeenCalledWith("first");
  });

  it("flush() is a no-op when there is nothing to persist", async () => {
    vi.useFakeTimers();
    const persist = vi
      .fn<(contents: string) => Promise<AtomCommandResult<void, never>>>()
      .mockResolvedValue(AsyncResult.success(undefined));
    const coordinator = new FileSaveCoordinator({
      debounceMs: 500,
      persist,
      onPendingChange: vi.fn(),
      onConfirmed: vi.fn(),
    });

    await coordinator.flush();
    expect(persist).not.toHaveBeenCalled();
  });

  it("flush() during an in-flight write re-persists the latest without debounce", async () => {
    vi.useFakeTimers();
    const firstWrite = deferred();
    const persist = vi
      .fn<(contents: string) => Promise<AtomCommandResult<void, never>>>()
      .mockReturnValueOnce(firstWrite.promise)
      .mockResolvedValueOnce(AsyncResult.success(undefined));
    const coordinator = new FileSaveCoordinator({
      debounceMs: 500,
      persist,
      onPendingChange: vi.fn(),
      onConfirmed: vi.fn(),
    });

    coordinator.change("a");
    void coordinator.flush();
    await Promise.resolve();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenLastCalledWith("a");

    // new content arrives while "a" is still saving; flush marks it immediate
    coordinator.change("b");
    void coordinator.flush();
    await Promise.resolve();
    expect(persist).toHaveBeenCalledTimes(1);

    // completing "a" should persist "b" on a 0ms timer, not a 500ms debounce
    firstWrite.resolve(AsyncResult.success(undefined));
    await vi.advanceTimersByTimeAsync(1);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenLastCalledWith("b");
  });

  it("ignores editor changes emitted after disposal", async () => {
    vi.useFakeTimers();
    const persist = vi
      .fn<(contents: string) => Promise<AtomCommandResult<void, never>>>()
      .mockResolvedValue(AsyncResult.success(undefined));
    const onPendingChange = vi.fn();
    const coordinator = new FileSaveCoordinator({
      debounceMs: 500,
      persist,
      onPendingChange,
      onConfirmed: vi.fn(),
    });

    coordinator.dispose();
    coordinator.change("stale contents");
    await vi.runAllTimersAsync();

    expect(persist).not.toHaveBeenCalled();
    expect(onPendingChange).not.toHaveBeenCalled();
  });

  it("does not persist confirmed contents again on disposal", async () => {
    vi.useFakeTimers();
    const persist = vi
      .fn<(contents: string) => Promise<AtomCommandResult<void, never>>>()
      .mockResolvedValue(AsyncResult.success(undefined));
    const coordinator = new FileSaveCoordinator({
      debounceMs: 500,
      persist,
      onPendingChange: vi.fn(),
      onConfirmed: vi.fn(),
    });

    coordinator.change("temporary edit");
    await vi.advanceTimersByTimeAsync(500);
    coordinator.change("original contents");
    await vi.advanceTimersByTimeAsync(500);
    expect(persist).toHaveBeenCalledTimes(2);

    coordinator.dispose();
    await vi.runAllTimersAsync();

    expect(persist).toHaveBeenCalledTimes(2);
  });
});
