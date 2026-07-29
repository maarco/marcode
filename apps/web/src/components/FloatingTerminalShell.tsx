import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize3Filled, Maximize4Filled, CloseCircleFilled } from "@aliimam/icons";
import { FLOATING_SURFACE_Z } from "~/editor/floating-surface-z";
import { pillIconButtonClass } from "./FloatingPillNav";
import { usePillNavPreferences, getPillNavShineGradient } from "~/editor/pill-prefs";
import { cn } from "~/lib/utils";

/**
 * Window chrome for the floating terminal — drag, resize, persisted geometry.
 *
 * Deliberately owns *no* terminal behaviour: the caller passes the existing
 * ThreadTerminalDrawer as children, so the PTY transport, split panes, context
 * capture and link handling all keep working untouched. This is a window, not a
 * terminal.
 *
 * Portaled to document.body so it escapes any transformed ancestor — a
 * `transform` on a parent makes `position: fixed` resolve against that parent
 * instead of the viewport, which would pin the panel inside the chat column.
 */

const GEOMETRY_KEY = "marcode:floating-terminal-geometry:v1";
const MIN_W = 400;
const MIN_H = 280;
const DEFAULT_W = 900;
const DEFAULT_H = 560;
const MOBILE_BREAKPOINT = 640;
const EDGE = 8;

export interface PanelGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

type ResizeDir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const RESIZE_HANDLES: ReadonlyArray<{ dir: ResizeDir; className: string }> = [
  { dir: "n", className: "top-0 inset-x-4 h-2 cursor-ns-resize" },
  { dir: "s", className: "bottom-0 inset-x-4 h-2 cursor-ns-resize" },
  { dir: "w", className: "left-0 inset-y-4 w-2 cursor-ew-resize" },
  { dir: "e", className: "right-0 inset-y-4 w-2 cursor-ew-resize" },
  { dir: "nw", className: "top-0 left-0 h-4 w-4 cursor-nwse-resize" },
  { dir: "ne", className: "top-0 right-0 h-4 w-4 cursor-nesw-resize" },
  { dir: "sw", className: "bottom-0 left-0 h-4 w-4 cursor-nesw-resize" },
  { dir: "se", className: "bottom-0 right-0 h-4 w-4 cursor-nwse-resize" },
];

/** Geometry is per-thread: these terminals are thread-scoped, unlike mentiko's global one. */
function storageKeyFor(scopeKey: string) {
  return `${GEOMETRY_KEY}:${scopeKey}`;
}

function currentViewport(): { width: number; height: number } {
  return { width: window.innerWidth, height: window.innerHeight };
}

function defaultGeometry(): PanelGeometry {
  const w = Math.min(DEFAULT_W, Math.max(MIN_W, window.innerWidth - 2 * EDGE));
  const h = Math.min(DEFAULT_H, Math.max(MIN_H, window.innerHeight - 2 * EDGE));
  // Clamped, not returned raw: on a short viewport the naive
  // `innerHeight - h - 24` is negative and the titlebar opens above the top edge.
  return clampGeometry(
    { x: window.innerWidth - w - 24, y: window.innerHeight - h - 24, w, h },
    currentViewport(),
  );
}

/**
 * Keep the panel usable after a viewport change.
 *
 * When the panel still fits, pull it fully on screen — leaving a panel hanging
 * off the right edge silently hides its right-anchored chrome (the find bar,
 * the action cluster) with no scrollbar to reveal it. Only when the panel is
 * wider than the viewport do we fall back to guaranteeing a grab-strip.
 */
export function clampGeometry(
  geo: PanelGeometry,
  viewport: { width: number; height: number },
): PanelGeometry {
  const w = Math.max(MIN_W, Math.min(geo.w, viewport.width - 2 * EDGE));
  const h = Math.max(MIN_H, Math.min(geo.h, viewport.height - 2 * EDGE));
  const fitsHorizontally = w + 2 * EDGE <= viewport.width;
  const fitsVertically = h + 2 * EDGE <= viewport.height;
  const maxX = fitsHorizontally ? viewport.width - w - EDGE : viewport.width - 80;
  const maxY = fitsVertically ? viewport.height - h - EDGE : viewport.height - 48;
  return {
    w,
    h,
    x: Math.max(fitsHorizontally ? EDGE : EDGE - w + 80, Math.min(geo.x, maxX)),
    y: Math.max(EDGE, Math.min(geo.y, maxY)),
  };
}

/** Height of the titlebar strip whose buttons must stay hit-testable. */
const TITLEBAR_H = 34;

