import type { ReactElement } from "react";
import { SlidersHorizontalIcon } from "lucide-react";

import { HoverCard, HoverCardPopup, HoverCardTrigger } from "../ui/hover-card";

interface ChatAmbientAppearanceHoverCardProps {
  readonly trigger: ReactElement;
}

export function ChatAmbientAppearanceHoverCard({ trigger }: ChatAmbientAppearanceHoverCardProps) {
  return (
    <HoverCard>
      <HoverCardTrigger closeDelay={120} delay={220} render={trigger} />
      <HoverCardPopup align="center" side="bottom">
        <div className="relative">
          <SlidersHorizontalIcon
            aria-hidden="true"
            className="-right-10 -bottom-10 pointer-events-none absolute size-40 text-cyan-400/10"
          />
          <div className="relative">
            <div className="mb-1.5 flex items-center gap-2">
              <SlidersHorizontalIcon className="size-4 shrink-0 text-cyan-400" />
              <p className="font-bold text-sm tracking-tight">Ambient Styling</p>
            </div>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Tune this chat&apos;s colors, gradient, blur, dimming, and frosted-glass haze.
            </p>
          </div>
        </div>
      </HoverCardPopup>
    </HoverCard>
  );
}
