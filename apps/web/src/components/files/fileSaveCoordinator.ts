import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import * as Cause from "effect/Cause";

export interface FileSaveCoordinatorOptions<A, E> {
  readonly debounceMs: number;
  readonly canPersist?: () => boolean;
  readonly persist: (contents: string) => Promise<AtomCommandResult<A, E>>;
  readonly onPendingChange: (pending: boolean) => void;
  /** Return false when another editor has newer unsaved contents. */
  readonly onConfirmed: (contents: string) => boolean | void;
  /** Called when a write pass ends with nothing further scheduled. */
  readonly onSettled?: () => void;
  /**
   * Called when a persist attempt fails. Pending/dirty state is unaffected.
   * Method shorthand (not an arrow-typed property) keeps `E` bivariant, like
   * `persist`'s return type, so narrower-typed instances still widen.
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
  private flushing = false;
  /**
   * Bumped by `cancel()`. A write already in flight when the buffer is discarded
   * must not report its revision as confirmed, or the discarded buffer would
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

  /** The newest contents not yet written, which is the last write this coordinator will make. */
  get unconfirmedContents(): string | null {
    return this.latestRevision === this.confirmedRevision ? null : this.latestContents;
  }

  /**
   * Writes the newest draft now instead of after the debounce, then any draft
   * queued behind it. Resolves when this pass ends (explicit "save now").
   */
  flush(): Promise<void> {
    this.clearTimer();
    if (this.latestRevision === 0) {
      // Nothing was ever written, but a session releasing on flush still waits for this.
      this.options.onSettled?.();
      return Promise.resolve();
    }
    this.flushing = true;
    return this.persistLatest();
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
    if (this.latestRevision > 0) void this.persistLatest();
  }

  /**
   * Forget the pending buffer without persisting it (explicit discard/revert).
   * Zeroes both revision counters so an in-flight write confirming later can
   * neither re-persist the discarded buffer nor swallow the next edit.
   */
  cancel(): void {
    this.clearTimer();
    this.cancelToken += 1;
    this.latestRevision = 0;
    this.confirmedRevision = 0;
    this.flushing = false;
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
    if (this.saving) return;
    // `latestRevision === 0` is cancel()'s "nothing pending" sentinel.
    if (
      this.latestRevision === 0 ||
      this.latestRevision === this.confirmedRevision ||
      this.options.canPersist?.() === false
    ) {
      this.settle();
      return;
    }

    this.saving = true;
    const cancelToken = this.cancelToken;
    const contents = this.latestContents;
    const revision = this.latestRevision;
    const result = await this.options.persist(contents);
    const cancelled = cancelToken !== this.cancelToken;
    const succeeded = result._tag === "Success";
    let confirmed = false;
    if (succeeded) {
      // The write did land, so the caller still hears about it; the revision
      // bookkeeping is skipped for a buffer that was discarded after cancel().
      if (!cancelled && this.latestRevision !== 0) this.confirmedRevision = revision;
      confirmed = this.options.onConfirmed(contents) !== false;
    } else {
      this.options.onError?.(Cause.squash(result.cause) as E);
    }

    this.saving = false;
    if (cancelled) {
      this.settle();
      return;
    }
    if (revision === this.latestRevision) {
      if (confirmed) this.options.onPendingChange(false);
      this.settle();
      return;
    }

    const remainingDebounce = Math.max(
      0,
      this.options.debounceMs - (Date.now() - this.lastChangeAt),
    );
    if (this.disposed || this.flushing) {
      void this.persistLatest();
    } else {
      this.schedule(remainingDebounce);
    }
  }

  private settle(): void {
    this.flushing = false;
    this.options.onSettled?.();
  }
}

export interface DisposableFileSaveCoordinator {
  dispose(): void;
}

export type FileSaveCoordinatorDisposalTimers = Map<
  DisposableFileSaveCoordinator,
  ReturnType<typeof setTimeout>
>;

/**
 * Defer hook cleanup by one task so React Strict Mode can replay the effect
 * without permanently disposing the coordinator retained by the hook.
 */
export function deferFileSaveCoordinatorDispose(
  pending: FileSaveCoordinatorDisposalTimers,
  coordinator: DisposableFileSaveCoordinator,
): void {
  const timer = setTimeout(() => {
    if (pending.get(coordinator) !== timer) return;
    pending.delete(coordinator);
    coordinator.dispose();
  }, 0);
  pending.set(coordinator, timer);
}

export function cancelDeferredFileSaveCoordinatorDispose(
  pending: FileSaveCoordinatorDisposalTimers,
  coordinator: DisposableFileSaveCoordinator,
): void {
  const timer = pending.get(coordinator);
  if (timer === undefined) return;
  clearTimeout(timer);
  pending.delete(coordinator);
}
