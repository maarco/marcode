export interface TerminalOutputChunk {
  /** UTF-16 string offset within this generation and reset. */
  readonly startOffset: number;
  readonly data: string;
  readonly byteLength: number;
}

export interface TerminalOutputState {
  readonly generation: number;
  readonly chunks: ReadonlyArray<TerminalOutputChunk>;
  readonly retainedBytes: number;
  readonly resetVersion: number;
  readonly nextOffset: number;
}

export interface TerminalOutputCursor {
  readonly generation: number;
  readonly resetVersion: number;
  readonly offset: number;
}

/** Forces the first `readTerminalOutputUpdate` to resynchronize from a reset. */
export const INITIAL_TERMINAL_OUTPUT_CURSOR = Object.freeze<TerminalOutputCursor>({
  generation: -1,
  resetVersion: -1,
  offset: 0,
});

export type TerminalOutputUpdate =
  | {
      readonly type: "none";
      readonly cursor: TerminalOutputCursor;
    }
  | {
      readonly type: "reset";
      readonly data: string;
      readonly cursor: TerminalOutputCursor;
    }
  | {
      readonly type: "append";
      readonly cursor: TerminalOutputCursor;
      readonly data: string;
    };

export const DEFAULT_MAX_TERMINAL_BUFFER_BYTES = 512 * 1024;
const DEFAULT_TERMINAL_CHUNK_BYTES = 16 * 1024;
const MAX_TERMINAL_OUTPUT_CHUNKS = 1_024;
const textEncoder = new TextEncoder();
// A BOM at a retained chunk boundary is terminal data, not an encoding marker.
const textDecoder = new TextDecoder("utf-8", { ignoreBOM: true });

export const EMPTY_TERMINAL_OUTPUT_STATE = Object.freeze<TerminalOutputState>({
  generation: 0,
  chunks: Object.freeze([]),
  retainedBytes: 0,
  resetVersion: 0,
  nextOffset: 0,
});

interface Utf8Chunk {
  readonly data: string;
  readonly byteLength: number;
}

/**
 * Split a string into chunks of at most `maxBytes` UTF-8 bytes without cutting
 * a code point in half. The retained-output budget always supplies a positive
 * size. Only new output is encoded on live updates.
 *
 * A chunk that fits whole is returned as the original string, so the common
 * small-write path pays one encode and no decode.
 */
function splitStringByUtf8Bytes(data: string, maxBytes: number): ReadonlyArray<Utf8Chunk> {
  if (data.length === 0) return [];

  const encoded = textEncoder.encode(data);
  if (encoded.byteLength <= maxBytes) {
    return [{ data, byteLength: encoded.byteLength }];
  }

  const chunks: Utf8Chunk[] = [];
  let offset = 0;
  while (offset < encoded.byteLength) {
    let end = Math.min(offset + maxBytes, encoded.byteLength);
    while (end < encoded.byteLength && ((encoded[end] ?? 0) & 0xc0) === 0x80) {
      end -= 1;
    }
    // A degenerate budget smaller than one code point still has to advance:
    // include the whole code point rather than looping forever.
    if (end === offset) {
      end = Math.min(offset + maxBytes, encoded.byteLength);
      while (end < encoded.byteLength && ((encoded[end] ?? 0) & 0xc0) === 0x80) {
        end += 1;
      }
    }
    const bytes = encoded.subarray(offset, end);
    chunks.push({ data: textDecoder.decode(bytes), byteLength: bytes.byteLength });
    offset = end;
  }

  return chunks;
}

// ── Marcode fork seam ──────────────────────────────────────────────────
// Trimming must never cut inside an ANSI escape sequence: a torn CSI/OSC/
// DCS/bare-ESC sequence loses its ESC byte and its remaining parameter and
// final bytes then render as literal text (a torn "ESC [ 3 1 m" leaves
// "1mhello"; a bare "ESC M" — Reverse Index, which a shell emits once per
// line — leaves a run of bare "M"s).
//
// Marcode carried this on the single `trimBufferToBytes` this module was
// extracted from; upstream's split into a reset path (`trimBufferToBytes`)
// and an append path (`trimOutputChunkStart`) means both cut points need it.
//
// This mirrors the byte classification apps/server/src/terminal/Manager.ts's
// sanitizeTerminalHistoryChunk() already uses, deliberately duplicated rather
// than imported: Manager.ts lives in apps/server (an app), this package is
// shared with apps/mobile, and its helpers are inlined for a keep-whole-or-
// drop-whole *stripping* decision, not exposed as a standalone "where does
// this sequence end" primitive. This port only needs a safe cut point.