/**
 * Keep the titlebar out from under the pill nav.
 *
 * The pill is always-on-top (z 13000 against this panel's 12100), so anything of
 * ours beneath it is not merely hidden — `elementFromPoint` returns the pill, so
 * the buttons cannot be clicked at all. A panel restored with its titlebar in
 * the pill's band therefore loses dock, maximize AND close together, leaving no
 * way to re-dock or dismiss it: the same one-way-door bug as docking right with
 * no way back.
 *
 * Vertical nudge only. The pill is a horizontal bar, so clearing it downward
 * always frees the whole titlebar, while shifting sideways would fight the x the
 * user chose and could still overlap. Reads the pill's live rect rather than
 * assuming the top edge — the pill is draggable.
 */
function avoidPillNav(
  geo: PanelGeometry,
  viewport: { width: number; height: number },
): PanelGeometry {
  const pill = document.querySelector("[data-pill-nav]")?.getBoundingClientRect();
  if (!pill || pill.width === 0 || pill.height === 0) return geo;
  const overlapsX = geo.x < pill.right && geo.x + geo.w > pill.left;
  const overlapsY = geo.y < pill.bottom && geo.y + TITLEBAR_H > pill.top;
  if (!overlapsX || !overlapsY) return geo;
  return clampGeometry({ ...geo, y: Math.round(pill.bottom + EDGE) }, viewport);
}

