import type { ReactNode } from "react";

/**
 * The hand-rolled thin-stroke icon set from the reference prototype.
 *
 * Icons are inline SVG (F-P0-05 AC-6). They are `aria-hidden` unless a `title`
 * is supplied, in which case they become an image with an accessible name.
 * Directional glyphs opt into mirroring under RTL with the `directional`
 * prop; the flip is done in CSS so the SVG path is never duplicated.
 */
export type IconName =
  | "grid"
  | "users"
  | "layers"
  | "calendar"
  | "check"
  | "book"
  | "edit"
  | "bar"
  | "alert"
  | "whatsapp"
  | "staff"
  | "student"
  | "parent"
  | "gear"
  | "bell"
  | "search"
  | "plus"
  | "chevronDown"
  | "chevronRight"
  | "chevronLeft"
  | "x"
  | "clock"
  | "filter"
  | "arrowUp"
  | "arrowDown"
  | "arrowRight"
  | "globe"
  | "logout"
  | "trash"
  | "file"
  | "target"
  | "home"
  | "mail"
  | "phone"
  | "download"
  | "menu"
  | "sun"
  | "moon"
  | "monitor"
  | "checkCircle"
  | "xCircle"
  | "info"
  | "lock"
  | "sparkles"
  | "creditCard"
  | "clipboard"
  | "message"
  | "shield"
  | "activity"
  | "table"
  | "user"
  | "save"
  | "externalLink"
  | "refresh"
  | "eye";