function isCsiFinalByte(codePoint: number): boolean {
  return codePoint >= 0x40 && codePoint <= 0x7e;
}

function isEscapeIntermediateByte(codePoint: number): boolean {
  return codePoint >= 0x20 && codePoint <= 0x2f;
}

function isEscapeFinalByte(codePoint: number): boolean {
  return codePoint >= 0x30 && codePoint <= 0x7e;
}

// OSC / DCS / PM / APC are terminated by ST (ESC \), BEL, or the 8-bit ST
// (0x9c). Returns the index right after the terminator, or null if `text`
// ends first.
function findStringTerminatorEnd(text: string, start: number): number | null {
  for (let index = start; index < text.length; index += 1) {
    const codePoint = text.charCodeAt(index);
    if (codePoint === 0x07 || codePoint === 0x9c) {
      return index + 1;
    }
    if (codePoint === 0x1b && text.charCodeAt(index + 1) === 0x5c) {
      return index + 2;
    }
  }
  return null;
}

// Bare "Fe/Fp/Fs" escapes, e.g. ESC M (Reverse Index) or ESC c (RIS): zero
// or more intermediate bytes then one final byte. `start` is the index right
// after ESC. Returns the index right after the final byte, or null if `text`
// ends first.
function findBareEscapeSequenceEnd(text: string, start: number): number | null {
  let cursor = start;
  while (cursor < text.length && isEscapeIntermediateByte(text.charCodeAt(cursor))) {
    cursor += 1;
  }
  if (cursor >= text.length) {
    return null;
  }
  return isEscapeFinalByte(text.charCodeAt(cursor)) ? cursor + 1 : start + 1;
}

// One code point, treating a valid surrogate pair as a single unit.
function plainTextUnitLength(text: string, index: number): number {
  const codePoint = text.charCodeAt(index);
  if (codePoint < 0xd800 || codePoint > 0xdbff) {
    return 1;
  }
  const low = text.charCodeAt(index + 1);
  return low >= 0xdc00 && low <= 0xdfff ? 2 : 1;
}

// Returns the index right after the single atomic unit starting at `index`:
// one whole escape sequence (7-bit ESC-prefixed or 8-bit C1 form) or one
// plain code point. A sequence that starts before the end of `text` but does
// not finish still counts as one unit extending to the end — safe to keep,
// since xterm.js buffers a partial sequence across separate write() calls.
// What must never happen is a cut landing *inside* a sequence, after its
// ESC/introducer has already been dropped.
function advanceOneUnit(text: string, index: number): number {
  const codePoint = text.charCodeAt(index);

  if (codePoint === 0x1b) {
    const next = text.charCodeAt(index + 1);

    if (next === 0x5b) {
      // CSI: ESC [ params... final
      let cursor = index + 2;
      while (cursor < text.length && !isCsiFinalByte(text.charCodeAt(cursor))) {
        cursor += 1;
      }
      return cursor < text.length ? cursor + 1 : text.length;
    }

    if (next === 0x5d || next === 0x50 || next === 0x5e || next === 0x5f) {
      // OSC / DCS / PM / APC: ESC ] | P | ^ | _  ...  ST
      return findStringTerminatorEnd(text, index + 2) ?? text.length;
    }

    return findBareEscapeSequenceEnd(text, index + 1) ?? text.length;
  }

  if (codePoint === 0x9b) {
    // 8-bit CSI
    let cursor = index + 1;
    while (cursor < text.length && !isCsiFinalByte(text.charCodeAt(cursor))) {
      cursor += 1;
    }
    return cursor < text.length ? cursor + 1 : text.length;
  }

  if (codePoint === 0x9d || codePoint === 0x90 || codePoint === 0x9e || codePoint === 0x9f) {
    // 8-bit OSC / DCS / PM / APC
    return findStringTerminatorEnd(text, index + 1) ?? text.length;
  }

  return index + plainTextUnitLength(text, index);
}

