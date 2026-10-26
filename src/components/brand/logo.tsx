import { cn } from "@/lib/utils";

/**
 * The Chef Harena logo: an "H" monogram whose crossbar is a gold lozenge (the
 * woven-border motif) on a forest-green tile. Brand colours are fixed, so it
 * looks the same in both themes; in dark mode a hairline outline separates the
 * tile from the dark background. The same drawing is the favicon
 * (src/app/icon.svg) and, full-bleed, the home-screen icon (apple-icon.png).
 * Decorative next to the name, so hidden from assistive technology.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className={cn("size-9 shrink-0", className)}>
      <rect width="40" height="40" rx="10" className="fill-highland-forest" />
      <rect
        x="0.5"
        y="0.5"
        width="39"
        height="39"
        rx="9.5"
        fill="none"
        className="hidden stroke-injera-ivory/25 dark:block"
      />
      <rect x="10.5" y="10" width="5.5" height="20" rx="1.5" className="fill-injera-ivory" />
      <rect x="24" y="10" width="5.5" height="20" rx="1.5" className="fill-injera-ivory" />
      <path d="M20 14.5 26 20 20 25.5 14 20Z" className="fill-ceremonial-gold" />
    </svg>
  );
}
