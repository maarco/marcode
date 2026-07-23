import { EditorId, type EnvironmentId, type ResolvedKeybindingsConfig } from "@t3tools/contracts";
import { memo, useCallback, useEffect, useMemo, type ComponentType } from "react";
import { isOpenFavoriteEditorShortcut, shortcutLabelForCommand } from "../../keybindings";
import { usePreferredEditor } from "../../editorPreferences";
import { ChevronDownIcon } from "lucide-react";
import { ExportFilled, FolderOpenFilled } from "@aliimam/icons";
import { Button } from "../ui/button";
import { Group, GroupSeparator } from "../ui/group";
import { Menu, MenuItem, MenuPopup, MenuShortcut, MenuTrigger } from "../ui/menu";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { PillTooltip, pillIconButtonClass, pillMenuRowClass } from "../FloatingPillNav";
import {
  AntigravityIcon,
  CursorIcon,
  KiroIcon,
  TraeIcon,
  VisualStudioCode,
  VisualStudioCodeInsiders,
  VSCodium,
  Zed,
} from "../Icons";
import {
  AquaIcon,
  CLionIcon,
  DataGripIcon,
  DataSpellIcon,
  GoLandIcon,
  IntelliJIdeaIcon,
  PhpStormIcon,
  PyCharmIcon,
  RiderIcon,
  RubyMineIcon,
  RustRoverIcon,
  WebStormIcon,
} from "../JetBrainsIcons";
import { cn, isMacPlatform, isWindowsPlatform } from "~/lib/utils";
import { shellEnvironment } from "~/state/shell";
import { useAtomCommand } from "~/state/use-atom-command";

/**
 * Every glyph here is rendered with exactly these two props, and the list mixes
 * hand-drawn brand marks (`Icon`, a bare `SVGProps` component) with `@aliimam`
 * icons (which narrow `strokeWidth` to `number`). Typing the slot by what it is
 * actually called with is what lets both kinds sit in one array.
 */
type OpenInGlyph = ComponentType<{ className?: string; "aria-hidden"?: "true" }>;

type OpenInOption = {
  label: string;
  Icon: OpenInGlyph;
  value: EditorId;
  kind: "brand" | "generic";
};

const resolveOptions = (platform: string, availableEditors: ReadonlyArray<EditorId>) => {
  const baseOptions: ReadonlyArray<OpenInOption> = [
    {
      label: "Cursor",
      Icon: CursorIcon,
      value: "cursor",
      kind: "brand",
    },
    {
      label: "Trae",
      Icon: TraeIcon,
      value: "trae",
      kind: "brand",
    },
    {
      label: "Kiro",
      Icon: KiroIcon,
      value: "kiro",
      kind: "brand",
    },
    {
      label: "VS Code",
      Icon: VisualStudioCode,
      value: "vscode",
      kind: "brand",
    },
    {
      label: "VS Code Insiders",
      Icon: VisualStudioCodeInsiders,
      value: "vscode-insiders",
      kind: "brand",
    },
    {
      label: "VSCodium",
      Icon: VSCodium,
      value: "vscodium",
      kind: "brand",
    },
    {
      label: "Zed",
      Icon: Zed,
      value: "zed",
      kind: "brand",
    },
    {
      label: "Antigravity",
      Icon: AntigravityIcon,
      value: "antigravity",
      kind: "brand",
    },
    {
      label: "IntelliJ IDEA",
      Icon: IntelliJIdeaIcon,
      value: "idea",
      kind: "brand",
    },
    {
      label: "Aqua",
      Icon: AquaIcon,
      value: "aqua",
      kind: "brand",
    },
    {
      label: "CLion",
      Icon: CLionIcon,
      value: "clion",
      kind: "brand",
    },
    {
      label: "DataGrip",
      Icon: DataGripIcon,
      value: "datagrip",
      kind: "brand",
    },
    {
      label: "DataSpell",
      Icon: DataSpellIcon,
      value: "dataspell",
      kind: "brand",
    },
    {
      label: "GoLand",
      Icon: GoLandIcon,
      value: "goland",
      kind: "brand",
    },
    {
      label: "PhpStorm",
      Icon: PhpStormIcon,
      value: "phpstorm",
      kind: "brand",
    },
    {
      label: "PyCharm",
      Icon: PyCharmIcon,
      value: "pycharm",
      kind: "brand",
    },
    {
      label: "Rider",
      Icon: RiderIcon,
      value: "rider",
      kind: "brand",
    },
    {
      label: "RubyMine",
      Icon: RubyMineIcon,
      value: "rubymine",
      kind: "brand",
    },
    {
      label: "RustRover",
      Icon: RustRoverIcon,
      value: "rustrover",
      kind: "brand",
    },
    {
      label: "WebStorm",
      Icon: WebStormIcon,
      value: "webstorm",
      kind: "brand",
    },
    {
      label: isMacPlatform(platform)
        ? "Finder"
        : isWindowsPlatform(platform)
          ? "Explorer"
          : "Files",
      // The pill (and its popover) is @aliimam filled-only; the lucide outline
      // that used to sit here read thinner than every glyph beside it.
      // `FolderOpenFilled`, not `FolderFilled` — that one is the workspace
      // Files panel, and these two must not look like the same action.
      Icon: FolderOpenFilled,
      value: "file-manager",
      kind: "generic",
    },
  ];
  const availableEditorSet = new Set(availableEditors);
  return baseOptions.filter((option) => availableEditorSet.has(option.value));
};

