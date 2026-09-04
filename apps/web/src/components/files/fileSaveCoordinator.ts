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
  /** Bumped by cancel(), so a write already in flight can tell it was discarded. */
  private cancelGeneration = 0;
  private lastChangeAt = 0;
  private saving = false;
  private disposed = false;
  private flushRequested = false;

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
   *
   * Both counters, not just `latestRevision`: upstream's stale-write fix
   * (#8630) changed that guard from `latestRevision === 0` to a comparison
   * against the last confirmed revision, so zeroing one side alone would leave
   * them unequal and let a cancelled buffer persist after all.
   */
  cancel(): void {
    this.clearTimer();
    this.latestRevision = 0;
    this.confirmedRevision = 0;
    this.cancelGeneration++;
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
    const contents = this.latestContents;
    const revision = this.latestRevision;
    const generation = this.cancelGeneration;
    const result = await this.options.persist(contents);
    if (generation !== this.cancelGeneration) {
      // cancel() ran while this write was in flight. Its result must neither
      // confirm the discarded buffer nor reschedule a further persist.
      this.saving = false;
      return;
    }
    const succeeded = result._tag === "Success";
    if (succeeded) {
      this.confirmedRevision = revision;
      this.options.onConfirmed(contents);
    } else {
      this.options.onError?.(Cause.squash(result.cause) as E);
    }

    this.saving = false;
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
