<<<<<<< HEAD
// "" means the stable/GA channel: no stage badge is shown.
export type MobileStageLabel = "" | "Dev" | "Nightly";
=======
export type MobileStageLabel = "Beta" | "Dev" | "Nightly";
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7

export function resolveMobileStageLabel(appVariant: unknown): MobileStageLabel {
  if (appVariant === "development") return "Dev";
  if (appVariant === "preview") return "Nightly";
<<<<<<< HEAD
  return "";
=======
  return "Beta";
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
}
