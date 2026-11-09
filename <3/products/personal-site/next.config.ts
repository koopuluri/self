import type { NextConfig } from "next";
import createMDX from "@next/mdx";

const nextConfig: NextConfig = {
  pageExtensions: ["ts", "tsx", "js", "jsx", "md", "mdx"],
  // Pin the workspace root to THIS directory. A stray package-lock.json one dir
  // up otherwise makes Turbopack infer the parent as the root, which mismatches
  // the client manifest paths (breaks dev with a global-error.js manifest error).
  turbopack: { root: import.meta.dirname },
  devIndicators: false,
  // The Remotion renderer/bundler ship native binaries and spawn headless
  // Chrome — they must run as real Node modules, never bundled by Turbopack.
  serverExternalPackages: ["@remotion/renderer", "@remotion/bundler"],
  async redirects() {
    return [
      { source: "/%3C3/essays/:slug.md", destination: "/:slug", permanent: true },
      { source: "/%3C3/essays/:slug", destination: "/:slug", permanent: true },
      { source: "/expression/:path*", destination: "/%3C3/notes/:path*", permanent: true },
      { source: "/events/chats/:path*", destination: "/%3C3/chats/:path*", permanent: true },
      { source: "/events/browsing/:path*", destination: "/%3C3/browsing/:path*", permanent: true },
      {
        source: "/ai",
        destination: "/π",
        permanent: true,
      },
      {
        source: "/stock",
        destination: "/$",
        permanent: true,
      },
      {
        source: "/essays/personal-manifesto",
        destination: "/personal-stack",
        permanent: true,
      },
      {
        source: "/personal-manifesto",
        destination: "/personal-stack",
        permanent: true,
      },
      {
        source: "/design-principles",
        destination: "/principles",
        permanent: true,
      },
      {
        source: "/essays/design-principles",
        destination: "/principles",
        permanent: true,
      },
      {
        source: "/social/essay-design-principles.png",
        destination: "/social/essay-principles.png",
        permanent: true,
      },
      {
        source: "/essays/:slug",
        destination: "/:slug",
        permanent: true,
      },
      {
        source: "/personal-token",
        destination:
          "https://x.com/koopuluri/status/2081196820936757550",
        permanent: false,
      },
    ];
  },
};

const withMDX = createMDX({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [["remark-frontmatter", "yaml"], "remark-gfm"],
  },
});

export default withMDX(nextConfig);
