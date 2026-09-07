// @effect-diagnostics nodeBuiltinImport:off - Fork-boundary assertions read checked-in files directly.
/**
 * Pins the fork seam that keeps Marcode's first-run flow on a true-black
 * canvas.
 *
 * Upstream removed the onboarding theme surface entirely in `f729e8fd` (the
 * shared multi-computer wizard): `mountOnboardingTheme`, the mounts in
 * `FirstRunGate`/`WelcomeWizard`, the `html[data-onboarding-surface]` palette,
 * and the contrast probe. Every one of those removals merged without a single
 * conflict marker — the exact class of break a conflict never reports, which
 * would have silently handed the wizard back to the saved light/dark
 * preference.
 *
 * If you are here because this test failed after an upstream sync: the seam
 * moved or was dropped. Re-mount the onboarding theme in the new structure
 * rather than deleting these assertions. If Marcode ever decides the wizard
 * should follow the saved appearance, delete this file in that same change so
 * the decision is recorded, not inferred.
 */
import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import themeSource from "../../hooks/useTheme.ts?raw";
import firstRunGateSource from "./FirstRunGate.tsx?raw";
import welcomeWizardSource from "./WelcomeWizard.tsx?raw";

// `?raw` on a stylesheet returns "" under the CSS pipeline, so read the file.
const indexCss = NodeFS.readFileSync(
  NodeURL.fileURLToPath(new URL("../../index.css", import.meta.url)),
  "utf8",
);

describe("dark onboarding fork seam", () => {
  it("still exports the theme owner upstream deleted", () => {
    expect(themeSource).toContain("export function mountOnboardingTheme");
    // The wizard is dark unconditionally: no saved-appearance branch.
    expect(themeSource).toContain('applyThemePalette("dark", "dark")');
    expect(themeSource).toContain('root.dataset.onboardingSurface = ""');
  });

  it("mounts the theme from the gate and the wizard", () => {
    for (const source of [firstRunGateSource, welcomeWizardSource]) {
      expect(source).toContain('mountOnboardingTheme } from "../../hooks/useTheme"');
      expect(source).toContain("mountOnboardingTheme()");
    }
  });

  it("keeps the document-wide onboarding palette", () => {
    expect(indexCss).toContain("html[data-onboarding-surface]:root");
    // Portaled menus and tooltips read their contrast tokens from this subtree.
    expect(indexCss).toContain("[data-onboarding-surface] {");
  });

  it("marks each seam so the next merge conflict is obvious", () => {
    for (const source of [themeSource, firstRunGateSource, welcomeWizardSource, indexCss]) {
      expect(source).toContain("Marcode fork seam");
    }
  });

  it("renders the Marcode brand glyph in the wizard header", () => {
    // The matching removal — that upstream's wordmark component is gone from
    // every source root — is owned by scripts/brand-mark-ownership.test.ts.
    expect(welcomeWizardSource).toContain('from "../MarcodeMark"');
    expect(welcomeWizardSource).toContain("<MarcodeMark");
  });
});
