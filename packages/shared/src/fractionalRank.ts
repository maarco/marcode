/**
 * fractionalRank - pure fractional-indexing helper for stable sibling order.
 *
 * Produces lexically-comparable string ranks so that inserting, moving, or
 * appending a sibling never requires renumbering the rest of the list: sort
 * order is exactly string sort order (`Array.prototype.sort()` with the
 * default comparator, or SQL `ORDER BY rank ASC`).
 *
 * Algorithm: each rank is a base-36 "digit string" interpreted as a
 * fractional number in [0, 1) — digit `i` contributes `digitValue *
 * 36^-(i+1)`. `rankBetween` walks the two boundary strings digit by digit and
 * either (a) picks a clean midpoint digit when there is a gap greater than 1
 * between the boundary digits, or (b) copies the matching/boundary digit and
 * recurses one level deeper for more precision. This is the standard
 * "fractional indexing" midpoint algorithm (as used by Figma's realtime
 * ordered-sequence scheme and the `fractional-indexing` npm package), with
 * one deliberate restriction: the digit `"0"` (the alphabet minimum) is never
 * emitted as the final digit of a result. Without that restriction, a rank
 * could canonicalize to the literal string `"0"` (absolute value zero), and
 * because `"0"` already sits at the numeric floor of a [0, 1) fraction, nothing
 * could ever be inserted before it again — the classic "left edge" trap. Both
 * directions (insert-before-first, insert-after-last) are therefore unbounded:
 * you can always go one digit deeper.
 *
 * `needsCompaction` / `compactRanks` are the escape hatch for hygiene rather
 * than correctness: `rankBetween` always finds a midpoint, but repeatedly
 * inserting at the same narrow gap makes ranks grow by roughly one character
 * per insertion. `compactRanks` renumbers a sibling group back to short,
 * evenly-spaced ranks.
 */

const RANK_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const RANK_ALPHABET_PATTERN = /^[0-9a-z]+$/;
const BASE = RANK_ALPHABET.length;
const ZERO_DIGIT = RANK_ALPHABET[0]!;

/**
 * Ranks at or beyond this length are considered a compaction candidate. This
 * is a hygiene threshold, not a hard limit — `rankBetween` never fails
 * regardless of existing rank length.
 */
const MAX_RANK_LENGTH = 30;

function digitValue(char: string): number {
  const value = RANK_ALPHABET.indexOf(char);
  if (value === -1) {
    throw new RangeError(
      `fractionalRank: character "${char}" is not part of the rank alphabet "${RANK_ALPHABET}".`,
    );
  }
  return value;
}

function assertCanonicalRank(rank: string, label: string): void {
  if (rank.length === 0) {
    throw new RangeError(`fractionalRank: ${label} rank must not be empty.`);
  }
  if (!RANK_ALPHABET_PATTERN.test(rank)) {
    throw new RangeError(
      `fractionalRank: ${label} rank "${rank}" must contain only characters from "${RANK_ALPHABET}".`,
    );
  }
  if (rank.endsWith(ZERO_DIGIT)) {
    throw new RangeError(
      `fractionalRank: ${label} rank "${rank}" must not end in the "${ZERO_DIGIT}" digit (not a canonical rank).`,
    );
  }
}

/**
 * Digit-by-digit midpoint. `a` is the lower-bound digit string (`""` means no
 * lower bound / floor at 0). `b` is the upper-bound digit string, or
 * `undefined` for no upper bound. Precondition (maintained by every call
 * site, including recursive ones): the value represented by `a` is strictly
 * less than the value represented by `b` (or `b` is `undefined`).
 */
function midpoint(a: string, b: string | undefined): string {
  if (b !== undefined) {
    let n = 0;
    while (n < a.length && a[n] === b[n]) {
      n += 1;
    }
    if (n > 0) {
      return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
    }
  }

  const digitA = a.length > 0 ? digitValue(a[0]!) : 0;
  const digitB = b !== undefined && b.length > 0 ? digitValue(b[0]!) : BASE;

  if (digitB - digitA > 1) {
    const midDigit = Math.round((digitA + digitB) / 2);
    return RANK_ALPHABET[midDigit]!;
  }

  // Gap of 0 or 1 at this digit: truncating to b's own first digit is only
  // safe when that digit is nonzero (a zero digit here would either be
  // non-canonical or would recreate the "leading zero" trap). Otherwise copy
  // the (matching or boundary) digit and go one level deeper for room.
  if (b !== undefined && b.length > 1 && digitB > 0) {
    return b.slice(0, 1);
  }

  return RANK_ALPHABET[digitA]! + midpoint(a.slice(1), b === undefined ? undefined : b.slice(1));
}

/**
 * Returns a rank that sorts strictly between `before` and `after`. Pass
 * `null` for `before` to mean "before every existing rank" (insert at the
 * very start) and `null` for `after` to mean "after every existing rank"
 * (insert at the very end). Passing `null` for both produces a reasonable
 * first rank for an empty list.
 *
 * Throws `RangeError` if `before`/`after` are not canonical ranks (as
 * produced by this module), or if `before` does not sort strictly before
 * `after`.
 */
export function rankBetween(before: string | null, after: string | null): string {
  if (before !== null) {
    assertCanonicalRank(before, "before");
  }
  if (after !== null) {
    assertCanonicalRank(after, "after");
  }
  if (before !== null && after !== null && before >= after) {
    throw new RangeError(
      `fractionalRank.rankBetween: before ("${before}") must sort strictly before after ("${after}").`,
    );
  }
  return midpoint(before ?? "", after ?? undefined);
}

function evenlySpacedRanks(count: number): ReadonlyArray<string> {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`fractionalRank: count must be a non-negative integer, got ${count}.`);
  }
  const ranks = new Array<string>(count);
  const fill = (
    startIndex: number,
    endIndexExclusive: number,
    lower: string | null,
    upper: string | null,
  ): void => {
    if (startIndex >= endIndexExclusive) {
      return;
    }
    const midIndex = startIndex + Math.floor((endIndexExclusive - startIndex) / 2);
    const rank = rankBetween(lower, upper);
    ranks[midIndex] = rank;
    fill(startIndex, midIndex, lower, rank);
    fill(midIndex + 1, endIndexExclusive, rank, upper);
  };
  fill(0, count, null, null);
  return ranks;
}

/**
 * Generates `count` fresh, strictly increasing, canonical ranks with no
 * prior context (e.g. seeding the initial order for a set of items that have
 * never been ranked). Uses balanced bisection so rank length stays
 * `O(log count)` rather than growing linearly.
 */
export function rankSequence(count: number): ReadonlyArray<string> {
  return evenlySpacedRanks(count);
}

/**
 * True if a sibling group's ranks are worth renumbering: a duplicate rank
 * (which would make sibling order ambiguous) or a rank at/over the hygiene
 * length threshold (a signal that many fine-grained inserts landed in the
 * same gap). Order-independent — callers may pass ranks in any order.
 */
export function needsCompaction(ranks: readonly string[]): boolean {
  const seen = new Set<string>();
  for (const rank of ranks) {
    if (rank.length >= MAX_RANK_LENGTH) {
      return true;
    }
    if (seen.has(rank)) {
      return true;
    }
    seen.add(rank);
  }
  return false;
}

/**
 * Renumbers a sibling group to `count` fresh, short, evenly-spaced canonical
 * ranks. Callers are responsible for re-assigning the returned ranks, in
 * order, to the existing siblings (in their current relative order) — this
 * function only produces the new rank values.
 */
export function compactRanks(count: number): ReadonlyArray<string> {
  return evenlySpacedRanks(count);
}
