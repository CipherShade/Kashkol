export type Breadcrumb = {
  href?: string;
  label: string;
  current: boolean;
  /** Ancestors are hidden on narrow screens to keep the top bar usable. */
  ancestor: boolean;
};

/**
 * Build breadcrumbs from a locale-less pathname. `labels` is keyed by href and
 * is produced on the server from the message catalogue; this function stays
 * pure so it can be tested without a router or an i18n provider.
 */
export function buildBreadcrumbs(
  pathname: string,
  labels: Readonly<Record<string, string>>,
  homeHref = "/app",
): Breadcrumb[] {
  const clean = (pathname.split("?")[0] ?? "").replace(/\/+$/, "") || "/";
  if (clean === "/" || clean === homeHref) {
    return [
      {
        label: labels[homeHref] ?? "",
        current: true,
        ancestor: false,
      },
    ];
  }

  const segments = clean.split("/").filter(Boolean);
  const crumbs: Breadcrumb[] = [
    {
      href: homeHref,
      label: labels[homeHref] ?? "",
      current: false,
      ancestor: true,
    },
  ];

  let href = "";
  for (const [index, segment] of segments.entries()) {
    href += `/${segment}`;
    if (href === homeHref) continue;
    const isLast = index === segments.length - 1;
    const label = labels[href];
    if (!label) continue;
    crumbs.push({
      href: isLast ? undefined : href,
      label,
      current: isLast,
      ancestor: !isLast,
    });
  }

  return crumbs;
}
