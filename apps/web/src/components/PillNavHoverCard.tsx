import {
  ActivityFilled,
  AddFilled,
  ArrangeSquareFilled,
  BoxFilled,
  ClockFilled,
  Code1Filled,
  CodeFilled,
  DocumentTextFilled,
  Element3Filled,
  Export3Filled,
  FolderFilled,
  GlobalFilled,
  Hierarchy2Filled,
  KeySquareFilled,
  LayerFilled,
  LinkFilled,
  LockFilled,
  MessageCircleFilled,
  RecordCircleFilled,
  Setting2Filled,
  Setting5Filled,
  SidebarLeftFilled,
} from "@aliimam/icons";
import type { ComponentType, CSSProperties, ReactElement } from "react";

import { MarcodeMark } from "./MarcodeMark";
import { HoverCard, HoverCardPopup, HoverCardTrigger } from "./ui/hover-card";
import { Kbd } from "./ui/kbd";

type IconComponent = ComponentType<{ className?: string; style?: CSSProperties }>;

export interface PillNavMeta {
  title: string;
  description: string;
  icon: IconComponent;
  color: string;
}

// Category colours, kept in step with `CATEGORIES` in FloatingPillNav.
const HOME_COLOR = "#f59e0b";
const SETTINGS_COLOR = "#a0927b";
// Exported so live/dynamic cards built outside this file (e.g. the git quick
// action's title/icon override in GitActionsControl) stay the same accent as
// the fixed workspace entries below, instead of a second hardcoded hex.
export const WORKSPACE_COLOR = "#22d3ee";
const UTILITY_COLOR = "#a1a1aa";

/**
 * Rich hover-card copy for every pill entry. Keys are the route href where one
 * exists and a stable `action:`-style key where the entry is a button, so an
 * entry keeps its card even when its label or target path changes.
 *
 * Icons must match the glyph the pill itself renders, and must be the pack's
 * `*Filled` variant — the pill is filled-only. The one exception is the home
 * entry, which carries the brand mark (`MarcodeMark`) rather than a pack icon.
 */
