import { useAtomValue } from "@effect/atom-react";
import { useEffect } from "react";

import { resolveShortcutCommand } from "../keybindings";
import { primaryServerKeybindingsAtom } from "../state/server";
import LegacyThreadSidebar from "./LegacySidebar";
import ThreadSidebar from "./Sidebar";
import { TOGGLE_SIDEBAR_EVENT } from "./FloatingPillNav";
import {
  THREAD_MAIN_CONTENT_MIN_WIDTH,
  THREAD_SIDEBAR_MIN_WIDTH,
  THREAD_SIDEBAR_WIDTH_STORAGE_KEY,
} from "./threadSidebarWidth";
import { Sidebar, SidebarRail, useSidebar } from "./ui/sidebar";

interface MarcodeSidebarShellProps {
  isOnSettings: boolean;
  legacySidebarEnabled: boolean;
  sidebarMaximumWidth: number;
  onResize: (width: number) => void;
  onResetWidth: () => void;
}

/** Marcode's floating sidebar mount; upstream owns the sidebar implementation. */
export function MarcodeSidebarShell(props: MarcodeSidebarShellProps) {
  if (props.isOnSettings) return null;
  return (
    <Sidebar
      side="left"
      variant="floating"
      collapsible="offcanvas"
      data-app-sidebar=""
      className="text-foreground"
      resizable={{
        maxWidth: props.sidebarMaximumWidth,
        minWidth: THREAD_SIDEBAR_MIN_WIDTH,
        shouldAcceptWidth: ({ currentWidth, nextWidth, wrapper }) =>
          nextWidth <= currentWidth ||
          wrapper.clientWidth - nextWidth >= THREAD_MAIN_CONTENT_MIN_WIDTH,
        storageKey: THREAD_SIDEBAR_WIDTH_STORAGE_KEY,
        onResize: props.onResize,
      }}
    >
      {props.legacySidebarEnabled ? <LegacyThreadSidebar /> : <ThreadSidebar />}
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
