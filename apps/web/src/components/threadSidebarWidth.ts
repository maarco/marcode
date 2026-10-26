export const THREAD_SIDEBAR_WIDTH_STORAGE_KEY = "chat_thread_sidebar_width";
<<<<<<< HEAD
// ── Marcode fork seam ── keep this exported: threadSidebarWidth.test.ts (which
// upstream deleted as trivial) pins Marcode's width contract and imports it.
// The test also asserts the sidebar header carries no brand. Upstream
// un-exported this when they deleted their copy of that test.
export const THREAD_SIDEBAR_DEFAULT_WIDTH = 16 * 16;
export const THREAD_SIDEBAR_MIN_WIDTH = 13 * 16;
=======
const THREAD_SIDEBAR_DEFAULT_WIDTH = 16 * 16;
const THREAD_SIDEBAR_MIN_WIDTH = 13 * 16;
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
export const THREAD_MAIN_CONTENT_MIN_WIDTH = 40 * 16;

export function resolveThreadSidebarMinimumWidth(brandWidth: number): number {
  return Math.max(THREAD_SIDEBAR_MIN_WIDTH, Math.ceil(brandWidth));
}

export function resolveThreadSidebarMaximumWidth(
  viewportWidth: number,
  minimumWidth = THREAD_SIDEBAR_MIN_WIDTH,
): number {
  return Math.max(minimumWidth, Math.floor(viewportWidth) - THREAD_MAIN_CONTENT_MIN_WIDTH);
}

export function clampThreadSidebarWidth(
  width: number,
  minimumWidth: number,
  maximumWidth: number,
): number {
  return Math.min(maximumWidth, Math.max(minimumWidth, width));
}

export function resolveInitialThreadSidebarWidth(
  storedWidth: number | null,
  viewportWidth: number,
): number {
  const preferredWidth =
    storedWidth === null
      ? THREAD_SIDEBAR_DEFAULT_WIDTH
      : Math.max(THREAD_SIDEBAR_MIN_WIDTH, storedWidth);
  return Math.min(preferredWidth, resolveThreadSidebarMaximumWidth(viewportWidth));
}
