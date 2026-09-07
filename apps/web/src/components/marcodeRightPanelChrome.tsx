import {
  Bot,
  ChevronDown,
  FileDiff,
  GitPullRequest,
  Globe2,
  Plus,
  TerminalSquare,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";

import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Kbd } from "~/components/ui/kbd";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuShortcut,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "~/components/ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

/** Reasons shown by the Marcode launcher when an upstream surface is unavailable. */
export const SURFACE_DISABLED_REASONS = {
  browser: "Browser previews are only available in the Marcode desktop app.",
  terminal: "Terminal surfaces are only available from a project thread.",
  diff: "Diff is only available for server threads in Git repositories.",
  pullRequest: "This thread's branch has no pull request yet.",
  agents: "Agents are only available from a thread.",
} as const;

/** Overlays that must win over the launcher's letter shortcuts. */
const LAUNCHER_SHORTCUT_BLOCKING_LAYERS = [
  '[data-slot="dialog-popup"]',
  '[data-slot="alert-dialog-popup"]',
  '[data-slot="command-dialog-popup"]',
  '[data-slot="menu-popup"]',
  '[data-slot="select-popup"]',
  '[data-slot="popover-popup"]',
  '[data-slot="combobox-popup"]',
  '[data-slot="autocomplete-popup"]',
].join(",");

export const SURFACE_UNAVAILABLE_HINTS = {
  browser: "Only available in the desktop app.",
  terminal: "Available when a project is open.",
  diff: "Available for Git repositories.",
  pullRequest: "No pull request on this branch yet.",
  agents: "Available from a thread.",
} as const;

export function shouldOpenDefaultBrowserProfileFromMenuClick(
  pointerType: string | undefined,
): boolean {
  return pointerType !== "touch";
}

type SurfaceShortcutEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "defaultPrevented" | "isComposing" | "key" | "metaKey"
>;

export function surfaceShortcutActionForKey<
  const Action extends { available: boolean; shortcut: string },
>(actions: readonly Action[], event: SurfaceShortcutEvent): Action | null {
  if (event.defaultPrevented || event.isComposing) return null;
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  return (
    actions.find(
      (action) => action.available && action.shortcut.toLowerCase() === event.key.toLowerCase(),
    ) ?? null
  );
}

/** Keep launcher letters from stealing input from an editable surface. */
export function surfaceShortcutTargetsTypingContext(
  target: { closest(selectors: string): unknown } | null,
): boolean {
  return (
    target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !=
    null
  );
}

function DisabledReasonTooltip(props: { reason: string; trigger: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={props.trigger} />
      <TooltipPopup side="top">{props.reason}</TooltipPopup>
    </Tooltip>
  );
}

