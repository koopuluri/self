import profile from "@/content/profile.json";

// Central site config. Set NEXT_PUBLIC_SITE_URL in the environment for production
// so that Open Graph / Twitter image URLs resolve to absolute URLs.
export const site = {
  name: profile.name,
  // Must match the domain the site is actually served from, so preview images
  // (absolute URLs) resolve. Override per-deploy with NEXT_PUBLIC_SITE_URL.
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.koopuluri.com",
  description: profile.bio,
  // Optional: your X/Twitter handle, used for twitter:creator.
  twitter: "@koopuluri",
} as const;
