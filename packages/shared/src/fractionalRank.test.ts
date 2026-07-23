import { describe, expect, it } from "vite-plus/test";
import { compactRanks, needsCompaction, rankBetween, rankSequence } from "./fractionalRank.ts";

function assertSorted(ranks: readonly string[]): void {
  const sorted = [...ranks].sort();
  expect(ranks).toEqual(sorted);
}

function assertStrictlyIncreasing(ranks: readonly string[]): void {
  for (let i = 1; i < ranks.length; i += 1) {
    expect(ranks[i - 1]! < ranks[i]!).toBe(true);
  }
}

describe("rankBetween", () => {
  it("returns a reasonable seed rank when both bounds are null", () => {
    const rank = rankBetween(null, null);
    expect(rank.length).toBeGreaterThan(0);
  });

  it("inserts between two existing ranks in the correct order", () => {
    const first = rankBetween(null, null);
    const last = rankBetween(first, null);
    const middle = rankBetween(first, last);
    expect(first < middle).toBe(true);
    expect(middle < last).toBe(true);
  });

  it("repeated append-at-end stays strictly increasing and never throws", () => {
    let previous: string | null = null;
    const ranks: string[] = [];
    for (let i = 0; i < 200; i += 1) {
      const next = rankBetween(previous, null);
      ranks.push(next);
      previous = next;
    }
    assertStrictlyIncreasing(ranks);
  });

  it("repeated insert-at-start stays strictly decreasing and never throws (lower-bound stress case)", () => {
    // This is the pathological direction: the naive fractional-digit scheme
    // has a hard floor at the numeric value 0, so repeatedly inserting
    // "before everything" is the case most likely to expose an off-by-one in
    // the zero-digit handling. Run it far past any reasonable UI usage.
    let upper: string | null = rankBetween(null, null);
    const ranks: string[] = [upper];
    for (let i = 0; i < 500; i += 1) {
      const next = rankBetween(null, upper);
      ranks.unshift(next);
      upper = next;
    }
    assertStrictlyIncreasing(ranks);
  });

  it("never produces a bare zero rank (the unrecoverable lower-bound trap)", () => {
    let upper: string | null = null;
    for (let i = 0; i < 100; i += 1) {
      const next = rankBetween(null, upper);
      expect(next).not.toBe("0");
      upper = next;
    }
  });

  it("alternating insert-before/insert-after around a fixed anchor stays sorted", () => {
    const anchor = rankBetween(null, null);
    let low: string | null = anchor;
    let high: string | null = anchor;
    const ranks = [anchor];
    for (let i = 0; i < 100; i += 1) {
      const before = rankBetween(null, low);
      const after = rankBetween(high, null);
      ranks.unshift(before);
      ranks.push(after);
      low = before;
      high = after;
    }
    assertStrictlyIncreasing(ranks);
  });

  it("repeatedly inserting in the same narrow gap stays strictly ordered (rank length grows)", () => {
    const left = rankBetween(null, null);
    const right = rankBetween(left, null);
    let cursor = right;
    const lengths: number[] = [];
    for (let i = 0; i < 40; i += 1) {
      const inserted = rankBetween(left, cursor);
      expect(inserted > left).toBe(true);
      expect(inserted < cursor).toBe(true);
      cursor = inserted;
      lengths.push(inserted.length);
    }
    // Confirms the "grows roughly one character per insert in the same gap"
    // property that motivates needsCompaction's length heuristic.
    expect(lengths.at(-1)!).toBeGreaterThan(lengths[0]!);
  });

  it("shares a common prefix when inserting between two ranks that already share one", () => {
    const a = rankBetween(null, null); // "i"
    const b = rankBetween(a, null); // shares no prefix with a, but let's build one
    const withCommonPrefix1 = `${a}1`;
    const withCommonPrefix2 = `${a}9`;
    const between = rankBetween(withCommonPrefix1, withCommonPrefix2);
    expect(between.startsWith(a)).toBe(true);
    expect(between > withCommonPrefix1).toBe(true);
    expect(between < withCommonPrefix2).toBe(true);
    void b;
  });

  it("throws when before does not sort strictly before after", () => {
    const rank = rankBetween(null, null);
    expect(() => rankBetween(rank, rank)).toThrow(RangeError);
    const higher = rankBetween(rank, null);
    expect(() => rankBetween(higher, rank)).toThrow(RangeError);
  });

  it("rejects non-canonical rank inputs", () => {
    expect(() => rankBetween("0", null)).toThrow(RangeError); // bare zero never produced, never accepted
    expect(() => rankBetween("a0", null)).toThrow(RangeError); // trailing zero digit
    expect(() => rankBetween(null, "")).toThrow(RangeError); // empty string
    expect(() => rankBetween("A", null)).toThrow(RangeError); // uppercase not in alphabet
    expect(() => rankBetween("i!", null)).toThrow(RangeError); // invalid character
  });

  it("brute-force simulation: a long sequence of random-position inserts stays globally sorted", () => {
    // Deterministic pseudo-random sequence (no Math.random) so this is
    // reproducible; exercises a mix of insert-before-first, insert-after-last,
    // and insert-in-the-middle against a growing list.
    let seed = 42;
    const nextIndex = (max: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return max <= 0 ? 0 : seed % (max + 1);
    };

    const ranks: string[] = [rankBetween(null, null)];
    for (let i = 0; i < 300; i += 1) {
      const insertAt = nextIndex(ranks.length);
      const before = insertAt === 0 ? null : ranks[insertAt - 1]!;
      const after = insertAt === ranks.length ? null : ranks[insertAt]!;
      const inserted = rankBetween(before, after);
      ranks.splice(insertAt, 0, inserted);
    }

    assertStrictlyIncreasing(ranks);
    assertSorted(ranks);
  });
});