// Walks `text` from its start (a safe anchor — nothing precedes it) and
// returns the smallest unit boundary >= idealStart. Scanning from a known-safe
// anchor, rather than pattern-matching on text.slice(idealStart) in isolation,
// is what makes this unambiguous: a leading digit at idealStart could be plain
// text or an orphaned CSI parameter, and the suffix alone cannot say which.
function nearestSafeBoundaryAtOrAfter(text: string, idealStart: number): number {
  if (idealStart <= 0) {
    return 0;
  }
  if (idealStart >= text.length) {
    return text.length;
  }
  let index = 0;
  while (index < idealStart) {
    index = advanceOneUnit(text, index);
  }
  return index;
}

function trimBufferToBytes(buffer: string, maxBufferBytes: number): string {
  if (maxBufferBytes <= 0) {
    return "";
  }

  const encoded = textEncoder.encode(buffer);
  if (encoded.byteLength <= maxBufferBytes) {
    return buffer;
  }

  let start = encoded.byteLength - maxBufferBytes;
  while (start < encoded.length) {
    const byte = encoded[start];
    if (byte === undefined || (byte & 0b1100_0000) !== 0b1000_0000) {
      break;
    }
    start += 1;
  }

  // `start` now sits on a UTF-8 lead-byte boundary, so decoding the dropped
  // prefix on its own is exact and gives the equivalent code-unit offset into
  // `buffer` for the escape-boundary scan.
  const droppedLength = textDecoder.decode(encoded.subarray(0, start)).length;

  return buffer.slice(nearestSafeBoundaryAtOrAfter(buffer, droppedLength));
}

function splitOutputChunks(
  data: string,
  firstOffset: number,
  maxChunkBytes = DEFAULT_TERMINAL_CHUNK_BYTES,
): {
  readonly chunks: ReadonlyArray<TerminalOutputChunk>;
  readonly nextOffset: number;
  readonly byteLength: number;
} {
  const split = splitStringByUtf8Bytes(data, maxChunkBytes);
  let byteLength = 0;
  let nextOffset = firstOffset;
  const chunks = split.map((chunk) => {
    byteLength += chunk.byteLength;
    const startOffset = nextOffset;
    nextOffset += chunk.data.length;
    return {
      startOffset,
      data: chunk.data,
      byteLength: chunk.byteLength,
    };
  });

  return {
    chunks,
    nextOffset,
    byteLength,
  };
}

/**
 * Merge adjacent chunks without changing their string positions. A reader can
 * still append the unread suffix when its cursor falls inside a merged chunk.
 */
function compactRetainedChunks(chunks: ReadonlyArray<TerminalOutputChunk>) {
  const compacted: TerminalOutputChunk[] = [];
  for (const chunk of chunks) {
    const previous = compacted.at(-1);
    if (
      previous !== undefined &&
      previous.startOffset + previous.data.length === chunk.startOffset &&
      previous.byteLength + chunk.byteLength <= DEFAULT_TERMINAL_CHUNK_BYTES
    ) {
      compacted[compacted.length - 1] = {
        startOffset: previous.startOffset,
        data: `${previous.data}${chunk.data}`,
        byteLength: previous.byteLength + chunk.byteLength,
      };
    } else {
      compacted.push(chunk);
    }
  }
  return compacted;
}

// Scan only the removed prefix instead of encoding retained output again.
function trimOutputChunkStart(
  chunk: TerminalOutputChunk,
  bytesToDrop: number,
): TerminalOutputChunk {
  let offset = 0;
  let droppedBytes = 0;
  while (droppedBytes < bytesToDrop && offset < chunk.data.length) {
    const codepoint = chunk.data.codePointAt(offset)!;
    droppedBytes += codepoint <= 0x7f ? 1 : codepoint <= 0x7ff ? 2 : codepoint <= 0xffff ? 3 : 4;
    offset += codepoint <= 0xffff ? 1 : 2;
  }
  // Extend the cut to the next escape-sequence boundary. The scan anchors on
  // this chunk's own start, which is where the retained buffer begins.
  const safeOffset = nearestSafeBoundaryAtOrAfter(chunk.data, offset);
  while (offset < safeOffset) {
    const codepoint = chunk.data.codePointAt(offset)!;
    droppedBytes += codepoint <= 0x7f ? 1 : codepoint <= 0x7ff ? 2 : codepoint <= 0xffff ? 3 : 4;
    offset += codepoint <= 0xffff ? 1 : 2;
  }
  return {
    ...chunk,
    startOffset: chunk.startOffset + offset,
    data: chunk.data.slice(offset),
    byteLength: chunk.byteLength - droppedBytes,
  };
}

