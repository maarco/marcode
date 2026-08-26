import * as Schema from "effect/Schema";
import { CheckIcon, SlidersHorizontalIcon, SparklesIcon } from "lucide-react";
import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";

import { cn } from "~/lib/utils";
import {
  Popover,
  PopoverDescription,
  PopoverPopup,
  PopoverTitle,
  PopoverTrigger,
} from "../ui/popover";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";

export type ChatAmbientTheme = "light" | "dark";

export interface ChatAmbientShaderPalette {
  readonly background: number;
  readonly primary: number;
  readonly secondary: number;
}

export interface ChatAmbientColorPalette {
  readonly label: string;
  readonly swatches: readonly [string, string];
  readonly dark: ChatAmbientShaderPalette;
  readonly light: ChatAmbientShaderPalette;
}

export const CHAT_AMBIENT_COLOR_PALETTES = {
  "violet-cyan": {
    label: "Violet + Cyan",
    swatches: ["#6e61ff", "#45e8ff"],
    dark: { background: 0x070b1c, primary: 0x6e61ff, secondary: 0x45e8ff },
    light: { background: 0xe8ebfa, primary: 0x6b5bd4, secondary: 0x1a9db8 },
  },
  "magenta-cyan": {
    label: "Magenta + Cyan",
    swatches: ["#d83291", "#00d8e8"],
    dark: { background: 0x220011, primary: 0xa41463, secondary: 0x00d8e8 },
    light: { background: 0xf3e8f0, primary: 0xb34b7b, secondary: 0x168aa0 },
  },
  "ember-rose": {
    label: "Ember + Rose",
    swatches: ["#ff744d", "#ffb86b"],
    dark: { background: 0x1c0b0b, primary: 0xff744d, secondary: 0xffb86b },
    light: { background: 0xf9ece6, primary: 0xd85542, secondary: 0xc98238 },
  },
  "emerald-ice": {
    label: "Emerald + Ice",
    swatches: ["#2ee6a6", "#78d8ff"],
    dark: { background: 0x061712, primary: 0x2ee6a6, secondary: 0x78d8ff },
    light: { background: 0xe5f5f0, primary: 0x168c69, secondary: 0x258fb5 },
  },
  "silver-blue": {
    label: "Silver + Blue",
    swatches: ["#b6c8ff", "#8be9fd"],
    dark: { background: 0x0a1322, primary: 0xb6c8ff, secondary: 0x8be9fd },
    light: { background: 0xeaf0fa, primary: 0x6278c7, secondary: 0x338ca5 },
  },
} as const satisfies Record<string, ChatAmbientColorPalette>;

export type ChatAmbientColorPaletteId = keyof typeof CHAT_AMBIENT_COLOR_PALETTES;
export const DEFAULT_CHAT_AMBIENT_COLOR_PALETTE: ChatAmbientColorPaletteId = "violet-cyan";

export type ChatAmbientBlur = "none" | "soft" | "deep";
export type ChatAmbientDim = "none" | "soft" | "deep";

export interface ChatAmbientAppearance {
  readonly palette: ChatAmbientColorPaletteId;
  readonly blur: ChatAmbientBlur;
  readonly dim: ChatAmbientDim;
  readonly frost: boolean;
}

export const DEFAULT_CHAT_AMBIENT_APPEARANCE: ChatAmbientAppearance = {
  palette: DEFAULT_CHAT_AMBIENT_COLOR_PALETTE,
  blur: "none",
  dim: "soft",
  frost: false,
};

export const CHAT_AMBIENT_APPEARANCE_STORAGE_KEY = "marcode:chat-ambient-appearance";
const ChatAmbientAppearanceSchema = Schema.Struct({
  palette: Schema.Literals([
    "violet-cyan",
    "magenta-cyan",
    "ember-rose",
    "emerald-ice",
    "silver-blue",
  ]),
  blur: Schema.Literals(["none", "soft", "deep"]),
  dim: Schema.Literals(["none", "soft", "deep"]),
  frost: Schema.Boolean,
});
export const ChatAmbientAppearanceByThreadKeySchema = Schema.Record(
  Schema.String,
  ChatAmbientAppearanceSchema,
);

