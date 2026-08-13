export const COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS =
  "[[data-sidebar-state=collapsed]_&]:pl-[var(--workspace-titlebar-content-left)]";

/**
 * For surfaces that never mount a sidebar (settings, usage). The collapsed
 * variant above keys off a `data-sidebar-state` ancestor, so on those routes it
 * never matches and the header slides under the native window controls.
 */
export const SIDEBARLESS_TITLEBAR_INSET_CLASS = "pl-[var(--workspace-titlebar-content-left)]";
