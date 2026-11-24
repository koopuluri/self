import type { CSSProperties } from "react";
import { Img, staticFile } from "remotion";
import { CAP_COLORS as C } from "./CapTable.data";

type CapTableRowProps = {
  name: string;
  src: string;
  pct: number;
  /** 0 → hidden below its final position; 1 → fully present. */
  progress: number;
  rowHeight: number;
  marginTop: number;
  monoFontFamily: string;
};

/**
 * Shared holder row for every cap-table composition. Its layout is always at
 * final size; entrance motion is only a short slide upward plus a fade, so
 * adding a holder never grows or reflows an existing row.
 */
export function CapTableRow({
  name,
  src,
  pct,
  progress,
  rowHeight,
  marginTop,
  monoFontFamily,
}: CapTableRowProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 28,
        height: rowHeight,
        marginTop,
        opacity: progress,
        transform: `translateY(${(1 - progress) * 16}px)`,
      }}
    >
      <Avatar src={src} size={60} />
      <span style={{ flex: "none", fontWeight: 500, fontSize: 40, color: C.inkStrong }}>{name}</span>
      <span style={{ flex: "1 1 auto", minWidth: 24, height: 0, borderBottom: `2px solid ${C.hairline}` }} aria-hidden />
      <span style={{ flex: "none", fontFamily: monoFontFamily, fontWeight: 500, fontSize: 40, fontVariantNumeric: "tabular-nums", color: C.ink }}>
        {pct}%
      </span>
    </div>
  );
}

function Avatar({ src, size }: { src: string; size: number }) {
  const style: CSSProperties = {
    flex: "none",
    width: size,
    height: size,
    maxWidth: "none",
    display: "block",
    borderRadius: "50%",
    objectFit: "cover",
    background: "#ececea",
  };
  return <Img src={staticFile(src)} alt="" style={style} />;
}