export interface ChatAmbientEffectProps {
  readonly theme: ChatAmbientTheme;
  readonly palette: ChatAmbientColorPaletteId;
}

export type ChatAmbientEffectComponent = ComponentType<ChatAmbientEffectProps>;

export interface ChatAmbientEffectPlugin {
  readonly label: string;
  readonly component: LazyExoticComponent<ChatAmbientEffectComponent>;
}

export const CHAT_AMBIENT_EFFECTS_STORAGE_KEY = "marcode:chat-ambient-effects";
export const ChatAmbientEffectsByThreadKeySchema = Schema.Record(Schema.String, Schema.String);

// Plugin seam: each effect owns its own renderer and cleanup lifecycle. Keep
// the registry lazy so adding a shelf of Three.js scenes does not load them on
// the intro route or make ChatView know how any scene works.
export const CHAT_AMBIENT_EFFECT_PLUGINS = {
  "orbital-field": {
    label: "Starfield",
    component: lazy(async () => {
      const module = await import("./ThreeOrbitalField");
      return { default: module.ThreeOrbitalField };
    }),
  },
  "mystic-mist": {
    label: "Mystic Electrifying Mist",
    component: lazy(async () => {
      const module = await import("./ThreeMysticMist");
      return { default: module.ThreeMysticMist };
    }),
  },
  swirl: {
    label: "Swirl",
    component: lazy(async () => {
      const module = await import("./ThreeSwirl");
      return { default: module.ThreeSwirl };
    }),
  },
} as const satisfies Record<string, ChatAmbientEffectPlugin>;

export type ChatAmbientEffectId = keyof typeof CHAT_AMBIENT_EFFECT_PLUGINS;
export const CHAT_AMBIENT_EFFECT_NONE = "none" as const;
export type ChatAmbientEffectSelection = ChatAmbientEffectId | typeof CHAT_AMBIENT_EFFECT_NONE;

export const DEFAULT_CHAT_AMBIENT_EFFECT: ChatAmbientEffectId = "orbital-field";

export function resolveChatAmbientColorPalette(
  value: string | undefined,
): ChatAmbientColorPaletteId {
  if (value !== undefined && Object.hasOwn(CHAT_AMBIENT_COLOR_PALETTES, value)) {
    return value as ChatAmbientColorPaletteId;
  }
  return DEFAULT_CHAT_AMBIENT_COLOR_PALETTE;
}

function isChatAmbientBlur(value: string | undefined): value is ChatAmbientBlur {
  return value === "none" || value === "soft" || value === "deep";
}

function isChatAmbientDim(value: string | undefined): value is ChatAmbientDim {
  return value === "none" || value === "soft" || value === "deep";
}

export function resolveChatAmbientAppearance(
  value:
    | Partial<{
        readonly palette: string;
        readonly blur: string;
        readonly dim: string;
        readonly frost: boolean;
      }>
    | undefined,
): ChatAmbientAppearance {
  return {
    palette: resolveChatAmbientColorPalette(value?.palette),
    blur: isChatAmbientBlur(value?.blur) ? value.blur : DEFAULT_CHAT_AMBIENT_APPEARANCE.blur,
    dim: isChatAmbientDim(value?.dim) ? value.dim : DEFAULT_CHAT_AMBIENT_APPEARANCE.dim,
    frost: value?.frost === true,
  };
}

export function resolveChatAmbientEffect(value: string | undefined): ChatAmbientEffectSelection {
  if (value === CHAT_AMBIENT_EFFECT_NONE) return CHAT_AMBIENT_EFFECT_NONE;
  if (value !== undefined && Object.hasOwn(CHAT_AMBIENT_EFFECT_PLUGINS, value)) {
    return value as ChatAmbientEffectId;
  }
  return DEFAULT_CHAT_AMBIENT_EFFECT;
}

