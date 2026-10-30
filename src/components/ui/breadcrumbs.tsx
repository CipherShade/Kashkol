"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { buildBreadcrumbs } from "@/lib/navigation/breadcrumbs";
import { Icon } from "./icon";

export function Breadcrumbs({
  labels,
  label,
  homeHref = "/app",
}: {
  labels: Readonly<Record<string, string>>;
  label: string;
  homeHref?: string;
}) {
  const pathname = usePathname();
  const crumbs = buildBreadcrumbs(pathname, labels, homeHref);
  if (crumbs.length === 0 || !crumbs[0]?.label) return null;

  return (
    <nav className="ui-breadcrumbs" aria-label={label}>
      <ol className="ui-breadcrumbs-list">
        {crumbs.map((crumb, index) => (
          <li key={`${crumb.href ?? "current"}-${index}`} className="ui-breadcrumb-item">
            {index > 0 ? (
              <Icon
                name="chevronRight"
                size={13}
                className={
                  crumb.ancestor
                    ? "ui-breadcrumb-separator app-breadcrumb-separator-ancestor"
                    : "ui-breadcrumb-separator"
                }
                directional
              />
            ) : null}
            {crumb.href ? (
              <Link
                href={crumb.href}
                className={
                  crumb.ancestor
                    ? "ui-breadcrumb-link app-breadcrumb-ancestor"
                    : "ui-breadcrumb-link"
                }
              >
                {crumb.label}
              </Link>
            ) : (
              <span className="ui-breadcrumb-current" aria-current="page">
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
