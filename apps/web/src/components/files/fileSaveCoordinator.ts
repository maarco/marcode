import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import * as Cause from "effect/Cause";

export interface FileSaveCoordinatorOptions<A, E> {
  readonly debounceMs: number;
  readonly persist: (contents: string) => Promise<AtomCommandResult<A, E>>;
  readonly onPendingChange: (pending: boolean) => void;
  readonly onConfirmed: (contents: string) => void;
  /**
   * Called when a persist attempt fails. Pending/dirty state is unaffected.
   * Declared with method shorthand (not an arrow-typed property) so `E` stays
   * bivariantly checked here, matching its only other appearance (`persist`'s
   * return type) — otherwise this field alone would make `E` invariant and
   * break every existing `FileSaveCoordinator` (defaulting to `<unknown,
   * unknown>`) call site that widens a narrower-typed instance into it.
   */
  onError?(error: E): void;
}

export class FileSaveCoordinator<A = unknown, E = unknown> {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private latestContents = "";
  private latestRevision = 0;
  private confirmedRevision = 0;
  private lastChangeAt = 0;
  private saving = false;
  private disposed = false;
  private flushRequested = false;
  /**
   * Bumped by `cancel()`. A write already in flight when the buffer is
   * discarded must not report its revision as confirmed: upstream's entry
   * guard compares `latestRevision` with `confirmedRevision`, so a stale
   * confirmation would leave the two unequal and let the discarded buffer
   * persist a second time.
   */
  private cancelToken = 0;

  constructor(private readonly options: FileSaveCoordinatorOptions<A, E>) {}

  change(contents: string): void {
    if (this.disposed) return;
    this.latestContents = contents;
    this.latestRevision += 1;
    this.lastChangeAt = Date.now();
    this.options.onPendingChange(true);
    this.schedule(this.options.debounceMs);
  }

  /**
   * Persist the latest contents immediately, cancelling the debounce timer.
   * Used for explicit "save now" (e.g. Cmd+S). If a save is already in flight,
   * the latest contents are persisted as soon as it completes, skipping the
   * remaining debounce.
   */
  flush(): Promise<void> {
    this.clearTimer();
    if (this.latestRevision === 0) return Promise.resolve();
    this.flushRequested = true;
    return this.persistLatest();
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
    if (this.latestRevision > 0) void this.persistLatest();
  }

  /**
   * Forget the pending buffer without persisting it (explicit discard/revert).
   * Cancels the debounce timer and zeroes `latestRevision`, so a subsequent
   * `dispose()` treats there as nothing pending and skips its force-persist.
   * If a write is already in flight, this can't abort that network call —
   * there is no cancellation token wired through `persist()` — but it does
   * clear `flushRequested` and zero both revision counters so the in-flight
   * write's completion cannot reschedule a further persist: `persistLatest()`'s
   * entry guard (`this.saving || this.latestRevision === this.confirmedRevision`)
   * makes any such stray reschedule a no-op when it fires.
   */
  cancel(): void {
    this.clearTimer();
    this.cancelToken += 1;
    this.latestRevision = 0;
    this.confirmedRevision = 0;
    this.flushRequested = false;
    this.options.onPendingChange(false);
  }

  private schedule(delay: number): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.persistLatest();
    }, delay);
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private async persistLatest(): Promise<void> {
    if (this.saving || this.latestRevision === this.confirmedRevision) return;

    this.saving = true;
    const cancelToken = this.cancelToken;
    const contents = this.latestContents;
    const revision = this.latestRevision;
    const result = await this.options.persist(contents);
    const cancelled = cancelToken !== this.cancelToken;
    const succeeded = result._tag === "Success";
    if (succeeded) {
      // The write did land, so the caller still hears about it; only the
      // revision bookkeeping is skipped for a buffer that was discarded.
      if (!cancelled) this.confirmedRevision = revision;
      this.options.onConfirmed(contents);
    } else {
      this.options.onError?.(Cause.squash(result.cause) as E);
    }

    this.saving = false;
    if (cancelled) {
      this.flushRequested = false;
      return;
    }
    if (revision === this.latestRevision) {
      if (succeeded) this.options.onPendingChange(false);
      this.flushRequested = false;
      return;
    }

    if (this.disposed) {
      void this.persistLatest();
      return;
    }
    if (this.flushRequested) {
      this.flushRequested = false;
      this.schedule(0);
      return;
    }
    const remainingDebounce = Math.max(
      0,
      this.options.debounceMs - (Date.now() - this.lastChangeAt),
    );
    this.schedule(remainingDebounce);
  }
}