const chatAmbientEffectOptions: ReadonlyArray<{
  readonly id: ChatAmbientEffectSelection;
  readonly label: string;
}> = [
  { id: CHAT_AMBIENT_EFFECT_NONE, label: "Off" },
  ...(Object.keys(CHAT_AMBIENT_EFFECT_PLUGINS) as Array<ChatAmbientEffectId>).map((id) => ({
    id,
    label: CHAT_AMBIENT_EFFECT_PLUGINS[id].label,
  })),
];

const chatAmbientPaletteOptions = Object.keys(CHAT_AMBIENT_COLOR_PALETTES).map((id) => ({
  id: id as ChatAmbientColorPaletteId,
  ...CHAT_AMBIENT_COLOR_PALETTES[id as ChatAmbientColorPaletteId],
}));

const chatAmbientBlurOptions: ReadonlyArray<{
  readonly id: ChatAmbientBlur;
  readonly label: string;
}> = [
  { id: "none", label: "Clear" },
  { id: "soft", label: "Soft blur" },
  { id: "deep", label: "Deep blur" },
];

const chatAmbientDimOptions: ReadonlyArray<{
  readonly id: ChatAmbientDim;
  readonly label: string;
}> = [
  { id: "none", label: "Full glow" },
  { id: "soft", label: "Soft dim" },
  { id: "deep", label: "Deep dim" },
];

interface ChatAmbientEffectPickerProps {
  readonly value: ChatAmbientEffectSelection;
  readonly onValueChange: (value: ChatAmbientEffectSelection) => void;
}