describe("rankSequence", () => {
  it("returns an empty array for count 0", () => {
    expect(rankSequence(0)).toEqual([]);
  });

  it("returns a single rank for count 1", () => {
    const ranks = rankSequence(1);
    expect(ranks.length).toBe(1);
  });

  for (const count of [2, 3, 5, 35, 60, 200]) {
    it(`returns ${count} strictly increasing, distinct, canonical ranks`, () => {
      const ranks = rankSequence(count);
      expect(ranks.length).toBe(count);
      assertStrictlyIncreasing(ranks);
      expect(new Set(ranks).size).toBe(count);
      for (const rank of ranks) {
        expect(() => rankBetween(rank, null)).not.toThrow();
      }
    });
  }

  it("rejects a negative or non-integer count", () => {
    expect(() => rankSequence(-1)).toThrow(RangeError);
    expect(() => rankSequence(1.5)).toThrow(RangeError);
  });
});

describe("needsCompaction", () => {
  it("is false for a small set of short, distinct ranks", () => {
    const ranks = rankSequence(10);
    expect(needsCompaction(ranks)).toBe(false);
  });

  it("is true when two ranks are exactly equal", () => {
    const rank = rankBetween(null, null);
    expect(needsCompaction([rank, rank])).toBe(true);
  });

  it("is true when a rank has grown past the hygiene length threshold", () => {
    const longRank = "a".repeat(31);
    expect(needsCompaction(["b", longRank])).toBe(true);
  });

  it("is false right at a short boundary length", () => {
    const shortRank = "a".repeat(5);
    expect(needsCompaction(["b", shortRank])).toBe(false);
  });

  it("is order-independent", () => {
    const longRank = "z".repeat(31);
    expect(needsCompaction(["a", longRank, "m"])).toBe(needsCompaction([longRank, "m", "a"]));
  });
});

describe("compactRanks", () => {
  it("produces exactly `count` strictly increasing, distinct, canonical ranks", () => {
    for (const count of [0, 1, 2, 7, 50]) {
      const ranks = compactRanks(count);
      expect(ranks.length).toBe(count);
      assertStrictlyIncreasing(ranks);
      expect(new Set(ranks).size).toBe(count);
    }
  });

  it("produces ranks that do not themselves need compaction", () => {
    const ranks = compactRanks(64);
    expect(needsCompaction(ranks)).toBe(false);
  });

  it("simulates exhaustion-then-compaction: repeated same-gap inserts followed by a compaction pass recovers short ranks", () => {
    // Drive one gap until it trips the compaction heuristic...
    let left: string | null = rankBetween(null, null);
    let right: string | null = rankBetween(left, null);
    const siblingsInOrder: string[] = [left, right];
    let cursor = right;
    let compactionTriggered = false;
    for (let i = 0; i < 40 && !compactionTriggered; i += 1) {
      const inserted = rankBetween(left, cursor);
      siblingsInOrder.splice(siblingsInOrder.length - 1, 0, inserted);
      cursor = inserted;
      if (needsCompaction(siblingsInOrder)) {
        compactionTriggered = true;
      }
    }
    expect(compactionTriggered).toBe(true);

    // ...then compact: re-assign fresh ranks in the same relative order.
    const recompacted = compactRanks(siblingsInOrder.length);
    assertStrictlyIncreasing(recompacted);
    expect(needsCompaction(recompacted)).toBe(false);
    expect(recompacted.length).toBe(siblingsInOrder.length);
  });
});
