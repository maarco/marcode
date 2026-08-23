import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it } from "vite-plus/test";

import { ChatHeader } from "./ChatHeader";

/**
 * Marcode portals the chat header into `FloatingPillNav`, where it carries the
 * thread title and nothing else — thread actions already have an entry point on
 * the sidebar row's context menu. Upstream keeps growing this header instead:
 * `pingdotgg/t3code@07f8027d` moved a project breadcrumb into it and
 * `@837f6b87` added a title action menu with double-click-to-rename.
 *
 * Every one of those additions conflicts against a header Marcode deliberately
 * kept bare, and resolving in upstream's favour would ship two entry points for
 * the same actions in a surface Marcode does not style. This pins the shape so a
 * sync that reintroduces them fails here instead of shipping them.
 */

function collect(node: ReactNode, out: { text: string[]; props: Array<Record<string, unknown>> }) {
  if (typeof node === "string") {
    out.text.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) collect(child, out);
    return;
  }
  if (!isValidElement(node)) return;
  const props = (node as ReactElement<Record<string, unknown>>).props;
  out.props.push(props);
  for (const value of Object.values(props)) {
    if (isValidElement(value) || Array.isArray(value) || typeof value === "string") {
      collect(value as ReactNode, out);
    }
  }
}

describe("ChatHeader", () => {
  it("renders the thread title alone: no breadcrumb, rename, or action menu", () => {
    // `memo` wraps the render function; `.type` is the component itself.
    const render = (ChatHeader as unknown as { type: (props: unknown) => ReactNode }).type;
    const out: { text: string[]; props: Array<Record<string, unknown>> } = { text: [], props: [] };
    collect(render({ activeThreadTitle: "Fix the flaky test" }), out);

    expect(out.text).toContain("Fix the flaky test");
    for (const props of out.props) {
      expect(props["aria-haspopup"]).toBeUndefined();
      expect(props.onDoubleClick).toBeUndefined();
      expect(props.onContextMenu).toBeUndefined();
      expect(props["data-thread-title-chevron"]).toBeUndefined();
    }
  });
});