export const PILL_NAV_META = {
  "/": {
    title: "marcode",
    description:
      "Home. Opens a fresh draft thread in the project you touched last, or asks you to add one if there are none yet.",
    icon: MarcodeMark,
    color: HOME_COLOR,
  },
  "/connect": {
    title: "Connect",
    description:
      "Authorize the CLI. Signs you in, then hands back a one-time code to paste into the terminal that asked for it.",
    icon: KeySquareFilled,
    color: HOME_COLOR,
  },
  "/settings": {
    title: "Settings",
    description:
      "Everything configurable in one place — appearance, agent providers, environments, source control, keybindings and diagnostics.",
    icon: Setting2Filled,
    color: SETTINGS_COLOR,
  },
  "/settings/general": {
    title: "General",
    description:
      "Appearance and defaults. Theme, timestamp format, word wrapping, thread and worktree defaults, confirmations, and the update track.",
    icon: Setting5Filled,
    color: SETTINGS_COLOR,
  },
  "/settings/providers": {
    title: "Providers",
    description:
      "The coding agents this app can run — Claude, Codex, Cursor, Grok, OpenCode. Add instances, pick models, and check versions.",
    icon: MessageCircleFilled,
    color: SETTINGS_COLOR,
  },
  "/settings/connections": {
    title: "Connections",
    description:
      "Environments this app can reach. Pair devices, add remote, SSH and WSL backends, control network exposure, and revoke clients.",
    icon: LinkFilled,
    color: SETTINGS_COLOR,
  },
  "/settings/source-control": {
    title: "Source Control",
    description:
      "Git plumbing and hosting accounts. Sign in to GitHub, GitLab, Bitbucket or Azure DevOps, and tune the automatic fetch interval.",
    icon: BoxFilled,
    color: SETTINGS_COLOR,
  },
  "/settings/keybindings": {
    title: "Keybindings",
    description:
      "Every command's shortcut. Search and rebind them, add when-conditions, spot conflicts, or open the raw keybindings file.",
    icon: DocumentTextFilled,
    color: SETTINGS_COLOR,
  },
  "/settings/diagnostics": {
    title: "Diagnostics",
    description:
      "Runtime health. Trace and metric exporters, the live process list, resource history, and a jump to the log directory.",
    icon: ActivityFilled,
    color: SETTINGS_COLOR,
  },
  "/settings/archived": {
    title: "Archived Chats",
    description:
      "Threads you have archived. Search them, restore one back into its project, or delete it permanently.",
    icon: ClockFilled,
    color: SETTINGS_COLOR,
  },
  workspace: {
    title: "Workspace",
    description:
      "The thread's side panel. Toggle it to work in Browser, Terminal, Files or Diff alongside the conversation.",
    icon: LayerFilled,
    color: WORKSPACE_COLOR,
  },
  "workspace:back": {
    title: "Back to Workspace",
    description: "Return to the thread you were last working in.",
    icon: LayerFilled,
    color: WORKSPACE_COLOR,
  },
  "workspace:threads": {
    title: "Threads",
    description:
      "The thread sidebar. Projects grouped by environment, recent threads under each, and a shortcut to start a new one.",
    icon: SidebarLeftFilled,
    color: WORKSPACE_COLOR,
  },
  "workspace:terminal": {
    title: "Terminal",
    description:
      "A real shell in the thread's workspace. Several sessions per thread, split panes, and clickable links in the output.",
    icon: Code1Filled,
    color: WORKSPACE_COLOR,
  },
  "workspace:diff": {
    title: "Diff",
    description:
      "The thread's code changes, file by file. Switch between the whole branch range and just the unstaged working tree.",
    icon: ArrangeSquareFilled,
    color: WORKSPACE_COLOR,
  },
  "workspace:files": {
    title: "Files",
    description:
      "The workspace file tree. Browse the project a thread is working in and open files without leaving the conversation.",
    icon: FolderFilled,
    color: WORKSPACE_COLOR,
  },
  "workspace:browser": {
    title: "Browser",
    description:
      "An in-app web preview, desktop runtime only. Point it at a dev server and watch your changes land as you work.",
    icon: GlobalFilled,
    color: WORKSPACE_COLOR,
  },
  search: {
    title: "Search",
    description:
      "The command palette. Jump to a thread, project or setting, switch environment, or open a file — all from the keyboard.",
    icon: Element3Filled,
    color: UTILITY_COLOR,
  },
  "code-editor": {
    title: "Code Editor",
    description:
      "A floating editor over the app. Explorer, search, source control and split panes, without leaving the thread.",
    icon: CodeFilled,
    color: WORKSPACE_COLOR,
  },
  // Thread action cluster — portaled into the row by ChatView. Pills with a fixed
  // meaning live here. The ones left out keep plain tooltips because their label
  // *is* the information: a script pill is named after the user's script, and a
  // git action pill flips between "Commit" and the reason it is blocked.
  "thread:add-action": {
    title: "Add Action",
    description:
      "Project scripts as one-click pills. Save a command you run often — build, test, lint — and it joins this row for every thread in the project.",
    icon: AddFilled,
    color: WORKSPACE_COLOR,
  },
  "thread:git-init": {
    title: "Initialize Git",
    description:
      "This project has no repository yet. Runs git init in the project folder so the thread can stage, commit and diff its changes.",
    icon: Hierarchy2Filled,
    color: WORKSPACE_COLOR,
  },
  // Git action pills. Only the two whose label and glyph are fixed live here —
  // the PR and publish pills take their name and icon from the repo's provider
  // ("pull request" on GitHub, "merge request" on GitLab), so a static card
  // would contradict the button next to it. Blocked reasons ride `status`.
  "git:commit": {
    title: "Commit",
    description:
      "Stage and commit this thread's working-tree changes. Opens the commit dialog with a message drafted from what changed.",
    icon: RecordCircleFilled,
    color: WORKSPACE_COLOR,
  },
  "git:push": {
    title: "Push",
    description:
      "Send committed work to the remote. Pushes the thread's branch to its upstream, setting one on first push.",
    icon: Export3Filled,
    color: WORKSPACE_COLOR,
  },
  // The grip. Its three gestures are otherwise undiscoverable, which is exactly
  // what a card is for — a one-line tooltip could only name one of them.
  "pill:lock": {
    title: "Lock Position",
    description:
      "The pill's handle. Drag it to move the pill, scroll it to resize, click to lock it in place — locked, it stays put and ignores dragging.",
    icon: LockFilled,
    color: UTILITY_COLOR,
  },
} as const satisfies Record<string, PillNavMeta>;

