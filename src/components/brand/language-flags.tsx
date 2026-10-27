import type { ComponentType, SVGProps } from "react";
import { buttonVariants } from "@/components/ui/button";
import type { AppLocale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

type FlagProps = SVGProps<SVGSVGElement>;

// US: 13 stripes and a canton of 50 stars in rows of 6 and 5 (19:10).
const US_STRIPE = 10 / 13;
const US_CANTON = { width: 7.6, height: 7 * US_STRIPE };
const US_STARS = Array.from({ length: 9 }, (_, row) =>
  Array.from({ length: row % 2 ? 5 : 6 }, (_, column) => ({
    x: ((row % 2 ? 2 * column + 2 : 2 * column + 1) * US_CANTON.width) / 12,
    y: ((row + 1) * US_CANTON.height) / 10,
  })),
).flat();

function UsFlag(props: FlagProps) {
  return (
    <svg viewBox="0 0 19 10" preserveAspectRatio="xMidYMid slice" {...props}>
      <rect width="19" height="10" className="fill-flag-us-red" />
      {[1, 3, 5, 7, 9, 11].map((stripe) => (
        <rect key={stripe} y={stripe * US_STRIPE} width="19" height={US_STRIPE} className="fill-white" />
      ))}
      <rect width={US_CANTON.width} height={US_CANTON.height} className="fill-flag-us-blue" />
      {US_STARS.map((star) => (
        <circle key={`${star.x}-${star.y}`} cx={star.x} cy={star.y} r="0.2" className="fill-white" />
      ))}
    </svg>
  );
}

// Ethiopia: green, yellow and red bands with the blue disc and yellow star (2:1).
function EthiopiaFlag(props: FlagProps) {
  return (
    <svg viewBox="0 0 20 10" preserveAspectRatio="xMidYMid slice" {...props}>
      <rect width="20" height="10" className="fill-flag-et-yellow" />
      <rect width="20" height="3.34" className="fill-flag-et-green" />
      <rect y="6.66" width="20" height="3.34" className="fill-flag-et-red" />
      <circle cx="10" cy="5" r="2.9" className="fill-flag-et-blue" />
      <path
        d="M10 2.8 11.29 6.78 7.91 4.32h4.18L8.71 6.78Z"
        fill="none"
        strokeWidth="0.32"
        className="stroke-flag-et-yellow"
      />
    </svg>
  );
}

const LOCALE_FLAGS: Record<AppLocale, ComponentType<FlagProps>> = { en: UsFlag, am: EthiopiaFlag };

/** The language toggle: an icon-sized button around one flag, like the theme toggle beside it. */
export const languageToggleClassName = cn(buttonVariants({ variant: "tint", size: "icon" }), "hue-teal");

/**
 * The current language's flag. Decorative: the toggle around it names the
 * language it switches to.
 */
export function LanguageFlag({ locale }: { locale: AppLocale }) {
  const Flag = LOCALE_FLAGS[locale];
  return <Flag aria-hidden className="block h-4 w-6 rounded-[2px]" />;
}
