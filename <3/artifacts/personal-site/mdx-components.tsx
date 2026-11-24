import type { MDXComponents } from "mdx/types";
import { SiteAnchor } from "@/components/SiteAnchor";

const components: MDXComponents = {
  a: SiteAnchor,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
