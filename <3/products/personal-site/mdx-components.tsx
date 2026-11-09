import type { MDXComponents } from "mdx/types";
import type { AnchorHTMLAttributes } from "react";

function Anchor({
  href,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const isExternal = typeof href === "string" && /^https?:\/\//.test(href);
  return (
    <a
      href={href}
      {...(isExternal
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
      {...props}
    />
  );
}

const components: MDXComponents = {
  a: Anchor,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
