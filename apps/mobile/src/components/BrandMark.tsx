import Constants from "expo-constants";
import { Image } from "expo-image";
import { View } from "react-native";

<<<<<<< HEAD
import { AppText as Text } from "./AppText";
import { resolveMobileStageLabel } from "../lib/mobileBranding";

const appVariant = Constants.expoConfig?.extra?.appVariant;
const BRAND_MARK_SOURCE =
  appVariant === "development"
    ? require("../../../../assets/dev/blueprint-ios-1024.png")
    : appVariant === "preview"
      ? require("../../../../assets/nightly/nightly-ios-1024.png")
      : require("../../../../assets/prod/black-ios-1024.png");
const DEFAULT_STAGE_LABEL = resolveMobileStageLabel(appVariant);
=======
import { AppText as Text } from "./ui/AppText";
import { T3_CODE_BRAND_MARK_SOURCE } from "./brandAssets";

const appVariant = Constants.expoConfig?.extra?.appVariant;
const DEFAULT_STAGE_LABEL =
  appVariant === "development" ? "Dev" : appVariant === "preview" ? "Preview" : "Beta";
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7

export function BrandMark(props: { readonly compact?: boolean; readonly stageLabel?: string }) {
  const compact = props.compact ?? false;
  const iconSize = compact ? 32 : 44;
  const stageLabel = props.stageLabel ?? DEFAULT_STAGE_LABEL;

  return (
    <View className="flex-row items-center gap-3">
      <Image
        source={T3_CODE_BRAND_MARK_SOURCE}
        accessibilityIgnoresInvertColors
        style={{
          width: iconSize,
          height: iconSize,
          borderRadius: compact ? 10 : 14,
        }}
      />
      <View className="gap-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-lg font-t3-bold tracking-[-0.4px] text-foreground">Marcode</Text>
          {stageLabel ? (
            <View className="rounded-full bg-subtle px-2 py-1">
              <Text className="text-3xs font-t3-bold tracking-[1.1px] uppercase text-foreground-muted">
                {stageLabel}
              </Text>
            </View>
          ) : null}
        </View>
        {!compact ? (
          <Text className="text-xs font-medium text-foreground-muted">
            Mobile control surface for your live coding environments
          </Text>
        ) : null}
      </View>
    </View>
  );
}
