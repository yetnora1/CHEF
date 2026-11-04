import type { ReactNode } from "react";
import type { ResolvedText } from "@/lib/localization/translations";
import { cn } from "@/lib/utils";

/**
 * The picture's shape: square on phones and from lg, so the card is not much taller
 * than its text; 4:5 on tablets, where the narrower text column runs longer. The
 * 4:5 photos lose only a tenth top and bottom to the square crop.
 */
export const FEATURE_MEDIA = "aspect-square w-full md:aspect-[4/5] lg:aspect-square";

type FeatureRowProps = {
  /** The section's in-page anchor, if it has one. */
  id?: string;
  headingId: string;
  eyebrow: ResolvedText;
  /** The eyebrow chip's colour: a `hue-*` utility. */
  hue: string;
  title: ResolvedText;
  /** The picture, shaped with FEATURE_MEDIA, filling its side of the card; without one the text takes the card. */
  media: ReactNode;
  /** Picture on the right from md up (rows alternate down the page). */
  mediaRight?: boolean;
  /** The body text and anything after it. */
  children: ReactNode;
};

/**
 * An image-and-text row as one glass card: the photo fills one side, inset like a
 * mat (the card's rounded-3xl around the photo's rounded-2xl), and the text sits
 * centred on the other, under a coloured chip. Phones stack the photo first.
 */
export function FeatureRow({
  id,
  headingId,
  eyebrow,
  hue,
  title,
  media,
  mediaRight,
  children,
}: FeatureRowProps) {
  return (
    <section id={id} aria-labelledby={headingId} className="py-5 md:py-8">
      <div className="page-container">
        <div
          className={cn(
            "grid items-center rounded-3xl border border-border glass p-2",
            media && (mediaRight ? "md:grid-cols-[1.15fr_0.85fr]" : "md:grid-cols-[0.85fr_1.15fr]"),
          )}
        >
          {media && <div className={cn(mediaRight && "md:order-2")}>{media}</div>}
          <div
            className={cn("px-4 pt-7 pb-6 sm:px-8 md:px-10 md:py-10 lg:px-16", mediaRight && "md:order-1")}
          >
            <p
              className={cn("w-fit rounded-full tint-chip px-3 py-1 text-xs font-semibold", hue)}
              lang={eyebrow.lang}
            >
              {eyebrow.text}
            </p>
            <h2 id={headingId} className="mt-5 display-lg" lang={title.lang}>
              {title.text}
            </h2>
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
