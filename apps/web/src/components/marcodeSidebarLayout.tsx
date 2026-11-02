import { useAtomValue } from "@effect/atom-react";
import { useEffect, type CSSProperties } from "react";

import { resolveShortcutCommand } from "../keybindings";
import { primaryServerKeybindingsAtom } from "../state/server";
import ThreadSidebar from "./Sidebar";
import type { SidebarRouteReveal } from "./sidebar/routeReveal";
import { TOGGLE_SIDEBAR_EVENT } from "./FloatingPillNav";
import {
  THREAD_MAIN_CONTENT_MIN_WIDTH,
  THREAD_SIDEBAR_WIDTH_STORAGE_KEY,
} from "./threadSidebarWidth";
import { Sidebar, SidebarRail, useSidebar } from "./ui/sidebar";

interface MarcodeSidebarShellProps {
  routeReveal: SidebarRouteReveal;
  sidebarMinimumWidth: number;
  sidebarMaximumWidth: number;
  style?: CSSProperties;
  areaProps?: Record<string, unknown>;
  onResize: (width: number) => void;
  onResetWidth: () => void;
}

/** Marcode's floating sidebar mount; upstream owns the sidebar implementation. */
export function MarcodeSidebarShell(props: MarcodeSidebarShellProps) {
  return (
    <Sidebar
      side="left"
      variant="floating"
      collapsible="offcanvas"
      data-app-sidebar=""
      className="text-foreground"
      {...props.areaProps}
      role="navigation"
      aria-label="Threads"
      {...(props.style ? { style: props.style } : {})}
      resizable={{
        maxWidth: props.sidebarMaximumWidth,
        minWidth: props.sidebarMinimumWidth,
        shouldAcceptWidth: ({ currentWidth, nextWidth, wrapper }) =>
          nextWidth <= currentWidth ||
          wrapper.clientWidth - nextWidth >= THREAD_MAIN_CONTENT_MIN_WIDTH,
        storageKey: THREAD_SIDEBAR_WIDTH_STORAGE_KEY,
        onResize: props.onResize,
      }}
    >
      <ThreadSidebar routeReveal={props.routeReveal} />
      <SidebarRail onDoubleClick={props.onResetWidth} />
    </Sidebar>
  );
}

/** The pill nav and keybinding are the visible sidebar controls in Marcode. */
export function MarcodeSidebarControl() {
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const { toggleSidebar } = useSidebar();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("[data-keybinding-capture]")
      ) {
        return;
      }
      if (resolveShortcutCommand(event, keybindings) !== "sidebar.toggle") return;
      event.preventDefault();
      event.stopPropagation();
      toggleSidebar();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [keybindings, toggleSidebar]);

  useEffect(() => {
    const onToggle = () => toggleSidebar();
    window.addEventListener(TOGGLE_SIDEBAR_EVENT, onToggle);
    return () => window.removeEventListener(TOGGLE_SIDEBAR_EVENT, onToggle);
  }, [toggleSidebar]);

  return null;
}