export function SurfaceMenuItem(props: {
  available: boolean;
  disabledReason?: string;
  shortcut: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const item = (
    <MenuItem
      className={!props.available ? "data-disabled:pointer-events-auto" : undefined}
      onClick={props.onClick}
      disabled={!props.available}
      aria-keyshortcuts={props.shortcut}
    >
      {props.children}
      <MenuShortcut>{props.shortcut}</MenuShortcut>
    </MenuItem>
  );
  if (props.available || !props.disabledReason) return item;
  return <DisabledReasonTooltip reason={props.disabledReason} trigger={item} />;
}

/** Marcode's add-surface menu; upstream owns the tab shelf that mounts it. */
export function MarcodeRightPanelAddMenu(props: {
  surfacesCount: number;
  onAddBrowser: () => void;
  onAddBrowserInProfile: (profileId: string) => void;
  browserProfiles: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  onAddTerminal: () => void;
  onAddDiff: () => void;
  onAddPullRequest: () => void;
  onAddAgents: () => void;
  browserAvailable: boolean;
  terminalAvailable: boolean;
  diffAvailable: boolean;
  pullRequestAvailable: boolean;
  agentsAvailable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const actions = [
    {
      label: "Browser",
      icon: Globe2,
      shortcut: "B",
      available: props.browserAvailable,
      disabledReason: SURFACE_DISABLED_REASONS.browser,
      onClick: props.onAddBrowser,
    },
    {
      label: "Terminal",
      icon: TerminalSquare,
      shortcut: "T",
      available: props.terminalAvailable,
      disabledReason: SURFACE_DISABLED_REASONS.terminal,
      onClick: props.onAddTerminal,
    },
    {
      label: "Diff",
      icon: FileDiff,
      shortcut: "D",
      available: props.diffAvailable,
      disabledReason: SURFACE_DISABLED_REASONS.diff,
      onClick: props.onAddDiff,
    },
    {
      label: "Pull request",
      icon: GitPullRequest,
      shortcut: "P",
      available: props.pullRequestAvailable,
      disabledReason: SURFACE_DISABLED_REASONS.pullRequest,
      onClick: props.onAddPullRequest,
    },
    {
      label: "Agents",
      icon: Bot,
      shortcut: "A",
      available: props.agentsAvailable,
      disabledReason: SURFACE_DISABLED_REASONS.agents,
      onClick: props.onAddAgents,
    },
  ] as const;

  const handleKeyDownCapture = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const action = surfaceShortcutActionForKey(actions, event.nativeEvent);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    action.onClick();
  };

  if (props.surfacesCount === 0) return null;
  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger
        render={
          <Button
            aria-label="Add panel surface"
            className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
            size="icon-xs"
            variant="ghost"
          />
        }
      >
        <Plus className="size-3.5" />
      </MenuTrigger>
      <MenuPopup
        align="start"
        side="bottom"
        sideOffset={6}
        className="min-w-44"
        onKeyDownCapture={handleKeyDownCapture}
      >
        {actions.map((action) => {
          const Icon = action.icon;
          // Browser collapses into one row: clicking the trigger opens the
          // default profile (the common case stays one click), while hover or
          // arrow reveals the profiles. The choice lives at open time because
          // a tab's profile is fixed then — Electron only honours a partition
          // before attach.
          if (action.label === "Browser" && action.available) {
            return (
              <MenuSub key={action.label}>
                <MenuSubTrigger
                  className="[&>svg:last-child]:ms-0"
                  aria-keyshortcuts={action.shortcut}
                  onClick={(event) => {
                    const pointerType =
                      "pointerType" in event.nativeEvent &&
                      typeof event.nativeEvent.pointerType === "string"
                        ? event.nativeEvent.pointerType
                        : undefined;
                    // Touch has no hover path to the profile choices: its
                    // first tap opens the submenu, then a profile is selected.
                    // Mouse click keeps the common default-profile action at
                    // one click.
                    if (!shouldOpenDefaultBrowserProfileFromMenuClick(pointerType)) return;
                    setOpen(false);
                    action.onClick();
                  }}
                >
                  <Icon />
                  {action.label}
                  <MenuShortcut>{action.shortcut}</MenuShortcut>
                </MenuSubTrigger>
                <MenuSubPopup className="min-w-40 max-w-56">
                  {props.browserProfiles.map((profile) => (
                    <MenuItem
                      key={profile.id}
                      onClick={() => props.onAddBrowserInProfile(profile.id)}
                    >
                      <span className="min-w-0 truncate">{profile.name}</span>
                    </MenuItem>
                  ))}
                </MenuSubPopup>
              </MenuSub>
            );
          }
          return (
            <SurfaceMenuItem
              key={action.label}
              available={action.available}
              disabledReason={action.disabledReason}
              shortcut={action.shortcut}
              onClick={action.onClick}
            >
              <Icon />
              {action.label}
            </SurfaceMenuItem>
          );
        })}
      </MenuPopup>
    </Menu>
  );
}

