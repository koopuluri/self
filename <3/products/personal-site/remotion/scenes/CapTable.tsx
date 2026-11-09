import type { CSSProperties } from "react";
import {
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont as loadSans } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/GeistMono";
import {
  CAP_COLORS as C,
  CAP_OWNER,
  CAP_SHAREHOLDERS,
  CAP_VALUATIONS,
  type CapTableProps,
} from "./CapTable.data";
import { CapTableRow } from "./CapTableRow";

export type { CapTableProps };

// Self-contained font loading: works identically in the essay Player and in the
// render bundle (which has no access to the site's next/font setup).
const { fontFamily: SANS } = loadSans("normal", {
  weights: ["400", "500", "600"],
  subsets: ["latin"],
});
const { fontFamily: MONO } = loadMono("normal", {
  weights: ["500"],
  subsets: ["latin"],
});

// Timing (frames @ 30fps). A new shareholder joins every STEP frames and
// slides into its already-reserved row. Total steps = VALUATIONS.length (5).
const STEP = 15;
const ROW_ANIM = 15;
const VAL_FADE = 9;

// Composition-space sizes (1080 canvas).
const CARD_WIDTH = 760;
const HEADER_AVATAR = 96;
const ROW_HEIGHT = 96;
const ROW_GAP = 20; // vertical space each row adds above itself
const HEADER_GAP = 56; // between header and the rows block

/**
 * Jane's personal-token cap table, built up one shareholder at a time as the
 * valuation climbs. A one-shot animation: it plays once and holds the final
 * frame (embedded with a replay button, not a loop).
 *
 * Frame-driven: the step index and each row's grow-in are pure functions of the
 * frame, so it's identical every play and exportable.
 */
export function CapTable({ background }: CapTableProps) {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const totalSteps = CAP_VALUATIONS.length; // 5
  const step = Math.min(Math.max(Math.floor(frame / STEP), 0), totalSteps - 1);

  // Anchor the card so that its FINAL (fully populated) form is vertically
  // centered. Rows then grow downward from a fixed header position instead of
  // the whole block re-centering (and the header drifting up) every frame.
  const rowCount = CAP_SHAREHOLDERS.length + 1; // owner + shareholders
  const finalHeight = HEADER_AVATAR + HEADER_GAP + rowCount * (ROW_HEIGHT + ROW_GAP);
  const topPad = Math.max(0, (height - finalHeight) / 2);

  const shown = CAP_SHAREHOLDERS.slice(0, step);
  const ownerPct = 100 - shown.reduce((sum, h) => sum + h.pct, 0);
  const showValuation = step >= 1;
  const valuationOpacity = interpolate(frame, [STEP, STEP + VAL_FADE], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: topPad,
        fontFamily: SANS,
      }}
    >
      <div style={{ width: CARD_WIDTH, display: "flex", flexDirection: "column", gap: HEADER_GAP }}>
        {/* Header: identity left, valuation right */}
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <Avatar src={CAP_OWNER.src} size={HEADER_AVATAR} />
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25, flex: 1, minWidth: 0 }}>
            <span
              style={{
                fontWeight: 500,
                fontSize: 44,
                letterSpacing: "-0.035em",
                color: C.inkStrong,
              }}
            >
              {CAP_OWNER.name}
            </span>
            <span style={{ fontSize: 34, color: C.caption }}>{CAP_OWNER.handle}</span>
          </div>
          {showValuation && (
            <span
              style={{
                flex: "none",
                padding: "16px 30px",
                borderRadius: 22,
                background: C.greenBg,
                color: C.green,
                fontFamily: MONO,
                fontWeight: 500,
                fontSize: 42,
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
                opacity: valuationOpacity,
              }}
            >
              ${CAP_VALUATIONS[step]}M
            </span>
          )}
        </div>

        {/* Cap table rows */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <CapTableRow
            name={CAP_OWNER.name}
            src={CAP_OWNER.src}
            pct={ownerPct}
            progress={1}
            rowHeight={ROW_HEIGHT}
            marginTop={ROW_GAP}
            monoFontFamily={MONO}
          />
          {shown.map((h, j) => {
            const start = (j + 1) * STEP;
            const progress = interpolate(frame, [start, start + ROW_ANIM], [0, 1], {
              easing: Easing.out(Easing.cubic),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <CapTableRow
                key={h.name}
                name={h.name}
                src={h.src}
                pct={h.pct}
                progress={progress}
                rowHeight={ROW_HEIGHT}
                marginTop={ROW_GAP}
                monoFontFamily={MONO}
              />
            );
          })}
        </div>
      </div>
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
