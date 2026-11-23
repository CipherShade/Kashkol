/**
 * The Kashkol monogram: the Arabic letter ك inside the existing rounded frame.
 *
 * The glyph is a vector path, not a font `<text>` element, so it renders
 * identically in every browser and in the PWA icon. It paints with
 * `currentColor`, which gives the mark a light and a dark variant without two
 * assets or a theme-dependent flash.
 */
const KAF_PATH =
  "M1362 453Q1362 231 1259.0 115.5Q1156 0 983 0H469Q395 0 325.0 12.0Q255 24 204 57Q152 91 122.0 152.0Q92 213 92 309Q92 348 95.5 384.5Q99 421 100 430H268V420Q267 412 262.5 384.5Q258 357 258 311Q258 242 315.0 215.0Q372 188 469 188H987Q1046 188 1088.0 212.5Q1130 237 1153 276Q1175 312 1185.5 360.0Q1196 408 1196 465V1556H1362ZM924 735Q924 650 823.0 599.5Q722 549 561 549V643Q677 643 754.0 664.0Q831 685 831 725Q831 743 811.5 755.0Q792 767 756 776L680 795Q627 807 595.0 840.0Q563 873 563 928Q563 998 632.5 1041.5Q702 1085 834 1085V995Q741 995 696.0 977.5Q651 960 651 930Q651 912 671.0 898.5Q691 885 727 877L811 856Q856 846 890.0 819.0Q924 792 924 735Z";

export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      role="presentation"
      focusable="false"
      aria-hidden="true"
    >
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <g fill="currentColor" transform="translate(7.64 25) scale(0.0115 -0.0115)">
        <path d={KAF_PATH} />
      </g>
    </svg>
  );
}
