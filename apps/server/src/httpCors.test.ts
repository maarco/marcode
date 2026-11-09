import { assert, it } from "@effect/vitest";

import { DESKTOP_RENDERER_ORIGINS } from "./httpCors.ts";

it("allows the origins the Marcode desktop app actually registers", () => {
  // ElectronProtocol.ts registers marcode / marcode-dev; the t3code origins are legacy builds.
  assert.include(DESKTOP_RENDERER_ORIGINS, "marcode://app");
  assert.include(DESKTOP_RENDERER_ORIGINS, "marcode-dev://app");
});
