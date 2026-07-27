import { memo } from "react";

import { SidebarFooter, SidebarHeader } from "../ui/sidebar";
import { SidebarProviderUpdatePill } from "./SidebarProviderUpdatePill";
import { SidebarUpdatePill } from "./SidebarUpdatePill";

/**
 * Brand, navigation, settings, and the sidebar toggle live in FloatingPillNav.
 * Electron still needs a bare drag strip so traffic lights do not overlap
 * project content.
 */
export const SidebarChromeHeader = memo(function SidebarChromeHeader({
  isElectron,
}: {
  isElectron: boolean;
}) {
  if (!isElectron) return null;

  return (
    <SidebarHeader className="@container/sidebar-header drag-region relative h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center px-3 py-0 md:px-0" />
  );
});

/** Settings lives in FloatingPillNav; the sidebar footer only owns update state. */
export const SidebarChromeFooter = memo(function SidebarChromeFooter() {
  return (
    <SidebarFooter className="p-2">
      <SidebarProviderUpdatePill />
      <SidebarUpdatePill />
    </SidebarFooter>
  );
});
