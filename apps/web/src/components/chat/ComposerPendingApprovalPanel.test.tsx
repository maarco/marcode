import { ApprovalRequestId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ComposerPendingApprovalPanel } from "./ComposerPendingApprovalPanel";

// Marcode retired upstream's compact-row approval panel and keeps the
// card layout (PENDING APPROVAL header + summary + detail block). These
// assertions pin that shape so a future upstream sync cannot silently
// revert Marcode to the compact row.
describe("ComposerPendingApprovalPanel", () => {
  it("renders Marcode's card with the complete detail readable", () => {
    const detail = `bun run release -- ${"x".repeat(500)}\nsecond line`;
    const markup = renderToStaticMarkup(
      <ComposerPendingApprovalPanel
        approval={{
          requestId: ApprovalRequestId.make("approval-1"),
          requestKind: "command",
          createdAt: "2026-07-18T00:00:00.000Z",
          detail,
        }}
        pendingCount={1}
      />,
    );

    expect(markup).toContain("PENDING APPROVAL");
    expect(markup).toContain("Command approval requested");
    expect(markup).toContain('data-approval-detail="complete"');
    expect(markup).toContain('aria-label="Command approval"');
    expect(markup).toContain(detail);
    expect(markup).toContain("max-h-40");
    expect(markup).toContain("overflow-auto");
    expect(markup).toContain("whitespace-pre-wrap");
    expect(markup).not.toContain("truncate");
    expect(markup).not.toContain("line-clamp");
    expect(markup).toContain("min-w-0");
  });

  it("shows a pending-count marker when more than one approval is queued", () => {
    const markup = renderToStaticMarkup(
      <ComposerPendingApprovalPanel
        approval={{
          requestId: ApprovalRequestId.make("approval-1"),
          requestKind: "command",
          createdAt: "2026-07-18T00:00:00.000Z",
          detail: "ls",
        }}
        pendingCount={3}
      />,
    );

    expect(markup).toContain("1/3");
  });

  it("falls back to the approval kind label when the provider sends an empty detail", () => {
    const markup = renderToStaticMarkup(
      <ComposerPendingApprovalPanel
        approval={{
          requestId: ApprovalRequestId.make("approval-2"),
          requestKind: "file-read",
          createdAt: "2026-07-18T00:00:00.000Z",
          detail: "",
        }}
        pendingCount={1}
      />,
    );

    // Outer aria-label carries the fallback so screen readers still name the row.
    expect(markup).toContain('aria-label="File read approval"');
  });
});