export type PillNavMetaKey = keyof typeof PILL_NAV_META;

export function hasPillNavMeta(key: string | null | undefined): key is PillNavMetaKey {
  return typeof key === "string" && key in PILL_NAV_META;
}

/** Icon + title + description, over a big faded watermark of the same glyph. */
function PillNavCard({
  meta,
  shortcut,
  status,
}: {
  meta: PillNavMeta;
  shortcut?: string | null | undefined;
  status?: string | null | undefined;
}) {
  const Icon = meta.icon;
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="-right-10 -bottom-10 pointer-events-none absolute"
        style={{ color: meta.color, opacity: 0.1 }}
      >
        <Icon className="h-40 w-40" />
      </div>
      <div className="relative">
        <div className="mb-1.5 flex items-center gap-2">
          <Icon className="h-4 w-4 shrink-0" style={{ color: meta.color }} />
          <p className="font-bold text-sm tracking-tight">{meta.title}</p>
          {shortcut ? <Kbd className="ml-auto shrink-0">{shortcut}</Kbd> : null}
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">{meta.description}</p>
        {/* Why the control is currently blocked. Without this a card would be a
            downgrade from the tooltip it replaced, which carried the reason. */}
        {status ? (
          <p className="mt-2 border-border/60 border-t pt-2 text-[11px] text-muted-foreground/80 leading-relaxed">
            {status}
          </p>
        ) : null}
      </div>
    </div>
  );
}

interface PillNavHoverCardSharedProps {
  shortcut?: string | null | undefined;
  side?: "top" | "bottom" | "left" | "right" | undefined;
  /** Live reason the control is blocked, appended under the description. */
  status?: string | null | undefined;
  render: ReactElement;
}

type PillNavHoverCardProps =
  | (PillNavHoverCardSharedProps & { metaKey: PillNavMetaKey; meta?: undefined })
  | (PillNavHoverCardSharedProps & {
      metaKey?: undefined;
      /**
       * Direct title/description/icon/color, for a pill whose label and glyph are
       * live rather than fixed (e.g. the git quick-action pill, which rotates
       * through Commit / Commit & push / Push / Pull / Publish / View PR). Takes
       * precedence over `metaKey` — pass one or the other, never both.
       */
      meta: PillNavMeta;
    });

/**
 * Wraps a pill control in its hover card. `render` is the control itself — the
 * card's trigger props are merged onto it rather than into an extra wrapper
 * element, so the pill's flex layout is untouched.
 *
 * `side` defaults to "bottom" to match `PillTooltip`: controls portaled into the
 * row (the thread action cluster) cannot see the pill's resolved overlay side,
 * and Base UI flips the popup itself when that edge has no room.
 */
export function PillNavHoverCard(props: PillNavHoverCardProps) {
  const { shortcut, side = "bottom", status, render } = props;
  const meta = props.meta ?? PILL_NAV_META[props.metaKey];
  return (
    <HoverCard>
      <HoverCardTrigger closeDelay={120} delay={220} render={render} />
      <HoverCardPopup align="center" side={side}>
        <PillNavCard meta={meta} shortcut={shortcut} status={status} />
      </HoverCardPopup>
    </HoverCard>
  );
}