function loadGeometry(scopeKey: string): PanelGeometry | null {
  try {
    const raw = localStorage.getItem(storageKeyFor(scopeKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PanelGeometry>;
    if (
      typeof parsed.x !== "number" ||
      typeof parsed.y !== "number" ||
      typeof parsed.w !== "number" ||
      typeof parsed.h !== "number"
    ) {
      return null;
    }
    return clampGeometry(parsed as PanelGeometry, currentViewport());
  } catch {
    return null;
  }
}

function saveGeometry(scopeKey: string, geo: PanelGeometry) {
  try {
    localStorage.setItem(storageKeyFor(scopeKey), JSON.stringify(geo));
  } catch {
    /* private mode / quota — geometry is a nicety, never block the terminal on it */
  }
}

export function FloatingTerminalShell({
  scopeKey,
  title,
  status,
  onClose,
  children,
}: {
  /** Thread-scoped so each thread remembers where its terminal sat. */
  scopeKey: string;
  title: string;
  /** Real session status — never a decorative value. */
  status?: string | undefined;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [geo, setGeo] = useState<PanelGeometry | null>(null);
  const [maximized, setMaximized] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT,
  );
  const shineColors = usePillNavPreferences((state) => getPillNavShineGradient(state.prefs));
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const resizeRef = useRef<{ dir: ResizeDir; start: PanelGeometry; px: number; py: number } | null>(
    null,
  );

  // Geometry must exist before first paint or the panel flashes at 0,0.
  // Whatever the clamp produces is also written back: if the stored rect is
  // off-screen (window shrunk while the panel was closed, or a rect saved on a
  // bigger monitor) leaving it in localStorage means every future mount starts
  // from an unreachable position and the stored value never agrees with what
  // rendered.
  useLayoutEffect(() => {
    const stored = loadGeometry(scopeKey);
    const next = avoidPillNav(stored ?? defaultGeometry(), currentViewport());
    setGeo(next);
    saveGeometry(scopeKey, next);
  }, [scopeKey]);

  useEffect(() => {
    // `visualViewport` too: on mobile and under pinch-zoom the layout viewport
    // does not change, so a window-resize-only clamp leaves the panel stranded.
    const onResize = () => {
      setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
      setGeo((current) => {
        if (!current) return current;
        const clamped = avoidPillNav(clampGeometry(current, currentViewport()), currentViewport());
        if (
          clamped.x !== current.x ||
          clamped.y !== current.y ||
          clamped.w !== current.w ||
          clamped.h !== current.h
        ) {
          saveGeometry(scopeKey, clamped);
          return clamped;
        }
        return current;
      });
    };
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, [scopeKey]);

  // Deliberately NO global Escape-to-close. This panel hosts a live PTY, and a
  // window-level Escape handler swallowed the key everywhere in the app: vim,
  // less and fzf inside the terminal all closed the panel instead of getting
  // Escape, and pressing Escape in the chat composer nuked the terminal too.
  // Dismissal is the titlebar close button and the terminal toggle shortcut.

  const onPointerMove = useCallback((event: PointerEvent) => {
    const drag = dragRef.current;
    const resize = resizeRef.current;
    if (drag) {
      setGeo((current) =>
        current
          ? clampGeometry(
              { ...current, x: event.clientX - drag.dx, y: event.clientY - drag.dy },
              { width: window.innerWidth, height: window.innerHeight },
            )
          : current,
      );
      return;
    }
    if (!resize) return;
    const { dir, start, px, py } = resize;
    const dx = event.clientX - px;
    const dy = event.clientY - py;
    let { x, y, w, h } = start;
    if (dir.includes("e")) w = start.w + dx;
    if (dir.includes("s")) h = start.h + dy;
    if (dir.includes("w")) {
      w = start.w - dx;
      x = start.x + dx;
    }
    if (dir.includes("n")) {
      h = start.h - dy;
      y = start.y + dy;
    }
    // Clamp before committing the origin, or dragging a west/north edge past the
    // minimum keeps walking the panel across the screen while it stops shrinking.
    if (w < MIN_W) {
      if (dir.includes("w")) x = start.x + (start.w - MIN_W);
      w = MIN_W;
    }
    if (h < MIN_H) {
      if (dir.includes("n")) y = start.y + (start.h - MIN_H);
      h = MIN_H;
    }
    setGeo({ x, y, w, h });
  }, []);

  const endPointer = useCallback(() => {
    const wasActive = dragRef.current !== null || resizeRef.current !== null;
    dragRef.current = null;
    resizeRef.current = null;
    if (wasActive) {
      setGeo((current) => {
        if (current) saveGeometry(scopeKey, current);
        return current;
      });
    }
  }, [scopeKey]);

  useEffect(() => {
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endPointer);
    window.addEventListener("pointercancel", endPointer);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endPointer);
      window.removeEventListener("pointercancel", endPointer);
    };
  }, [endPointer, onPointerMove]);

  if (!geo) return null;

  // Mobile has no room for a floating window — pin it to the safe area.
  const filled = maximized || isMobile;
  const style: React.CSSProperties = filled
    ? { top: EDGE * 2, right: EDGE * 2, bottom: EDGE * 2, left: EDGE * 2 }
    : { top: geo.y, left: geo.x, width: geo.w, height: geo.h };

  return createPortal(
    <div
      data-floating-terminal-panel=""
      {...(status ? { "data-status": status } : {})}
      className="fixed flex flex-col overflow-hidden rounded-xl bg-[#0e0e0e]/85 backdrop-blur-xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_20px_60px_rgba(0,0,0,0.6)]"
      style={{ ...style, zIndex: FLOATING_SURFACE_Z.terminalPanel }}
    >
      {/* shine rim — same gradient + pulse as the floating nav */}
      <style>{`
        @keyframes ft-shine-pulse {
          0%   { background-position: 0% 0%; }
          50%  { background-position: 100% 100%; }
          100% { background-position: 0% 0%; }
        }
      `}</style>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          padding: "1px",
          borderRadius: "inherit",
          backgroundImage: `radial-gradient(transparent, transparent, ${shineColors}, transparent, transparent)`,
          backgroundSize: "300% 300%",
          animation: "ft-shine-pulse 14s linear infinite",
          WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor" as React.CSSProperties["WebkitMaskComposite"],
          mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          maskComposite: "exclude" as unknown as string,
          pointerEvents: "none",
          zIndex: 40,
        }}
      />
      <div
        data-floating-terminal-titlebar=""
        className={cn(
          "flex shrink-0 items-center gap-2 px-3 py-1.5 select-none",
          filled ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        )}
        onPointerDown={(event) => {
          if (filled) return;
          if ((event.target as HTMLElement).closest("button")) return;
          dragRef.current = { dx: event.clientX - geo.x, dy: event.clientY - geo.y };
        }}
        onDoubleClick={() => {
          if (isMobile) return;
          setMaximized((v) => !v);
        }}
      >
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-white/60">
          {title}
        </span>
        {/* Placement lands here, portaled in by the drawer, because dock/float is
            window chrome — the same category as maximize and close — and this row
            already carries the pill's round 32px treatment. The drawer keeps
            ownership of the buttons themselves: switching placement does real
            store handoff (opening/closing the right-panel surface), and lifting
            that up here would fork it. */}
        <div data-terminal-titlebar-slot="" className="flex items-center gap-0.5" />
        {/* Mobile is already pinned to the safe area — a maximize toggle there
            is a control that cannot change anything, so it is not rendered. */}
        {!isMobile && (
          <button
            type="button"
            className={pillIconButtonClass(maximized)}
            title={maximized ? "Restore Terminal Panel" : "Maximize Terminal Panel"}
            aria-label={maximized ? "Restore Terminal Panel" : "Maximize Terminal Panel"}
            aria-pressed={maximized}
            onClick={() => setMaximized((v) => !v)}
          >
            {maximized ? (
              <Maximize4Filled className="size-4" />
            ) : (
              <Maximize3Filled className="size-4" />
            )}
          </button>
        )}
        <button
          type="button"
          className={pillIconButtonClass()}
          title="Close Terminal Panel"
          aria-label="Close Terminal Panel"
          onClick={onClose}
        >
          <CloseCircleFilled className="size-4" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>

      {!filled &&
        RESIZE_HANDLES.map(({ dir, className }) => (
          <div
            key={dir}
            className={cn("absolute z-10", className)}
            onPointerDown={(event) => {
              event.preventDefault();
              resizeRef.current = {
                dir,
                start: geo,
                px: event.clientX,
                py: event.clientY,
              };
            }}
          />
        ))}
    </div>,
    document.body,
  );
}
