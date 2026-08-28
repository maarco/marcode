import * as Schema from "effect/Schema";
import { CheckIcon, OrbitIcon, SlidersHorizontalIcon } from "lucide-react";
import {
  lazy,
  Suspense,
  type ComponentType,
  type CSSProperties,
  type LazyExoticComponent,
  useMemo,
} from "react";

import { FLOATING_SURFACE_Z } from "~/editor/floating-surface-z";
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

export interface ChatAmbientCustomColors {
  readonly background: string;
  readonly primary: string;
  readonly secondary: string;
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

export const CHAT_AMBIENT_CUSTOM_PALETTE = "custom" as const;
export type ChatAmbientColorPaletteId =
  | keyof typeof CHAT_AMBIENT_COLOR_PALETTES
  | typeof CHAT_AMBIENT_CUSTOM_PALETTE;
export const DEFAULT_CHAT_AMBIENT_COLOR_PALETTE: ChatAmbientColorPaletteId = "violet-cyan";
export const DEFAULT_CHAT_AMBIENT_CUSTOM_COLORS: ChatAmbientCustomColors = {
  background: "#070b1c",
  primary: "#6e61ff",
  secondary: "#45e8ff",
};

export type ChatAmbientBlur = "none" | "soft" | "deep";
export type ChatAmbientDim = "none" | "soft" | "deep";
export type ChatAmbientGradient = "radial" | "linear" | "conic";

export interface ChatAmbientAppearance {
  readonly palette: ChatAmbientColorPaletteId;
  readonly customColors: ChatAmbientCustomColors;
  readonly gradient: ChatAmbientGradient;
  readonly blur: ChatAmbientBlur;
  readonly dim: ChatAmbientDim;
  readonly frost: boolean;
}

export const DEFAULT_CHAT_AMBIENT_APPEARANCE: ChatAmbientAppearance = {
  palette: DEFAULT_CHAT_AMBIENT_COLOR_PALETTE,
  customColors: DEFAULT_CHAT_AMBIENT_CUSTOM_COLORS,
  gradient: "radial",
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
    "custom",
  ]),
  customColors: Schema.optional(
    Schema.Struct({
      background: Schema.String,
      primary: Schema.String,
      secondary: Schema.String,
    }),
  ),
  gradient: Schema.optional(Schema.Literals(["radial", "linear", "conic"])),
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
  readonly appearance: ChatAmbientAppearance;
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
  if (value === CHAT_AMBIENT_CUSTOM_PALETTE) return CHAT_AMBIENT_CUSTOM_PALETTE;
  if (value !== undefined && Object.hasOwn(CHAT_AMBIENT_COLOR_PALETTES, value)) {
    return value as ChatAmbientColorPaletteId;
  }
  return DEFAULT_CHAT_AMBIENT_COLOR_PALETTE;
}

function isChatAmbientGradient(value: string | undefined): value is ChatAmbientGradient {
  return value === "radial" || value === "linear" || value === "conic";
}

function isChatAmbientBlur(value: string | undefined): value is ChatAmbientBlur {
  return value === "none" || value === "soft" || value === "deep";
}

function isChatAmbientDim(value: string | undefined): value is ChatAmbientDim {
  return value === "none" || value === "soft" || value === "deep";
}

function normalizeChatAmbientColor(value: string | undefined, fallback: string): string {
  return value && /^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
}

function hexToNumber(value: string): number {
  return Number.parseInt(value.slice(1), 16);
}

function numberToHex(value: number): string {
  return `#${value.toString(16).padStart(6, "0")}`;
}