function getOpenInIconClass(kind: OpenInOption["kind"]) {
  return cn(kind === "brand" ? "text-foreground opacity-100" : "text-muted-foreground");
}

export const OpenInPicker = memo(function OpenInPicker({
  environmentId,
  keybindings,
  availableEditors,
  openInCwd,
  compact = false,
  enableShortcut = true,
  flat = false,
}: {
  environmentId: EnvironmentId;
  keybindings: ResolvedKeybindingsConfig;
  availableEditors: ReadonlyArray<EditorId>;
  openInCwd: string | null;
  compact?: boolean;
  enableShortcut?: boolean;
  /** render one direct button per installed editor instead of split button + menu */
  flat?: boolean;
}) {
  const openInEditorMutation = useAtomCommand(shellEnvironment.openInEditor, "open in editor");
  const [preferredEditor, setPreferredEditor] = usePreferredEditor(availableEditors);
  const options = useMemo(
    () => resolveOptions(navigator.platform, availableEditors),
    [availableEditors],
  );
  const primaryOption = options.find(({ value }) => value === preferredEditor) ?? null;

  const openInEditor = useCallback(
    (editorId: EditorId | null) => {
      if (!openInCwd) return;
      const editor = editorId ?? preferredEditor;
      if (!editor) return;
      const result = openInEditorMutation({
        environmentId,
        input: {
          cwd: openInCwd,
          editor,
        },
      });
      setPreferredEditor(editor);
      return result;
    },
    [environmentId, openInCwd, openInEditorMutation, preferredEditor, setPreferredEditor],
  );

  const openFavoriteEditorShortcutLabel = useMemo(
    () => shortcutLabelForCommand(keybindings, "editor.openFavorite"),
    [keybindings],
  );

  useEffect(() => {
    if (!enableShortcut) return;
    const handler = (e: globalThis.KeyboardEvent) => {
      if (!isOpenFavoriteEditorShortcut(e, keybindings)) return;
      if (!openInCwd) return;
      if (!preferredEditor) return;

      e.preventDefault();
      void openInEditorMutation({
        environmentId,
        input: {
          cwd: openInCwd,
          editor: preferredEditor,
        },
      });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    enableShortcut,
    environmentId,
    keybindings,
    openInCwd,
    openInEditorMutation,
    preferredEditor,
  ]);

  // A disabled control has to say why it is disabled, or it reads as a dead
  // button. Both reasons are real states: a thread with no resolved working
  // directory, and a host with no editor the app knows how to launch.
  const openInDisabledReason = !openInCwd
    ? "This thread has no working directory yet."
    : !preferredEditor
      ? "No supported editor was found on this machine."
      : null;

  if (flat) {
    // With no editor installed the card would list nothing, and a disabled button
    // never fires the hover that opens it — so the blocked form is a plain pill
    // carrying the reason in the same tooltip every other pill control uses.
    if (openInDisabledReason !== null) {
      return (
        <PillTooltip
          label={openInDisabledReason}
          render={
            <button
              type="button"
              aria-label="Open in editor"
              aria-disabled="true"
              className={pillIconButtonClass()}
            >
              <ExportFilled aria-hidden="true" className="size-4" />
            </button>
          }
        />
      );
    }
    // Collapsed to a single pill button: click opens the preferred editor, hover
    // reveals a card with every installed editor. Rendering one button per editor
    // blew the pill past the viewport on narrow screens.
    return (
      <Popover>
        <PopoverTrigger
          openOnHover
          render={
            <button
              type="button"
              aria-label="Open in editor"
              className={pillIconButtonClass()}
              onClick={() => openInEditor(preferredEditor)}
            />
          }
        >
          <ExportFilled aria-hidden="true" className="size-4" />
        </PopoverTrigger>
        <PopoverPopup align="center" className="p-1" side="bottom">
          <div aria-label="Open in editor" className="flex min-w-40 flex-col">
            {options.map(({ label, Icon, value, kind }) => (
              <button
                key={value}
                type="button"
                disabled={!openInCwd}
                aria-label={`Open in ${label}`}
                title={openInCwd ? `Open in ${label}` : "This thread has no working directory yet."}
                className={pillMenuRowClass()}
                onClick={() => openInEditor(value)}
              >
                <Icon
                  aria-hidden="true"
                  className={cn("size-4 shrink-0", getOpenInIconClass(kind))}
                />
                <span className="flex-1 truncate">{label}</span>
                {value === preferredEditor && openFavoriteEditorShortcutLabel ? (
                  <span className="text-[10px] text-foreground/40 dark:text-white/40">
                    {openFavoriteEditorShortcutLabel}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </PopoverPopup>
      </Popover>
    );
  }

  return (
    <Group aria-label="Open in editor">
      <Button
        aria-label={compact ? "Open file in preferred editor" : undefined}
        size="xs"
        variant="outline"
        disabled={!preferredEditor || !openInCwd}
        onClick={() => openInEditor(preferredEditor)}
      >
        {primaryOption?.Icon && (
          <primaryOption.Icon
            aria-hidden="true"
            className={cn("size-3.5", getOpenInIconClass(primaryOption.kind))}
          />
        )}
        <span
          className={
            compact
              ? "sr-only"
              : "sr-only @3xl/header-actions:not-sr-only @3xl/header-actions:ml-0.5"
          }
        >
          Open
        </span>
      </Button>
      <GroupSeparator {...(!compact ? { className: "hidden @3xl/header-actions:block" } : {})} />
      <Menu>
        <MenuTrigger
          render={
            <Button
              aria-label={compact ? "Choose editor" : "Copy options"}
              size="icon-xs"
              variant="outline"
            />
          }
        >
          <ChevronDownIcon aria-hidden="true" className="size-4" />
        </MenuTrigger>
        <MenuPopup align="end">
          {options.length === 0 && <MenuItem disabled>No installed editors found</MenuItem>}
          {options.map(({ label, Icon, value, kind }) => (
            <MenuItem key={value} onClick={() => openInEditor(value)}>
              <Icon aria-hidden="true" className={getOpenInIconClass(kind)} />
              {label}
              {value === preferredEditor && openFavoriteEditorShortcutLabel && (
                <MenuShortcut>{openFavoriteEditorShortcutLabel}</MenuShortcut>
              )}
            </MenuItem>
          ))}
        </MenuPopup>
      </Menu>
    </Group>
  );
});
