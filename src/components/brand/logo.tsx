import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * The Chef Harena logo: a white chef's toque on a black tile, shaded for a
 * clean 3D look (tile gradient and top rim, lit hat, soft drop shadow). Logo
 * colours are fixed tokens, so it looks the same in both themes; the rim keeps
 * the tile's edge visible on dark backgrounds. The same drawing is the favicon
 * (src/app/icon.svg) and, full-bleed, the home-screen icon (apple-icon.png).
 * Decorative next to the name, so hidden from assistive technology.
 */
export function Logo({ className }: { className?: string }) {
  // Gradient and filter ids must be unique: the header and footer both render a logo.
  const id = useId();
  const ref = (name: string) => `url(#${id}${name})`;

  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className={cn("size-9 shrink-0", className)}>
      <defs>
        <linearGradient id={`${id}tile`} x1="0" y1="0" x2="0" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" className="[stop-color:var(--color-logo-tile-top)]" />
          <stop offset="1" className="[stop-color:var(--color-logo-tile-bottom)]" />
        </linearGradient>
        <linearGradient id={`${id}rim`} x1="0" y1="0" x2="0" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopOpacity="0.35" className="[stop-color:var(--color-logo-hat)]" />
          <stop offset="0.55" stopOpacity="0.06" className="[stop-color:var(--color-logo-hat)]" />
          <stop offset="1" stopOpacity="0.14" className="[stop-color:var(--color-logo-hat)]" />
        </linearGradient>
        <radialGradient id={`${id}hat`} cx="16" cy="9" r="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" className="[stop-color:var(--color-logo-hat)]" />
          <stop offset="0.55" className="[stop-color:var(--color-logo-hat-mid)]" />
          <stop offset="1" className="[stop-color:var(--color-logo-hat-shade)]" />
        </radialGradient>
        <linearGradient id={`${id}band`} x1="0" y1="25" x2="0" y2="30.5" gradientUnits="userSpaceOnUse">
          <stop offset="0" className="[stop-color:var(--color-logo-band-top)]" />
          <stop offset="1" className="[stop-color:var(--color-logo-band-bottom)]" />
        </linearGradient>
        <filter id={`${id}shadow`} x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow
            dx="0"
            dy="1.4"
            stdDeviation="1.2"
            floodOpacity="0.6"
            className="[flood-color:var(--color-logo-shadow)]"
          />
        </filter>
      </defs>
      <rect width="40" height="40" rx="10" fill={ref("tile")} />
      <rect x="0.5" y="0.5" width="39" height="39" rx="9.5" fill="none" stroke={ref("rim")} />
      <g filter={ref("shadow")}>
        <g fill={ref("hat")}>
          <circle cx="13.4" cy="17.6" r="5" />
          <circle cx="20" cy="13.6" r="6.4" />
          <circle cx="26.6" cy="17.6" r="5" />
          <path d="M9.6 19.4 12.6 25.6H27.4L30.4 19.4Z" />
        </g>
        <rect x="12.4" y="25" width="15.2" height="5.4" rx="1.6" fill={ref("band")} />
      </g>
      {/* Pleats of the crown and the light catching the band's top edge. */}
      <g
        fill="none"
        strokeWidth="0.7"
        strokeLinecap="round"
        strokeOpacity="0.15"
        className="stroke-logo-shadow"
      >
        <path d="M17 14.6Q15.9 19.6 16.8 24.8" />
        <path d="M23 14.6Q24.1 19.6 23.2 24.8" />
      </g>
      <path
        d="M13.6 25.75H26.4"
        strokeWidth="0.5"
        strokeLinecap="round"
        strokeOpacity="0.9"
        className="stroke-logo-hat"
      />
    </svg>
  );
}