export function resolveChatAmbientAppearance(
  value:
    | {
        readonly palette?: string | undefined;
        readonly customColors?: Partial<ChatAmbientCustomColors> | undefined;
        readonly gradient?: string | undefined;
        readonly blur?: string | undefined;
        readonly dim?: string | undefined;
        readonly frost?: boolean | undefined;
      }
    | undefined,
): ChatAmbientAppearance {
  const customColors = value?.customColors;
  return {
    palette: resolveChatAmbientColorPalette(value?.palette),
    customColors: {
      background: normalizeChatAmbientColor(
        customColors?.background,
        DEFAULT_CHAT_AMBIENT_CUSTOM_COLORS.background,
      ),
      primary: normalizeChatAmbientColor(
        customColors?.primary,
        DEFAULT_CHAT_AMBIENT_CUSTOM_COLORS.primary,
      ),
      secondary: normalizeChatAmbientColor(
        customColors?.secondary,
        DEFAULT_CHAT_AMBIENT_CUSTOM_COLORS.secondary,
      ),
    },
    gradient: isChatAmbientGradient(value?.gradient)
      ? value.gradient
      : DEFAULT_CHAT_AMBIENT_APPEARANCE.gradient,
    blur: isChatAmbientBlur(value?.blur) ? value.blur : DEFAULT_CHAT_AMBIENT_APPEARANCE.blur,
    dim: isChatAmbientDim(value?.dim) ? value.dim : DEFAULT_CHAT_AMBIENT_APPEARANCE.dim,
    frost: value?.frost === true,
  };
}

export function resolveChatAmbientShaderPalette(
  appearance: ChatAmbientAppearance,
  theme: ChatAmbientTheme,
): ChatAmbientShaderPalette {
  if (appearance.palette === CHAT_AMBIENT_CUSTOM_PALETTE) {
    return {
      background: hexToNumber(appearance.customColors.background),
      primary: hexToNumber(appearance.customColors.primary),
      secondary: hexToNumber(appearance.customColors.secondary),
    };
  }
  return CHAT_AMBIENT_COLOR_PALETTES[appearance.palette][theme];
}