const PATHS: Record<IconName, ReactNode> = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5" />
      <path d="M16 8.2a3 3 0 1 1 0 6" />
      <path d="M20.5 20c0-2.7-1.6-4.6-3.7-5.2" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3l8.5 4.6L12 12.2 3.5 7.6 12 3z" />
      <path d="M3.5 12.4L12 17l8.5-4.6" />
      <path d="M3.5 16.9L12 21.5l8.5-4.6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
      <path d="M3.5 9.5h17" />
      <path d="M8 2.5v4" />
      <path d="M16 2.5v4" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.2 12.3l2.5 2.6 5-5.4" />
    </>
  ),
  book: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5H6.5A2.5 2.5 0 0 0 4 21V5.5z" />
      <path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" />
    </>
  ),
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </>
  ),
  bar: (
    <>
      <path d="M4 20V10" />
      <path d="M11 20V4" />
      <path d="M18 20v-7" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.5l9.5 16.5H2.5L12 3.5z" />
      <path d="M12 10v4.2" />
      <circle cx="12" cy="17.2" r="0.4" fill="currentColor" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M6.5 17.5L3.5 20.5l1-3.6A8 8 0 1 1 8 19l-1.5-1.5z" />
      <path d="M8.5 8.7c.1-.5.6-.5.9-.5.3 0 .5 0 .6.3.2.4.6 1.3.6 1.4.1.2 0 .4-.1.5l-.4.5c-.1.2-.2.3-.1.5.2.3.7 1 1.4 1.6.8.7 1.4.9 1.6 1 .2.1.4.1.5-.1l.5-.6c.1-.2.3-.2.5-.1l1.2.6c.2.1.3.2.4.3.1.2 0 1-.3 1.4-.3.4-1 .8-1.7.8-.6 0-2-.2-3.8-2-2-1.9-2.6-3.5-2.7-4.1-.1-.6 0-1.2.3-1.5z" />
    </>
  ),
  staff: (
    <>
      <circle cx="8" cy="7.5" r="3" />
      <circle cx="17" cy="8.5" r="2.4" />
      <path d="M2.7 19.5c0-3 2.4-5 5.3-5s5.3 2 5.3 5" />
      <path d="M13.8 15.2c2.3.3 3.9 2 3.9 4.3" />
    </>
  ),
  student: (
    <>
      <path d="M2.5 8.5L12 4l9.5 4.5L12 13 2.5 8.5z" />
      <path d="M6 10.6v4.3c0 1.6 2.7 2.9 6 2.9s6-1.3 6-2.9v-4.3" />
      <path d="M21.5 8.5v6" />
    </>
  ),
  parent: (
    <>
      <circle cx="9" cy="6.5" r="2.6" />
      <circle cx="16" cy="7.5" r="2" />
      <path d="M4 19c0-2.8 2.2-4.7 5-4.7s5 1.9 5 4.7" />
      <path d="M13.5 15c1.9.2 3.3 1.7 3.3 3.7" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M17.8 6.2l-1.5 1.5M7.7 16.3l-1.5 1.5M17.8 17.8l-1.5-1.5M7.7 7.7L6.2 6.2" />
    </>
  ),
  bell: (
    <>
      <path d="M6 10a6 6 0 1 1 12 0c0 4 1.3 5.3 1.3 5.3H4.7S6 14 6 10z" />
      <path d="M10 18.3a2 2 0 0 0 4 0" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.5-4.5" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  chevronDown: <path d="M6 9l6 6 6-6" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  chevronLeft: <path d="M15 6l-6 6 6 6" />,
  x: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.3l3.5 2" />
    </>
  ),
  filter: <path d="M4 5h16l-6 7.5V19l-4 2v-8.5L4 5z" />,
  arrowUp: (
    <>
      <path d="M12 19V5" />
      <path d="M6 11l6-6 6 6" />
    </>
  ),
  arrowDown: (
    <>
      <path d="M12 5v14" />
      <path d="M18 13l-6 6-6-6" />
    </>
  ),
  arrowRight: (
    <>
      <path d="M4 12h16" />
      <path d="M14 6l6 6-6 6" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.6 3.8 5.8 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.8-3.8-9S9.5 5.6 12 3z" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5.5A2.5 2.5 0 0 1 3 18.5v-13A2.5 2.5 0 0 1 5.5 3H9" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7" />
      <path d="M6 7l1 13a2 2 0 0 0 2 1.9h6a2 2 0 0 0 2-1.9l1-13" />
    </>
  ),
  file: (
    <>
      <path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z" />
      <path d="M14 3.5V8h4" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    </>
  ),
  home: (
    <>
      <path d="M4 11.5L12 4l8 7.5" />
      <path d="M6 10v9.5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V10" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />
      <path d="M4.5 6.5L12 12.5l7.5-6" />
    </>
  ),
  phone: (
    <path d="M7.5 3.5h2.8l1.2 4-2 1.6a12 12 0 0 0 5.4 5.4l1.6-2 4 1.2v2.8a1.6 1.6 0 0 1-1.7 1.6A15.5 15.5 0 0 1 5.9 5.2 1.6 1.6 0 0 1 7.5 3.5z" />
  ),
  download: (
    <>
      <path d="M12 4v11.5" />
      <path d="M7 11l5 5 5-5" />
      <path d="M5 20h14" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
    </>
  ),
  moon: <path d="M20 14.3A8.2 8.2 0 0 1 9.7 4 8.2 8.2 0 1 0 20 14.3z" />,
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M8 20h8" />
      <path d="M12 16v4" />
    </>
  ),
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.2l2.6 2.6 5.4-5.6" />
    </>
  ),
  xCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6" />
      <path d="M15 9l-6 6" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <circle cx="12" cy="8" r="0.5" fill="currentColor" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10" width="15" height="10.5" rx="2" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
      <path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" />
    </>
  ),
  creditCard: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 15h3" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4.5" width="14" height="17" rx="2" />
      <path d="M9 4.5V3h6v1.5" />
      <path d="M8.5 10h7M8.5 14h7" />
    </>
  ),
  message: (
    <path d="M4 5.5h16v11H9l-5 4v-15z" />
  ),
  shield: (
    <>
      <path d="M12 3l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-3z" />
      <path d="M9 12l2.2 2.2L15.5 10" />
    </>
  ),
  activity: <path d="M3 12h4l2.5-6 4 12 2.5-6h5" />,
  table: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="1.5" />
      <path d="M3 9.5h18M3 14.5h18M9 4.5v15M15 4.5v15" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M4.5 20c0-3.6 3.1-6 7.5-6s7.5 2.4 7.5 6" />
    </>
  ),
  save: (
    <>
      <path d="M5 3.5h11L20.5 8v12.5H5V3.5z" />
      <path d="M8 3.5v5h7v-5" />
      <path d="M8 14h8v6H8z" />
    </>
  ),
  externalLink: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4l-8.5 8.5" />
      <path d="M18 14v5.5H4.5V6H10" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 1 0-2.3 6" />
      <path d="M20 4v7h-7" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
};

export type IconProps = {
  name: IconName | string;
  size?: number | "xs" | "sm" | "md" | "lg";
  strokeWidth?: number;
  className?: string;
  title?: string;
  directional?: boolean;
};

const ICON_ALIASES: Record<string, IconName> = {
  "alert-triangle": "alert",
  "rotate-ccw": "refresh",
  rotate: "refresh",
  repeat: "refresh",
  "user-plus": "plus",
  "user-minus": "trash",
  "message-circle": "whatsapp",
  "arrow-right": "arrowRight",
  "arrow-left": "arrowRight",
  "map-pin": "target",
};

export function Icon({
  name,
  size = 18,
  strokeWidth = 1.75,
  className,
  title,
  directional = false,
}: IconProps) {
  const resolvedSize =
    typeof size === "number"
      ? size
      : size === "xs"
        ? 14
        : size === "sm"
          ? 16
          : size === "lg"
            ? 20
            : 18;

  const resolvedName = (ICON_ALIASES[name] ?? name) as IconName;
  const isDirectional =
    directional || name === "arrow-left" || name === "chevronLeft";

  const classes = ["icon", isDirectional ? "icon-directional" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <svg
      width={resolvedSize}
      height={resolvedSize}
      viewBox="0 0 24 24"
      fill="none"
      className={classes}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {PATHS[resolvedName] ?? PATHS.info}
    </svg>
  );
}
