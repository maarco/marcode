import { memo } from "react";

import { SidebarFooter, SidebarHeader, SidebarMenu } from "../ui/sidebar";
import { SidebarProviderUpdatePill } from "./SidebarProviderUpdatePill";
import { SidebarUpdateArchitectureWarning, SidebarUpdatePill } from "./SidebarUpdatePill";

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

/**
 * Settings, Pull Requests, Usage, and the page-level Back action live in
 * FloatingPillNav, so the sidebar footer only owns update state. The
 * `SidebarMenu` wrapper is not decoration: upstream's `SidebarUpdatePill`
 * renders a `SidebarMenuItem` (an `<li>`) and needs a list to sit in.
 */
export const SidebarChromeFooter = memo(function SidebarChromeFooter() {
  return (
    <SidebarFooter className="p-[var(--sidebar-content-inset)]">
      <SidebarProviderUpdatePill />
      <SidebarUpdateArchitectureWarning />
      <SidebarMenu className="flex-row items-center">
        <SidebarUpdatePill />
      </SidebarMenu>
    </SidebarFooter>
  );
});