/** Marcode's empty right-panel launcher. Upstream owns the tab shelf around it. */
export function MarcodeRightPanelEmptyState(props: {
  onAddBrowser: () => void;
  onAddBrowserInProfile: (profileId: string) => void;
  browserProfiles: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  onAddTerminal: () => void;
  onAddDiff: () => void;
  onAddPullRequest: () => void;
  onAddAgents: () => void;
  browserAvailable: boolean;
  terminalAvailable: boolean;
  diffAvailable: boolean;
  pullRequestAvailable: boolean;
  agentsAvailable: boolean;
  liveAgentCount: number;
}) {
  const [highlight, setHighlight] = useState(-1);
  const actions = [
    {
      label: "Browser",
      description: "Open a local app or URL.",
      icon: Globe2,
      shortcut: "B",
      available: props.browserAvailable,
      disabledReason: SURFACE_UNAVAILABLE_HINTS.browser,
      onClick: props.onAddBrowser,
      badgeCount: 0,
    },
    {
      label: "Terminal",
      description: "Start a shell in this workspace.",
      icon: TerminalSquare,
      shortcut: "T",
      available: props.terminalAvailable,
      disabledReason: SURFACE_UNAVAILABLE_HINTS.terminal,
      onClick: props.onAddTerminal,
      badgeCount: 0,
    },
    {
      label: "Diff",
      description: "Review changes in this thread.",
      icon: FileDiff,
      shortcut: "D",
      available: props.diffAvailable,
      disabledReason: SURFACE_UNAVAILABLE_HINTS.diff,
      onClick: props.onAddDiff,
      badgeCount: 0,
    },
    {
      label: "Pull Request",
      description: "Open this branch's pull request.",
      icon: GitPullRequest,
      shortcut: "P",
      available: props.pullRequestAvailable,
      disabledReason: SURFACE_UNAVAILABLE_HINTS.pullRequest,
      onClick: props.onAddPullRequest,
      badgeCount: 0,
    },
    {
      label: "Agents",
      description: "Follow subagents and workflows.",
      icon: Bot,
      shortcut: "A",
      available: props.agentsAvailable,
      disabledReason: SURFACE_UNAVAILABLE_HINTS.agents,
      onClick: props.onAddAgents,
      badgeCount: props.liveAgentCount,
    },
  ] as const;
  type SurfaceAction = (typeof actions)[number];

  const availableActions = actions.filter((action) => action.available);
  const highlightIndex =
    availableActions.length === 0 ? -1 : Math.min(highlight, availableActions.length - 1);
  const shortcutActionsRef = useRef(availableActions);
  useEffect(() => {
    shortcutActionsRef.current = availableActions;
  });
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const action = surfaceShortcutActionForKey(shortcutActionsRef.current, event);
      if (!action || document.querySelector(LAUNCHER_SHORTCUT_BLOCKING_LAYERS)) return;
      const target = event.target;
      if (target instanceof Element && surfaceShortcutTargetsTypingContext(target)) return;
      event.preventDefault();
      event.stopPropagation();
      action.onClick();
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, []);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (availableActions.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      setHighlight((highlightIndex + 1) % availableActions.length);
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      setHighlight(
        highlightIndex === -1
          ? availableActions.length - 1
          : (highlightIndex - 1 + availableActions.length) % availableActions.length,
      );
      return;
    }
    if (event.key === "Enter") {
      if (event.target instanceof HTMLElement && event.target.closest("button")) return;
      const action = availableActions[highlightIndex];
      if (!action) return;
      event.preventDefault();
      action.onClick();
    }
  };

  const focusOnMount = useCallback((node: HTMLDivElement | null) => {
    node?.focus();
  }, []);
  const isHighlighted = (action: SurfaceAction) =>
    highlightIndex !== -1 && availableActions[highlightIndex] === action;
  const actionIcon = (action: SurfaceAction, iconClassName = "size-4") => {
    const Icon = action.icon;
    return (
      <span className="relative inline-flex shrink-0">
        <Icon className={iconClassName} />
        {action.badgeCount > 0 ? (
          <span
            aria-hidden
            className="absolute -top-1.5 -right-2 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-info px-1 text-[9px] font-semibold tabular-nums text-white"
          >
            {action.badgeCount}
          </span>
        ) : null}
      </span>
    );
  };
  const cardShellClass =
    "rounded-lg border border-border/80 bg-card dark:border-transparent dark:shadow-none dark:inset-ring-1 dark:inset-ring-white/5";
  const highlightedCardClass = "bg-accent/60 dark:inset-ring-white/20";

  return (
    <div
      ref={focusOnMount}
      role="toolbar"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label="Open a panel"
      data-surface-launcher-keys={availableActions.map((action) => action.shortcut).join("")}
      className={cn(
        "flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 pt-6 outline-none",
        "pb-[calc(var(--workspace-topbar-height)+--spacing(6))]",
      )}
    >
      <div className="relative w-full max-w-lg">
        <div className="absolute inset-x-0 bottom-full mb-5 text-center">
          <h3 className="font-medium text-foreground text-sm">Open a panel</h3>
          <p className="mt-1 text-muted-foreground text-xs">
            Choose what to show in the right panel.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {actions.map((action) =>
            action.available ? (
              <div
                key={action.label}
                className="group relative"
                onMouseEnter={() => setHighlight(availableActions.indexOf(action))}
                onMouseLeave={() =>
                  setHighlight((current) =>
                    current === availableActions.indexOf(action) ? -1 : current,
                  )
                }
              >
                <button
                  type="button"
                  onClick={action.onClick}
                  className={cn(
                    "relative flex h-full w-full cursor-pointer flex-col items-start p-4 text-left transition group-hover:border-border group-hover:bg-accent/60",
                    cardShellClass,
                    isHighlighted(action) && highlightedCardClass,
                  )}
                >
                  <Kbd className="absolute top-3 right-3">{action.shortcut}</Kbd>
                  <span className="flex items-center gap-2 pe-8">
                    {actionIcon(action)}
                    <span className="font-medium text-sm">{action.label}</span>
                  </span>
                  <span className="mt-1.5 text-muted-foreground text-xs leading-relaxed">
                    {action.description}
                  </span>
                </button>
                {action.label === "Browser" && props.browserProfiles.length > 1 ? (
                  <Menu>
                    <MenuTrigger
                      render={
                        <Button
                          aria-label="Open browser in a profile"
                          className="absolute right-3 bottom-3 [--control-icon-color:currentColor]"
                          size="icon-xs"
                          variant="ghost-muted"
                        />
                      }
                    >
                      <ChevronDown className="size-3.5" />
                    </MenuTrigger>
                    <MenuPopup
                      align="end"
                      side="bottom"
                      sideOffset={6}
                      className="min-w-40 max-w-56"
                    >
                      {props.browserProfiles.map((profile) => (
                        <MenuItem
                          key={profile.id}
                          onClick={() => props.onAddBrowserInProfile(profile.id)}
                        >
                          <span className="min-w-0 truncate">{profile.name}</span>
                        </MenuItem>
                      ))}
                    </MenuPopup>
                  </Menu>
                ) : null}
              </div>
            ) : (
              <div
                key={action.label}
                className={cn(
                  "relative flex w-full flex-col items-start p-4 opacity-40",
                  cardShellClass,
                )}
              >
                <Kbd className="absolute top-3 right-3">{action.shortcut}</Kbd>
                <span className="flex items-center gap-2 pe-8">
                  {actionIcon(action)}
                  <span className="font-medium text-sm">{action.label}</span>
                </span>
                <span className="mt-1.5 text-muted-foreground text-xs leading-relaxed">
                  {action.disabledReason}
                </span>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
