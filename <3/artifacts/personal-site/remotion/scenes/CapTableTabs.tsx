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
  type CapTableProps,
} from "./CapTable.data";
import { CapTableRow } from "./CapTableRow";

export type { CapTableProps };

const { fontFamily: SANS } = loadSans("normal", {
  weights: ["400", "500", "600"],
  subsets: ["latin"],
});
const { fontFamily: MONO } = loadMono("normal", {
  weights: ["500"],
  subsets: ["latin"],
});

const STEP = 15;
const ROW_ANIM = 15;

const CARD_WIDTH = 792; // 10% narrower than the original 880px social card
const HEADER_AVATAR = 96;
const ROW_AVATAR = 60;
// Every row has identical geometry: a 60px content line plus a 56px gap.
// The first row omits only the leading gap, so every avatar advances by 116px.
const ROW_HEIGHT = ROW_AVATAR;
const ROW_GAP = 56;
// These are direct object-to-object measurements: the hero avatar ends at the
// hero box boundary, the active badge fills the tab row, and the first list row
// begins at its avatar. The smaller lower gap groups the tabs with the list.
const GAP_UNIT = 48;
const HERO_TABS_GAP = GAP_UNIT * 2;
// The badge row is part of the list group, so its visible whitespace before
// Alice matches the whitespace between every pair of list avatars below it.
const TABS_LIST_GAP = ROW_GAP;
const TABS_HEIGHT = 84;
const TAB_PADDING_V = 20;
const TAB_PADDING_H = TAB_PADDING_V * 2;

const TABS = ["Shareholders", "Followers", "Following"] as const;

/**
 * The Cap Table composition with a social-profile-style tab bar inserted
 * between Alice's identity and the shareholder rows. The cap-table build-up
 * remains identical to the original scene.
 */
export function CapTableTabs({ background }: CapTableProps) {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const totalSteps = CAP_SHAREHOLDERS.length + 1;
  const step = Math.min(Math.max(Math.floor(frame / STEP), 0), totalSteps - 1);

  const rowCount = CAP_SHAREHOLDERS.length + 1;
  const finalHeight =
    HEADER_AVATAR +
    HERO_TABS_GAP +
    TABS_HEIGHT +
    TABS_LIST_GAP +
    ROW_AVATAR +
    (rowCount - 1) * (ROW_HEIGHT + ROW_GAP);
  const topPad = Math.max(0, (height - finalHeight) / 2);

  const shown = CAP_SHAREHOLDERS.slice(0, step);
  const ownerPct = 100 - shown.reduce((sum, holder) => sum + holder.pct, 0);

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
      <div style={{ width: CARD_WIDTH, display: "flex", flexDirection: "column" }}>
        <div style={{ height: HEADER_AVATAR, display: "flex", alignItems: "center", gap: 28 }}>
          <Avatar src={CAP_OWNER.src} size={HEADER_AVATAR} />
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <span style={{ fontWeight: 500, fontSize: 44, lineHeight: 1.15, letterSpacing: "-0.035em", color: C.inkStrong }}>
              {CAP_OWNER.name}
            </span>
            <span style={{ fontSize: 34, lineHeight: 1.1, color: C.caption }}>{CAP_OWNER.handle}</span>
          </div>
        </div>

        <div style={{ display: "flex", height: TABS_HEIGHT, marginTop: HERO_TABS_GAP }}>
          {TABS.map((tab, index) => {
            const active = tab === "Shareholders";
            return (
              <div
                key={tab}
                style={{
                  width: "33.3333%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                }}
              >
                <span
                  style={{
                    boxSizing: "border-box",
                    display: active ? "flex" : "block",
                    alignItems: "center",
                    height: active ? "100%" : "auto",
                    padding: active ? `${TAB_PADDING_V}px ${TAB_PADDING_H}px` : 0,
                    borderRadius: 24,
                    background: active ? "#f0f0ed" : "transparent",
                    color: active ? C.inkStrong : C.caption,
                    fontSize: 34,
                    lineHeight: "44px",
                    fontWeight: active ? 550 : 450,
                    whiteSpace: "nowrap",
                  }}
                >
                  {tab}
                </span>
                {index === 1 && (
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      right: 0,
                      height: 48,
                      borderRight: `2px solid ${C.hairline}`,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: TABS_LIST_GAP }}>
          <CapTableRow
            name={CAP_OWNER.name}
            src={CAP_OWNER.src}
            pct={ownerPct}
            progress={1}
            rowHeight={ROW_HEIGHT}
            marginTop={0}
            monoFontFamily={MONO}
          />
          {shown.map((holder, index) => {
            const start = (index + 1) * STEP;
            const progress = interpolate(frame, [start, start + ROW_ANIM], [0, 1], {
              easing: Easing.out(Easing.cubic),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <CapTableRow
                key={holder.name}
                name={holder.name}
                src={holder.src}
                pct={holder.pct}
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
