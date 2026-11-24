// Plain data for the SocialCapTable scene — NO remotion/React imports, safe in
// server components. Sizes are in composition px (1080-wide canvas).
//
// This scene is the same cap table, reframed as a social-media profile: the
// owner + shareholder rows sit under a three-tab bar (Shareholders / Followers
// / Following), with the Shareholders tab active. It deliberately reuses the
// exact people, avatars, valuations, and palette from CapTable so the two scenes
// read as one visual family.

export {
  CAP_OWNER,
  CAP_SHAREHOLDERS,
  CAP_VALUATIONS,
  type CapHolder,
} from "./CapTable.data";

import { CAP_COLORS } from "./CapTable.data";

// The profile tabs. Shareholders is the new (active) one; Followers/Following
// mirror a real social profile. Order matters — Shareholders leads.
export const SOCIAL_TABS = ["Shareholders", "Followers", "Following"] as const;
export const SOCIAL_ACTIVE_TAB = "Shareholders";

// Same palette as the cap table, plus a subtle neutral pill behind the active
// tab (in place of an underline).
export const SOCIAL_COLORS = {
  ...CAP_COLORS,
  activePill: "rgba(0, 0, 0, 0.05)",
};

export type SocialCapTableProps = {
  /**
   * Panel background. Transparent for a chromeless embed; a solid color for the
   * exported video (X renders transparency black).
   */
  background: string;
};

export const socialCapTableDefaultProps: SocialCapTableProps = {
  background: "transparent",
};
