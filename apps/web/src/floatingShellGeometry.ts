import { useSyncExternalStore } from "react";

export type FloatingShellEdge = "top" | "bottom" | "left" | "right";

export interface FloatingShellRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface FloatingShellGeometry {
  rect: FloatingShellRect;
  edge: FloatingShellEdge;
  scale: number;
  isMobile: boolean;
  version: number;
}

export interface FloatingShellGeometryInput {
  rect: FloatingShellRect;
  edge: FloatingShellEdge;
  scale: number;
  isMobile: boolean;
}

type GeometryListener = () => void;

const listeners = new Set<GeometryListener>();
let snapshot: FloatingShellGeometry | null = null;
let version = 0;
let framePending = false;
let pendingInput: FloatingShellGeometryInput | null = null;

function sameRect(left: FloatingShellRect, right: FloatingShellRect): boolean {
  return (
    left.top === right.top &&
    left.left === right.left &&
    left.right === right.right &&
    left.bottom === right.bottom &&
    left.width === right.width &&
    left.height === right.height
  );
}

export function getFloatingShellGeometry(): FloatingShellGeometry | null {
  return snapshot;
}

export function subscribeFloatingShellGeometry(listener: GeometryListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishFloatingShellGeometry(
  input: FloatingShellGeometryInput,
): FloatingShellGeometry {
  if (
    snapshot &&
    sameRect(snapshot.rect, input.rect) &&
    snapshot.edge === input.edge &&
    snapshot.scale === input.scale &&
    snapshot.isMobile === input.isMobile
  ) {
    return snapshot;
  }

  const next: FloatingShellGeometry = {
    ...input,
    rect: { ...input.rect },
    version: ++version,
  };
  snapshot = next;
  for (const listener of listeners) listener();
  return next;
}

/**
 * Geometry changes can arrive from a render, a ResizeObserver, and a viewport
 * resize in the same frame. Keep those producers cheap and let the shelf read
 * one settled rectangle per animation frame.
 */
export function scheduleFloatingShellGeometry(input: FloatingShellGeometryInput): void {
  pendingInput = input;
  if (framePending) return;
  framePending = true;

  const flush = () => {
    framePending = false;
    const next = pendingInput;
    pendingInput = null;
    if (next) publishFloatingShellGeometry(next);
  };

  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(flush);
  } else {
    setTimeout(flush, 0);
  }
}

export function clearFloatingShellGeometry(): void {
  pendingInput = null;
  framePending = false;
  if (snapshot === null) return;
  snapshot = null;
  for (const listener of listeners) listener();
}

export function useFloatingShellGeometry(): FloatingShellGeometry | null {
  return useSyncExternalStore(subscribeFloatingShellGeometry, getFloatingShellGeometry, () => null);
}
