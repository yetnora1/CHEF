import { Camera } from "lucide-react";
import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import type { SitePhoto } from "@/features/content/site-photo";
import { resolveLocalized, type ResolvedText } from "@/lib/localization/translations";
import { cn } from "@/lib/utils";

type PhotoSlotProps = {
  /** Describes the photograph this slot is waiting for. */
  subject: ResolvedText;
  /** CHEF SIS's own photograph or an openly licensed sample (credited on /credits). */
  photo?: SitePhoto | null;
  /** `sizes` for the photo (see docs/DESIGN_SYSTEM.md → Images). */
  sizes?: string;
  preload?: boolean;
  className?: string;
  /** Extra classes for the photo itself, e.g. a hover zoom. */
  imageClassName?: string;
};

/**
 * Fills a photo slot until a photo is published through the media library: one
 * of CHEF SIS's own photographs or an openly licensed sample, or, where there is
 * neither, a labelled placeholder naming the photograph to supply. Photos carry
 * no caption; the samples' photographers, licences and the note that they are
 * not the chef's work are on the credits page (/credits, linked from the footer).
 */
export async function PhotoSlot({
  subject,
  photo,
  sizes = "100vw",
  preload,
  className,
  imageClassName,
}: PhotoSlotProps) {
  const t = await getTranslations("Common");

  if (photo) {
    const alt = resolveLocalized(photo.alt, await getLocale());
    return (
      <figure className={cn("relative overflow-hidden rounded-2xl bg-surface-muted", className)}>
        <Image
          src={photo.src}
          alt={alt?.text ?? ""}
          lang={alt?.lang}
          sizes={sizes}
          preload={preload}
          placeholder="blur"
          className={cn("h-full w-full object-cover", imageClassName)}
        />
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
