import type {
  EnvironmentId,
  TerminalAttachStreamEvent,
  TerminalMetadataStreamEvent,
  TerminalSessionSnapshot,
  TerminalSummary,
  ThreadId,
} from "@t3tools/contracts";

export interface TerminalSessionState {
  readonly summary: TerminalSummary | null;
  readonly buffer: string;
  readonly status: TerminalSessionSnapshot["status"] | "closed";
  readonly error: string | null;
  readonly hasRunningSubprocess: boolean;
  readonly updatedAt: string | null;
  readonly version: number;
}

export interface TerminalBufferState {
  readonly buffer: string;
  readonly status: TerminalSessionSnapshot["status"] | "closed";
  readonly error: string | null;
  readonly updatedAt: string | null;
  readonly version: number;
}

export interface KnownTerminalSessionTarget {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly terminalId: string;
}

export interface KnownTerminalSession {
  readonly target: KnownTerminalSessionTarget;
  readonly state: TerminalSessionState;
}

export function selectRunningSubprocessTerminalIds(
  sessions: ReadonlyArray<KnownTerminalSession>,
): ReadonlyArray<string> {
  return sessions
    .filter((session) => session.state.hasRunningSubprocess)
    .map((session) => session.target.terminalId);
}

export const EMPTY_TERMINAL_BUFFER_STATE = Object.freeze<TerminalBufferState>({
  buffer: "",
  status: "closed",
  error: null,
  updatedAt: null,
  version: 0,
});

export const EMPTY_TERMINAL_SESSION_STATE = Object.freeze<TerminalSessionState>({
  summary: null,
  buffer: "",
  status: "closed",
  error: null,
  hasRunningSubprocess: false,
  updatedAt: null,
  version: 0,
});

export const DEFAULT_MAX_TERMINAL_BUFFER_BYTES = 512 * 1024;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// --- ANSI escape-sequence boundary detection --------------------------
//
// trimBufferToBytes() must never cut inside an escape sequence: a torn
// CSI/OSC/DCS/bare-ESC sequence loses its ESC byte, and the remaining
// parameter/final bytes then render as literal text (e.g. a torn
// "ESC [ 3 0 A" leaves "30A" on screen; a bare "ESC M" — Reverse Index,
// which has no parameterized multi-line form, so a shell emits it once
// per line — leaves a run of bare "M"s).
//
// This mirrors the byte classification apps/server/src/terminal/Manager.ts's
// sanitizeTerminalHistoryChunk() already uses (isCsiFinalByte,
// isEscapeIntermediateByte, isEscapeFinalByte, findStringTerminatorIndex),
// deliberately duplicated rather than imported: Manager.ts lives in
// apps/server (an app), this package is shared with apps/mobile, and its
// helpers are inlined for a keep-whole-or-drop-whole *stripping* decision,
// not exposed as a standalone "where does this sequence end" primitive —
// reusing them would mean refactoring that separately-tested file for this
// one caller. This port only needs a safe cut point, not strip/keep.

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
// or more intermediate bytes then one final byte. `start` is the index
// right after ESC. Returns the index right after the final byte, or null if
// `text` ends first.
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
// plain code point. A sequence that starts before the end of `text` but
// doesn't finish still counts as one unit extending to the end — safe to
// keep, since xterm.js buffers a partial sequence across separate write()
// calls the same way Manager.ts's pendingHistoryControlSequence defers a
// partial chunk. What must never happen is a cut landing *inside* a
// sequence, after its ESC/introducer has already been dropped.
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

// Walks `text` from its true start (always safe — nothing precedes it) and
// returns the smallest unit boundary >= idealStart. Scanning from a known-
// safe anchor, rather than pattern-matching on text.slice(idealStart) in
// isolation, is what makes this unambiguous: a leading digit at idealStart
// could be plain text or an orphaned CSI parameter, and there's no way to
// tell which from the suffix alone.
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

  let byteStart = encoded.byteLength - maxBufferBytes;
  while (byteStart < encoded.length) {
    const byte = encoded[byteStart];
    if (byte === undefined || (byte & 0b1100_0000) !== 0b1000_0000) {
      break;
    }
    byteStart += 1;
  }

  // byteStart now sits on a UTF-8 lead-byte boundary, so decoding the
  // dropped prefix on its own is exact and gives the equivalent code-unit
  // offset into `buffer` for the escape-boundary scan below.
  const droppedLength = textDecoder.decode(encoded.subarray(0, byteStart)).length;

  return buffer.slice(nearestSafeBoundaryAtOrAfter(buffer, droppedLength));
}

export function terminalBufferStateFromSnapshot(
  snapshot: TerminalSessionSnapshot,
  maxBufferBytes: number,
): TerminalBufferState {
  return {
    buffer: trimBufferToBytes(snapshot.history, maxBufferBytes),
    status: snapshot.status,
    error: null,
    updatedAt: snapshot.updatedAt,
    version: 1,
  };
}

function latestTimestamp(left: string | null, right: string | null): string | null {
  if (left === null) return right;
  if (right === null) return left;
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

export function combineTerminalSessionState(
  summary: TerminalSummary | null,
  buffer: TerminalBufferState,
): TerminalSessionState {
  return {
    summary,
    buffer: buffer.buffer,
    status: buffer.version > 0 ? buffer.status : (summary?.status ?? buffer.status),
    error: buffer.error,
    hasRunningSubprocess: summary?.hasRunningSubprocess ?? false,
    updatedAt: latestTimestamp(summary?.updatedAt ?? null, buffer.updatedAt),
    version: buffer.version,
  };
}

export function applyTerminalAttachStreamEvent(
  current: TerminalBufferState,
  event: TerminalAttachStreamEvent,
  maxBufferBytes = DEFAULT_MAX_TERMINAL_BUFFER_BYTES,
): TerminalBufferState {
  switch (event.type) {
    case "snapshot":
    case "restarted":
      return terminalBufferStateFromSnapshot(event.snapshot, maxBufferBytes);
    case "output":
      return {
        ...current,
        buffer: trimBufferToBytes(`${current.buffer}${event.data}`, maxBufferBytes),
        status: current.status === "closed" ? "running" : current.status,
        error: null,
        version: current.version + 1,
      };
    case "cleared":
      return {
        ...current,
        buffer: "",
        error: null,
        version: current.version + 1,
      };
    case "exited":
      return {
        ...current,
        status: "exited",
        error: null,
        version: current.version + 1,
      };
    case "closed":
      return {
        ...current,
        status: "closed",
        error: null,
        version: current.version + 1,
      };
    case "error":
      return {
        ...current,
        status: "error",
        error: event.message,
        version: current.version + 1,
      };
    case "activity":
      return current;
  }
}

export function applyTerminalMetadataStreamEvent(
  current: ReadonlyArray<TerminalSummary>,
  event: TerminalMetadataStreamEvent,
): ReadonlyArray<TerminalSummary> {
  if (event.type === "snapshot") {
    return event.terminals;
  }
  if (event.type === "remove") {
    return current.filter(
      (terminal) =>
        terminal.threadId !== event.threadId || terminal.terminalId !== event.terminalId,
    );
  }
  const next = current.filter(
    (terminal) =>
      terminal.threadId !== event.terminal.threadId ||
      terminal.terminalId !== event.terminal.terminalId,
  );
  return [...next, event.terminal];
}
