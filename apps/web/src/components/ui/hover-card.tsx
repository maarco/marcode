"use client";

import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card";

import {
  PORTAL_OVERLAY_ANCHOR_HIDDEN_CLASS,
  portalOverlayStyle,
} from "~/editor/floating-surface-z";
import { cn } from "~/lib/utils";

/**
 * Rich hover card — a preview surface that opens on hover/focus and can hold
 * layout, not just a line of text. Use `Tooltip` for a bare label.
 *
 * Portals to <body> and carries the shared portal-overlay z-index, so it is
 * never clipped by an `overflow` ancestor nor buried under a floating surface.
 */
const HoverCard = PreviewCardPrimitive.Root;

function HoverCardTrigger(props: PreviewCardPrimitive.Trigger.Props) {
  return <PreviewCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />;
}

function HoverCardPopup({
  children,
  className,
  side = "bottom",
  align = "center",
  sideOffset = 8,
  alignOffset = 0,
  ...props
}: PreviewCardPrimitive.Popup.Props & {
  side?: PreviewCardPrimitive.Positioner.Props["side"];
  align?: PreviewCardPrimitive.Positioner.Props["align"];
  sideOffset?: PreviewCardPrimitive.Positioner.Props["sideOffset"];
  alignOffset?: PreviewCardPrimitive.Positioner.Props["alignOffset"];
}) {
  return (
    <PreviewCardPrimitive.Portal>
      <PreviewCardPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        className={cn(
          "max-w-(--available-width) transition-[top,left,right,bottom,transform] data-instant:transition-none",
          PORTAL_OVERLAY_ANCHOR_HIDDEN_CLASS,
        )}
        data-slot="hover-card-positioner"
        side={side}
        sideOffset={sideOffset}
        style={portalOverlayStyle()}
      >
        <PreviewCardPrimitive.Popup
          className={cn(
            "relative w-80 max-w-(--available-width) origin-(--transform-origin) overflow-hidden rounded-xl border bg-popover not-dark:bg-clip-padding p-4 text-popover-foreground shadow-lg/5 outline-none transition-[scale,opacity] before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-xl)-1px)] before:shadow-[0_1px_--theme(--color-black/4%)] data-ending-style:scale-98 data-starting-style:scale-98 data-ending-style:opacity-0 data-starting-style:opacity-0 dark:before:shadow-[0_-1px_--theme(--color-white/6%)]",
            className,
          )}
          data-slot="hover-card-popup"
          {...props}
        >
          {children}
        </PreviewCardPrimitive.Popup>
      </PreviewCardPrimitive.Positioner>
    </PreviewCardPrimitive.Portal>
  );
}

export { HoverCard, HoverCardTrigger, HoverCardPopup };
