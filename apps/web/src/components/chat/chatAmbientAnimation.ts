export const CHAT_AMBIENT_FRAME_RATE = 30;
export const CHAT_AMBIENT_FRAME_INTERVAL_MS = 1000 / CHAT_AMBIENT_FRAME_RATE;

export function canRunChatAmbientAnimation(input: {
  readonly documentVisible: boolean;
  readonly inViewport: boolean;
  readonly reducedMotion: boolean;
}): boolean {
  return input.documentVisible && input.inViewport && !input.reducedMotion;
}

export function shouldRenderChatAmbientFrame(now: number, lastRenderedAt: number): boolean {
  return (
    lastRenderedAt === Number.NEGATIVE_INFINITY ||
    now - lastRenderedAt >= CHAT_AMBIENT_FRAME_INTERVAL_MS
  );
}

interface StartChatAmbientAnimationOptions {
  readonly element: HTMLElement;
  readonly render: (elapsed: number) => void;
  readonly motionQuery?: MediaQueryList | null;
}

/**
 * Run an ambient renderer only while its canvas is visible, in the foreground,
 * and allowed to animate. Timers pace the work to a predictable 30fps budget;
 * requestAnimationFrame still hands each render to the browser compositor.
 */
export function startChatAmbientAnimation({
  element,
  render,
  motionQuery,
}: StartChatAmbientAnimationOptions): () => void {
  const resolvedMotionQuery =
    motionQuery ?? window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
  let animationFrame: number | null = null;
  let timeoutId: number | null = null;
  let inViewport = true;
  let running = false;
  let lastRenderedAt = Number.NEGATIVE_INFINITY;

  const isReducedMotion = () => resolvedMotionQuery?.matches ?? false;
  const isDocumentVisible = () => document.visibilityState === "visible";
  const canAnimate = () =>
    canRunChatAmbientAnimation({
      documentVisible: isDocumentVisible(),
      inViewport,
      reducedMotion: isReducedMotion(),
    });

  const cancelScheduledWork = () => {
    if (animationFrame !== null) {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const renderAt = (now: number) => {
    lastRenderedAt = now;
    render(now * 0.001);
  };

  const schedule = () => {
    if (!running) return;

    const now = performance.now();
    const delay = Math.max(0, CHAT_AMBIENT_FRAME_INTERVAL_MS - (now - lastRenderedAt));
    timeoutId = window.setTimeout(() => {
      timeoutId = null;
      if (!running || !canAnimate()) return;

      animationFrame = window.requestAnimationFrame((frameTime) => {
        animationFrame = null;
        if (!running || !canAnimate()) return;
        if (shouldRenderChatAmbientFrame(frameTime, lastRenderedAt)) {
          renderAt(frameTime);
        }
        schedule();
      });
    }, delay);
  };

  const stop = () => {
    running = false;
    cancelScheduledWork();
  };

  const resume = () => {
    if (running) return;
    if (isReducedMotion()) {
      cancelScheduledWork();
      render(0);
      return;
    }
    if (!canAnimate()) return;

    running = true;
    renderAt(performance.now());
    schedule();
  };

  const handleVisibilityChange = () => {
    if (isDocumentVisible()) {
      resume();
    } else {
      stop();
    }
  };
  const handleMotionChange = () => {
    if (isReducedMotion()) {
      stop();
      render(0);
    } else {
      resume();
    }
  };
  const handleIntersectionChange = (entries: IntersectionObserverEntry[]) => {
    const nextInViewport = entries[0]?.isIntersecting ?? false;
    if (nextInViewport === inViewport) return;
    inViewport = nextInViewport;
    if (inViewport) {
      resume();
    } else {
      stop();
    }
  };

  const intersectionObserver =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(handleIntersectionChange, { threshold: 0 });
  intersectionObserver?.observe(element);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  if (resolvedMotionQuery) {
    if (typeof resolvedMotionQuery.addEventListener === "function") {
      resolvedMotionQuery.addEventListener("change", handleMotionChange);
    } else {
      resolvedMotionQuery.addListener(handleMotionChange);
    }
  }
  resume();

  return () => {
    stop();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    if (resolvedMotionQuery) {
      if (typeof resolvedMotionQuery.removeEventListener === "function") {
        resolvedMotionQuery.removeEventListener("change", handleMotionChange);
      } else {
        resolvedMotionQuery.removeListener(handleMotionChange);
      }
    }
    intersectionObserver?.disconnect();
  };
}