export function resolveChatAmbientCssColors(
  appearance: ChatAmbientAppearance,
  theme: ChatAmbientTheme,
): ChatAmbientCustomColors {
  if (appearance.palette === CHAT_AMBIENT_CUSTOM_PALETTE) return appearance.customColors;

  const palette = CHAT_AMBIENT_COLOR_PALETTES[appearance.palette];
  return {
    background: numberToHex(palette[theme].background),
    primary: palette.swatches[0],
    secondary: palette.swatches[1],
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

const chatAmbientPaletteOptions: ReadonlyArray<{
  readonly id: ChatAmbientColorPaletteId;
  readonly label: string;
  readonly swatches: readonly [string, string];
}> = [
  ...(
    Object.keys(CHAT_AMBIENT_COLOR_PALETTES) as Array<keyof typeof CHAT_AMBIENT_COLOR_PALETTES>
  ).map((id) => ({
    id,
    label: CHAT_AMBIENT_COLOR_PALETTES[id].label,
    swatches: CHAT_AMBIENT_COLOR_PALETTES[id].swatches,
  })),
  {
    id: CHAT_AMBIENT_CUSTOM_PALETTE,
    label: "Custom gradient",
    swatches: [
      DEFAULT_CHAT_AMBIENT_CUSTOM_COLORS.primary,
      DEFAULT_CHAT_AMBIENT_CUSTOM_COLORS.secondary,
    ],
  },
];

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

const chatAmbientGradientOptions: ReadonlyArray<{
  readonly id: ChatAmbientGradient;
  readonly label: string;
}> = [
  { id: "radial", label: "Radial wash" },
  { id: "linear", label: "Linear beam" },
  { id: "conic", label: "Conic sweep" },
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
        aria-label={`Chat ambient effect: ${selectedLabel}`}
        className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md px-0 text-secondary-label outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        data-chat-ambient-effect-picker
        icon={false}
        size="xs"
        title={selectedLabel}
        variant="ghost"
      >
        <OrbitIcon aria-hidden="true" className="size-3.5 shrink-0" />
      </SelectTrigger>
      <SelectPopup
        align="end"
        alignItemWithTrigger={false}
        matchTriggerWidth={false}
        positionerStyle={{ zIndex: FLOATING_SURFACE_Z.pillNavMenu }}
      >
        {chatAmbientEffectOptions.map((option) => (
          <SelectItem key={option.id} value={option.id} hideIndicator className="min-w-36">
            {option.label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}

export interface ChatAmbientControlsProps {
  readonly effect: ChatAmbientEffectSelection;
  readonly onEffectChange: (effect: ChatAmbientEffectSelection) => void;
  readonly appearance: ChatAmbientAppearance;
  readonly onAppearanceChange: (appearance: ChatAmbientAppearance) => void;
}

export function ChatAmbientControls({
  effect,
  onEffectChange,
  appearance,
  onAppearanceChange,
}: ChatAmbientControlsProps) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <ChatAmbientEffectPicker value={effect} onValueChange={onEffectChange} />
      <ChatAmbientAppearancePicker value={appearance} onValueChange={onAppearanceChange} />
    </div>
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

function ChatAmbientColorInput({
  label,
  value,
  onValueChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-[0.6875rem] text-foreground/80">
      <span>{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-[0.625rem] text-muted-foreground">{value}</span>
        <input
          aria-label={`${label} color`}
          className="size-6 cursor-pointer rounded border border-border/70 bg-transparent p-0.5"
          type="color"
          value={value}
          onChange={(event) => onValueChange(event.currentTarget.value)}
        />
      </span>
    </label>
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
          >
            <SlidersHorizontalIcon className="size-3.5" />
          </button>
        }
      />
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

          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-medium text-foreground/80">Custom gradient</span>
              <span className="text-[0.625rem] text-muted-foreground">3 color stops</span>
            </div>
            <ChatAmbientColorInput
              label="Background"
              value={value.customColors.background}
              onValueChange={(background) =>
                onValueChange({
                  ...value,
                  palette: CHAT_AMBIENT_CUSTOM_PALETTE,
                  customColors: { ...value.customColors, background },
                })
              }
            />
            <ChatAmbientColorInput
              label="Primary"
              value={value.customColors.primary}
              onValueChange={(primary) =>
                onValueChange({
                  ...value,
                  palette: CHAT_AMBIENT_CUSTOM_PALETTE,
                  customColors: { ...value.customColors, primary },
                })
              }
            />
            <ChatAmbientColorInput
              label="Secondary"
              value={value.customColors.secondary}
              onValueChange={(secondary) =>
                onValueChange({
                  ...value,
                  palette: CHAT_AMBIENT_CUSTOM_PALETTE,
                  customColors: { ...value.customColors, secondary },
                })
              }
            />
          </div>

          <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
            <ChatAmbientAppearanceSelect
              label="Gradient"
              options={chatAmbientGradientOptions}
              value={value.gradient}
              onValueChange={(gradient) => {
                if (isChatAmbientGradient(gradient)) onValueChange({ ...value, gradient });
              }}
            />
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
  const resolvedAppearance = useMemo(
    () => resolveChatAmbientAppearance(appearance),
    [
      appearance?.blur,
      appearance?.customColors?.background,
      appearance?.customColors?.primary,
      appearance?.customColors?.secondary,
      appearance?.dim,
      appearance?.frost,
      appearance?.gradient,
      appearance?.palette,
    ],
  );
  const cssColors = useMemo(
    () => resolveChatAmbientCssColors(resolvedAppearance, theme),
    [resolvedAppearance, theme],
  );
  const plugin = effect === CHAT_AMBIENT_EFFECT_NONE ? null : CHAT_AMBIENT_EFFECT_PLUGINS[effect];
  const Effect = plugin?.component;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "chat-ambient-background pointer-events-none absolute inset-0 z-0 overflow-hidden",
        className,
      )}
      style={
        {
          "--chat-ambient-background": cssColors.background,
          "--chat-ambient-primary": cssColors.primary,
          "--chat-ambient-secondary": cssColors.secondary,
        } as CSSProperties
      }
      data-chat-ambient-background
      data-chat-ambient-effect={effect}
      data-chat-ambient-palette={resolvedAppearance.palette}
      data-chat-ambient-blur={resolvedAppearance.blur}
      data-chat-ambient-dim={resolvedAppearance.dim}
      data-chat-ambient-frost={resolvedAppearance.frost ? "true" : "false"}
      data-chat-ambient-gradient={resolvedAppearance.gradient}
    >
      {Effect ? (
        <Suspense fallback={<div className="absolute inset-0" data-chat-ambient-fallback />}>
          <Effect appearance={resolvedAppearance} theme={theme} />
        </Suspense>
      ) : null}
      <div className="chat-ambient-gradient-layer" data-chat-ambient-gradient-layer />
    </div>
  );
}
