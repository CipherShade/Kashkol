import { createElement, type AnchorHTMLAttributes, type ReactNode } from "react";

// Test stub: renders Next's `Link` as a plain anchor so locale-aware links can
// be asserted in static markup without Next's client runtime.
export default function Link({
  href,
  children,
  ...rest
}: { href: string; children?: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return createElement("a", { href, ...rest }, children);
}
