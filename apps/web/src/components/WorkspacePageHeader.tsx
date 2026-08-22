import type { ComponentPropsWithoutRef } from "react";

import { cn } from "../lib/utils";
import {
  COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
  SIDEBARLESS_TITLEBAR_INSET_CLASS,
} from "../workspaceTitlebar";

/** Shared workspace top-bar geometry. */
export function WorkspacePageHeader({
  electron = false,
  reserveNativeControls = electron,
  sidebarless = false,
  className,
  ...props
}: ComponentPropsWithoutRef<"header"> & {
  readonly electron?: boolean;
  readonly reserveNativeControls?: boolean;
  /**
   * ── Marcode fork seam ──
   * Settings and Usage never mount a sidebar, so the collapsed-sidebar inset
   * (which keys off a `data-sidebar-state` ancestor) never matches there and
   * the header slides under the native window controls. These routes take the
   * unconditional inset instead.
   */
  readonly sidebarless?: boolean;
}) {
  return (
    <header
      className={cn(
        "flex h-[var(--workspace-topbar-height)] min-h-[var(--workspace-topbar-height)] shrink-0 items-center gap-3 pl-[calc(env(safe-area-inset-left)+0.75rem)] pr-[calc(env(safe-area-inset-right)+0.75rem)] transition-[padding-left] duration-200 ease-linear motion-reduce:transition-none sm:pl-[calc(env(safe-area-inset-left)+1.25rem)] sm:pr-[calc(env(safe-area-inset-right)+1.25rem)]",
        electron && "drag-region",
        reserveNativeControls && "wco:pr-[var(--workspace-native-controls-inset)]",
        sidebarless ? SIDEBARLESS_TITLEBAR_INSET_CLASS : COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
        className,
      )}
      {...props}
    />
  );
}