export function ChatAmbientEffectPicker({ value, onValueChange }: ChatAmbientEffectPickerProps) {
  const selectedLabel =
    chatAmbientEffectOptions.find((option) => option.id === value)?.label ?? "Ambient";

  return (
    <Select
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue === null) return;
        onValueChange(resolveChatAmbientEffect(nextValue));
      }}
    >
      <SelectTrigger
        aria-label="Chat ambient effect"
        className="max-w-40 min-w-0 px-1.5 text-xs"
        data-chat-ambient-effect-picker
        size="xs"
        variant="ghost"
      >
        <SparklesIcon className="size-3.5 shrink-0" />
        <SelectValue>{selectedLabel}</SelectValue>
      </SelectTrigger>
      <SelectPopup align="end" alignItemWithTrigger={false} matchTriggerWidth={false}>
        {chatAmbientEffectOptions.map((option) => (
          <SelectItem key={option.id} value={option.id} hideIndicator className="min-w-36">
            {option.label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}

interface ChatAmbientAppearancePickerProps {
  readonly value: ChatAmbientAppearance;
  readonly onValueChange: (value: ChatAmbientAppearance) => void;
}

function ChatAmbientAppearanceSelect({
  label,
  options,
  value,
  onValueChange,
}: {
  readonly label: string;
  readonly options: ReadonlyArray<{ readonly id: string; readonly label: string }>;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium text-foreground/80">{label}</span>
      <Select
        value={value}
        onValueChange={(nextValue) => nextValue !== null && onValueChange(nextValue)}
      >
        <SelectTrigger aria-label={label} className="w-32" size="xs">
          <SelectValue>{options.find((option) => option.id === value)?.label}</SelectValue>
        </SelectTrigger>
        <SelectPopup align="end" matchTriggerWidth={false}>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id} hideIndicator>
              {option.label}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
    </div>
  );
}

export function ChatAmbientAppearancePicker({
  value,
  onValueChange,
}: ChatAmbientAppearancePickerProps) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Customize chat ambient appearance"
            className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-secondary-label outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            data-chat-ambient-appearance-picker
          />
        }
      >
        <SlidersHorizontalIcon className="size-3.5" />
      </PopoverTrigger>
      <PopoverPopup align="end" className="w-72">
        <div className="space-y-4">
          <div>
            <PopoverTitle className="text-sm">Ambient styling</PopoverTitle>
            <PopoverDescription className="mt-1 text-xs">
              Saved separately for this chat on this browser.
            </PopoverDescription>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-medium text-foreground/80">Primary colors</span>
            <div className="grid grid-cols-5 gap-2">
              {chatAmbientPaletteOptions.map((palette) => {
                const selected = palette.id === value.palette;
                return (
                  <button
                    key={palette.id}
                    type="button"
                    aria-label={`Use ${palette.label} primary colors`}
                    aria-pressed={selected}
                    className={cn(
                      "relative flex h-8 cursor-pointer items-center justify-center rounded-md border border-border/70 outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring",
                      selected &&
                        "border-ring ring-2 ring-ring/60 ring-offset-1 ring-offset-popover",
                    )}
                    data-chat-ambient-palette={palette.id}
                    style={{
                      background: `linear-gradient(135deg, ${palette.swatches[0]}, ${palette.swatches[1]})`,
                    }}
                    title={palette.label}
                    onClick={() => onValueChange({ ...value, palette: palette.id })}
                  >
                    {selected ? <CheckIcon className="size-3.5 text-white drop-shadow" /> : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
            <ChatAmbientAppearanceSelect
              label="Blur"
              options={chatAmbientBlurOptions}
              value={value.blur}
              onValueChange={(blur) => {
                if (isChatAmbientBlur(blur)) onValueChange({ ...value, blur });
              }}
            />
            <ChatAmbientAppearanceSelect
              label="Dim"
              options={chatAmbientDimOptions}
              value={value.dim}
              onValueChange={(dim) => {
                if (isChatAmbientDim(dim)) onValueChange({ ...value, dim });
              }}
            />
            <label className="flex items-center justify-between gap-3 text-xs font-medium text-foreground/80">
              <span>
                Frost
                <span className="mt-0.5 block text-[0.6875rem] font-normal text-muted-foreground">
                  Glassy haze over the scene
                </span>
              </span>
              <Switch
                aria-label="Add frosted glass haze"
                checked={value.frost}
                onCheckedChange={(frost) => onValueChange({ ...value, frost: Boolean(frost) })}
              />
            </label>
          </div>
        </div>
      </PopoverPopup>
    </Popover>
  );
}

interface ChatAmbientBackgroundProps {
  readonly effect?: ChatAmbientEffectSelection;
  readonly appearance?: ChatAmbientAppearance;
  readonly theme: ChatAmbientTheme;
  readonly className?: string;
}

export function ChatAmbientBackground({
  effect = DEFAULT_CHAT_AMBIENT_EFFECT,
  appearance,
  theme,
  className,
}: ChatAmbientBackgroundProps) {
  const resolvedAppearance = resolveChatAmbientAppearance(appearance);
  const plugin = effect === CHAT_AMBIENT_EFFECT_NONE ? null : CHAT_AMBIENT_EFFECT_PLUGINS[effect];
  const Effect = plugin?.component;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "chat-ambient-background pointer-events-none absolute inset-0 z-0 overflow-hidden",
        className,
      )}
      data-chat-ambient-background
      data-chat-ambient-effect={effect}
      data-chat-ambient-palette={resolvedAppearance.palette}
      data-chat-ambient-blur={resolvedAppearance.blur}
      data-chat-ambient-dim={resolvedAppearance.dim}
      data-chat-ambient-frost={resolvedAppearance.frost ? "true" : "false"}
    >
      {Effect ? (
        <Suspense fallback={<div className="absolute inset-0" data-chat-ambient-fallback />}>
          <Effect palette={resolvedAppearance.palette} theme={theme} />
        </Suspense>
      ) : null}
    </div>
  );
}
