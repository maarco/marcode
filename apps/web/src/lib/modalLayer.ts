/**
 * True when a mouse event carries no real target because hit-testing was
 * suppressed while it was dispatched.
 *
 * Radix defaults to `modal={true}` and sets `pointer-events: none` on `<body>`
 * while a dropdown/select/dialog is open, so the layer is the only interactive
 * thing on screen. The side effect is that hit-testing finds nothing beneath
 * it: the event's target becomes the document element regardless of what was
 * actually under the pointer — including a trigger inside your own panel.
 *
 * Any hand-rolled "did the user click outside me?" check is unanswerable for
 * such an event and should decline to act rather than guess. Declining costs
 * nothing: the layer dismisses itself on that click, and the next one — with
 * hit-testing restored — reports a real target and dismisses the outer surface
 * normally. Inner-then-outer is what layered dismissal should do anyway.
 *
 * This deliberately inspects the **target** rather than reading
 * `getComputedStyle(document.body).pointerEvents`, which looks like the more
 * direct question but is answered too late to be useful. Radix closes on
 * `pointerdown` and restores `pointer-events` there, while these handlers run
 * on the following `mousedown`, by which time the style is already back to
 * `auto`. The observed sequence for a second click on an open menu's trigger:
 *
 *   pointerdown  target=HTML  body=none  menu open    <- Radix closes here
 *   mousedown    target=HTML  body=auto  menu closed  <- handlers run here
 *
 * The target is the only part of that which survives, because it is resolved
 * once at dispatch and never revised.
 *
 * Without this, clicking a dropdown trigger a second time to close its menu
 * tore down the whole floating editor, and separately cleared the sidebar's
 * thread selection.
 */
export function isHitTestSuppressed(target: EventTarget | null): boolean {
  return target === document.documentElement || target === document.body;
}
