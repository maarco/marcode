import type { CSSProperties } from "react";

/**
 * The marcode brand mark.
 *
 * Inlined rather than imported from `@aliimam/vectors` (source: `Abstract122Shapes`)
 * — that pack is a ~10MB bundle and this is the only glyph we want out of it.
 * The same path ships in `public/favicon.svg`; change both together.
 */
export function MarcodeMark({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 19"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden
    >
      <path d="M24 1.45201L21.0209 0L13.0852 6.28568L16.0713 8.62844L20.32 5.26421V13.7462L2.93911 0.0889008L0 1.52523V17.548L2.97911 19L10.8609 12.7561L7.87479 10.4134L3.67998 13.7358V5.32524L21.0522 18.9878L24 17.548V1.45201Z" />
    </svg>
  );
}
