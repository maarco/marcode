/** Marcode's right-panel compatibility boundary. */

export const MARCODE_RIGHT_PANEL_KINDS = [
  "diff",
  "preview",
  "terminal",
  "pull-request",
  "agents",
] as const;

export type MarcodeRightPanelKind = (typeof MARCODE_RIGHT_PANEL_KINDS)[number];

export const MARCODE_RIGHT_PANEL_STORAGE_KEY = "marcode:right-panel-state:v2";

// v9 removed the upstream plan surface, v10 keyed pull requests by reference,
// and v11 stopped persisting the shared pull-request list panel. Marcode's
// retired file surfaces are handled by the same migration pass.
export const MARCODE_RIGHT_PANEL_STORAGE_VERSION = 11;

export const isPullRequestsPanelKey = (threadKey: string): boolean =>
  threadKey.endsWith(":pull-requests-panel");

export const isRetiredRightPanelSurfaceKind = (kind: unknown): boolean =>
  kind === "file" || kind === "files" || kind === "plan";
