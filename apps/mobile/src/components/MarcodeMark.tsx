import type { ColorValue } from "react-native";
import Svg, { Path } from "react-native-svg";

/**
 * The marcode brand mark, matching `apps/web/src/components/MarcodeMark.tsx`
 * and `apps/web/public/favicon.svg`. Width derives from the viewBox aspect
 * ratio. Change all three together.
 */
export function MarcodeMark(props: { readonly height: number; readonly color: ColorValue }) {
  const aspectRatio = 24 / 19;
  return (
    <Svg
      accessibilityLabel="marcode"
      height={props.height}
      width={props.height * aspectRatio}
      viewBox="0 0 24 19"
    >
      <Path
        d="M24 1.45201L21.0209 0L13.0852 6.28568L16.0713 8.62844L20.32 5.26421V13.7462L2.93911 0.0889008L0 1.52523V17.548L2.97911 19L10.8609 12.7561L7.87479 10.4134L3.67998 13.7358V5.32524L21.0522 18.9878L24 17.548V1.45201Z"
        fill={props.color}
      />
    </Svg>
  );
}