function appendOutput(
  current: TerminalOutputState,
  data: string,
  maxBufferBytes: number,
): TerminalOutputState {
  if (data.length === 0) return current;
  if (maxBufferBytes <= 0) {
    return {
      generation: current.generation,
      chunks: [],
      retainedBytes: 0,
      resetVersion: current.resetVersion + 1,
      nextOffset: current.nextOffset + data.length,
    };
  }
  const appended = splitOutputChunks(
    data,
    current.nextOffset,
    Math.min(DEFAULT_TERMINAL_CHUNK_BYTES, Math.max(1, maxBufferBytes)),
  );

  const chunks = [...current.chunks, ...appended.chunks];
  let retainedBytes = current.retainedBytes + appended.byteLength;
  let firstRetainedIndex = 0;
  while (retainedBytes > maxBufferBytes && firstRetainedIndex < chunks.length) {
    const first = chunks[firstRetainedIndex]!;
    const bytesToDrop = retainedBytes - maxBufferBytes;
    if (bytesToDrop < first.byteLength) {
      const trimmed = trimOutputChunkStart(first, bytesToDrop);
      retainedBytes -= first.byteLength - trimmed.byteLength;
      if (trimmed.byteLength > 0) {
        chunks[firstRetainedIndex] = trimmed;
      } else {
        firstRetainedIndex += 1;
      }
      break;
    }
    retainedBytes -= first.byteLength;
    firstRetainedIndex += 1;
  }

  let retainedChunks = firstRetainedIndex === 0 ? chunks : chunks.slice(firstRetainedIndex);
  if (retainedChunks.length > MAX_TERMINAL_OUTPUT_CHUNKS) {
    retainedChunks = compactRetainedChunks(retainedChunks);
    const excessChunks = retainedChunks.length - MAX_TERMINAL_OUTPUT_CHUNKS;
    if (excessChunks > 0) {
      for (const chunk of retainedChunks.slice(0, excessChunks)) {
        retainedBytes -= chunk.byteLength;
      }
      retainedChunks = retainedChunks.slice(excessChunks);
    }
  }

  return {
    generation: current.generation,
    chunks: retainedChunks,
    retainedBytes,
    resetVersion: current.resetVersion,
    nextOffset: appended.nextOffset,
  };
}

function resetOutput(
  current: TerminalOutputState,
  data: string,
  maxBufferBytes: number,
): TerminalOutputState {
  const retained = trimBufferToBytes(data, maxBufferBytes);
  const reset = splitOutputChunks(
    retained,
    0,
    Math.min(DEFAULT_TERMINAL_CHUNK_BYTES, Math.max(1, maxBufferBytes)),
  );
  return {
    generation: current.generation,
    chunks: reset.chunks,
    retainedBytes: reset.byteLength,
    resetVersion: current.resetVersion + 1,
    nextOffset: reset.nextOffset,
  };
}

export function terminalOutputText(output: TerminalOutputState): string {
  return output.chunks.map((chunk) => chunk.data).join("");
}

export function readTerminalOutputUpdate(
  output: TerminalOutputState,
  cursor: TerminalOutputCursor,
): TerminalOutputUpdate {
  const nextCursor = {
    generation: output.generation,
    resetVersion: output.resetVersion,
    offset: output.nextOffset,
  };
  const firstChunk = output.chunks[0];
  if (
    cursor.generation !== output.generation ||
    cursor.resetVersion !== output.resetVersion ||
    cursor.offset < (firstChunk?.startOffset ?? output.nextOffset)
  ) {
    return { type: "reset", data: terminalOutputText(output), cursor: nextCursor };
  }

  const appended = output.chunks.filter(
    (chunk) => chunk.startOffset + chunk.data.length > cursor.offset,
  );
  if (appended.length === 0) {
    return { type: "none", cursor: nextCursor };
  }
  return {
    type: "append",
    data: appended
      .map((chunk) => chunk.data.slice(Math.max(0, cursor.offset - chunk.startOffset)))
      .join(""),
    cursor: nextCursor,
  };
}

export { appendOutput, resetOutput };
