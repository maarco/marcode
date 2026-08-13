// "" means the stable/GA channel: no stage badge is shown.
export type MobileStageLabel = "" | "Dev" | "Nightly";

export function resolveMobileStageLabel(appVariant: unknown): MobileStageLabel {
  if (appVariant === "development") return "Dev";
  if (appVariant === "preview") return "Nightly";
  return "";
}
