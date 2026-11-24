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
import { measureText } from "@remotion/layout-utils";
import {
  CAP_OWNER,
  CAP_SHAREHOLDERS,
  SOCIAL_ACTIVE_TAB,
  SOCIAL_COLORS as C,
  SOCIAL_TABS,
  type SocialCapTableProps,
} from "./SocialCapTable.data";

export type { SocialCapTableProps };

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

// Composition-space sizes (1080 canvas).
const CANVAS = 1080;
const SCENE_PADDING = 168; // was an implicit 160 either side; +5%
const CARD_WIDTH = CANVAS - 2 * SCENE_PADDING; // 744
const HEADER_AVATAR = 96;
const ROW_AVATAR = 60;
const ROW_HEIGHT = 96;
const ROW_GAP = 20; // vertical space between rows
const HEADER_GAP = 44; // between header and the tab bar
const TABS_GAP = 22; // between the tab bar and the rows block

// Tab badge label size (matches the @handle) and its padding — 0.5em horizontal
// / 0.25em vertical relative to the label, so the badge hugs its text tastefully
// rather than being stretched to a fixed width.
const LABEL_SIZE = 34;
const BADGE_PAD_H = LABEL_SIZE * 0.5; // 17
const BADGE_PAD_V = LABEL_SIZE * 0.25; // 8.5

/**
 * "Social Media + Investing" — the cap table reframed as a Twitter/X profile.
 *
 * Same plain white surface as the CapTable viz: a hero (avatar / name / handle),
 * a three-tab row (Shareholders / Followers / Following) with Shareholders
 * active, and the full shareholder table below. Everything is still — the only
 * motion is a black "laser" that runs around the active Shareholders badge,
 * accelerating then decelerating. The whole video is exactly one laser lap, so
 * it loops seamlessly.
 */
export function SocialCapTable({ background }: SocialCapTableProps) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Owner keeps whatever the shareholders don't — everyone is always present.
  const ownerPct = 100 - CAP_SHAREHOLDERS.reduce((sum, h) => sum + h.pct, 0);

  // One lap around the badge over the whole loop, eased in-and-out so it speeds
  // up then slows to a near-stop at the seam (position 0 === position 1 on a
  // closed path → seamless).
  const laser = interpolate(frame, [0, durationInFrames], [0, 1], {
    easing: Easing.inOut(Easing.cubic),
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: SANS,
      }}
    >
      <div style={{ width: CARD_WIDTH, display: "flex", flexDirection: "column" }}>
        {/* Hero: identity with profile pic */}
        <div style={{ display: "flex", alignItems: "center", gap: 28, marginBottom: HEADER_GAP }}>
          <Avatar src={CAP_OWNER.src} size={HEADER_AVATAR} />
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25, minWidth: 0 }}>
            <span style={{ fontWeight: 500, fontSize: 44, color: C.inkStrong }}>{CAP_OWNER.name}</span>
            <span style={{ fontSize: 34, color: C.caption }}>{CAP_OWNER.handle}</span>
          </div>
        </div>

        {/* Profile tabs. Labels match the @handle size. The active badge hugs
            its text with tasteful padding and carries the laser; it's flush-left
            with the scene content, and the row is spread across the width. */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: TABS_GAP }}>
          {SOCIAL_TABS.map((tab) => {
            const active = tab === SOCIAL_ACTIVE_TAB;
            const weight = active ? 500 : 400;
            if (!active) {
              return (
                <span key={tab} style={{ fontSize: LABEL_SIZE, fontWeight: weight, color: C.caption, whiteSpace: "nowrap" }}>
                  {tab}
                </span>
              );
            }
            const m = measureText({ text: tab, fontFamily: SANS, fontSize: LABEL_SIZE, fontWeight: `${weight}` });
            const w = m.width + 2 * BADGE_PAD_H;
            const h = m.height + 2 * BADGE_PAD_V;
            return (
              <div
                key={tab}
                style={{
                  position: "relative",
                  width: w,
                  height: h,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: h / 2,
                  background: C.activePill,
                }}
              >
                <span style={{ fontSize: LABEL_SIZE, fontWeight: weight, color: C.inkStrong, whiteSpace: "nowrap" }}>{tab}</span>
                <LaserBorder w={w} h={h} progress={laser} />
              </div>
            );
          })}
        </div>

        {/* Cap table rows — all holders present, nothing animating in */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <Row name={CAP_OWNER.name} src={CAP_OWNER.src} pct={ownerPct} />
          {CAP_SHAREHOLDERS.map((h) => (
            <Row key={h.name} name={h.name} src={h.src} pct={h.pct} />
          ))}
        </div>
      </div>
    </div>
  );
}

// Comet trail: a bright leading segment with contiguous fading segments behind
// it (each `back` = cumulative length of the segments ahead of it), so the laser
// reads as a streak with a bright head and a tail that dissolves into nothing.
const LASER_TRAIL = [
  { len: 38, back: 0, opacity: 1, width: 4.4 },
  { len: 32, back: 38, opacity: 0.62, width: 4.0 },
  { len: 38, back: 70, opacity: 0.38, width: 3.6 },
  { len: 46, back: 108, opacity: 0.2, width: 3.2 },
  { len: 62, back: 154, opacity: 0.08, width: 2.9 },
];

/**
 * A black laser that runs around a rounded-rect (stadium) border. The border
 * itself is invisible; only the moving dash + its fading tail are drawn. Uses
 * SVG `pathLength` so the dash lengths are perimeter-normalized (independent of
 * the actual size).
 */
function LaserBorder({ w, h, progress }: { w: number; h: number; progress: number }) {
  const P = 1000; // normalized perimeter
  const inset = 4.4 / 2 + 1; // keep the thickest stroke inside the box
  const rw = w - 2 * inset;
  const rh = h - 2 * inset;
  const head = progress * P;

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}
    >
      {LASER_TRAIL.map((t, i) => (
        <rect
          key={i}
          x={inset}
          y={inset}
          width={rw}
          height={rh}
          rx={rh / 2}
          ry={rh / 2}
          fill="none"
          stroke={C.inkStrong}
          strokeWidth={t.width}
          strokeLinecap="round"
          pathLength={P}
          strokeDasharray={`${t.len} ${P - t.len}`}
          strokeDashoffset={-(head - t.back)}
          opacity={t.opacity}
        />
      ))}
    </svg>
  );
}

function Row({ name, src, pct }: { name: string; src: string; pct: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 28,
        height: ROW_HEIGHT,
        marginTop: ROW_GAP,
      }}
    >
      <Avatar src={src} size={ROW_AVATAR} />
      <span style={{ flex: "none", fontWeight: 500, fontSize: 40, color: C.inkStrong }}>{name}</span>
      <span style={{ flex: "1 1 auto", minWidth: 24, height: 0, borderBottom: `2px solid ${C.hairline}` }} aria-hidden />
      <span style={{ flex: "none", fontFamily: MONO, fontWeight: 500, fontSize: 40, fontVariantNumeric: "tabular-nums", color: C.ink }}>
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
