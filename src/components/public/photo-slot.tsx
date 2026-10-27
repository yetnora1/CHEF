import { Camera } from "lucide-react";
import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import type { SamplePhoto } from "@/features/content/sample-photos";
import { resolveLocalized, type ResolvedText } from "@/lib/localization/translations";
import { cn } from "@/lib/utils";

type PhotoSlotProps = {
  /** Describes the photograph this slot is waiting for. */
  subject: ResolvedText;
  /** An openly licensed stand-in, shown labelled and credited. */
  sample?: SamplePhoto | null;
  /** `sizes` for the sample photo (see docs/DESIGN_SYSTEM.md → Images). */
  sizes?: string;
  preload?: boolean;
  className?: string;
  /** Extra classes for the sample photo itself, e.g. a hover zoom. */
  imageClassName?: string;
};

/**
 * Fills a photo slot until Chef Harena's own photography is published: a
 * sample photograph labelled "Sample photo" with its credit, or, where there
 * is no sample, a labelled placeholder naming the photograph to supply.
 * Neither can be mistaken for the chef's work.
 */
export async function PhotoSlot({
  subject,
  sample,
  sizes = "100vw",
  preload,
  className,
  imageClassName,
}: PhotoSlotProps) {
  const t = await getTranslations("Common");

  if (sample) {
    const alt = resolveLocalized(sample.alt, await getLocale());
    return (
      <figure className={cn("relative overflow-hidden rounded-2xl bg-surface-muted", className)}>
        <Image
          src={sample.src}
          alt={alt?.text ?? ""}
          lang={alt?.lang}
          sizes={sizes}
          preload={preload}
          placeholder="blur"
          className={cn("h-full w-full object-cover", imageClassName)}
        />
        {/* Above a linked card's full-card overlay, so the credit link stays clickable. */}
        <figcaption className="absolute bottom-3 left-3 z-10 max-w-[calc(100%-1.5rem)] rounded-md bg-background/90 px-2.5 py-1 text-[0.7rem] leading-snug text-foreground shadow-xs">
          <span className="font-semibold">{t("samplePhoto")}</span>
          {" · "}
          {/* The source page names the photographer and links the licence. */}
          <a
            href={sample.credit.source}
            lang="en"
            className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {sample.credit.author}, {sample.credit.license}
          </a>
        </figcaption>
      </figure>
    );
  }

  return (
    <figure
      role="img"
      aria-label={`${t("photoPlaceholder")}: ${subject.text}`}
      className={cn(
        "relative isolate flex overflow-hidden rounded-2xl bg-surface-muted text-muted-foreground",
        className,
      )}
    >
      <span aria-hidden className="absolute inset-0 -z-10 dot-texture" />
      <span
        aria-hidden
        className="absolute inset-3 rounded-xl border border-dashed border-border-strong/45"
      />
      <span className="m-auto flex max-w-[15rem] flex-col items-center gap-2.5 px-6 py-10 text-center">
        <Camera aria-hidden className="size-5 text-accent-ink" strokeWidth={1.75} />
        <span className="eyebrow text-xs text-foreground/75">{t("photoPlaceholder")}</span>
        <span className="text-sm leading-snug">
          {t("photoPlaceholderIntended", { subject: subject.text })}
        </span>
      </span>
    </figure>
  );
}
