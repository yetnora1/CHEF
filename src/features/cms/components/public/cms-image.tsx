import Image from "next/image";
import type { AppLocale } from "@/i18n/routing";
import { resolveLocalized } from "@/lib/localization/translations";
import { cn } from "@/lib/utils";
import { publicImageUrl } from "../../media-urls";
import type { PublicImage } from "../../public-data";

/**
 * An image ready to render: public images go through the optimiser (/media is
 * an allowed local pattern); admin previews use the authenticated file route,
 * which the optimiser cannot fetch, so they are unoptimised.
 */
export type ImageView = {
  src: string;
  width: number;
  height: number;
  alt: string;
  /** Set when the alt text is a fallback in another language. */
  altLang?: AppLocale;
  credit?: string | null;
  unoptimized?: boolean;
};

export function publicImageView(image: PublicImage | null | undefined, locale: AppLocale): ImageView | null {
  if (!image) return null;
  const alt = resolveLocalized(image.alt, locale);
  return {
    src: publicImageUrl(image.path),
    width: image.width,
    height: image.height,
    alt: alt?.text ?? "",
    altLang: alt?.lang,
    credit: image.credit,
  };
}

export function CmsImage({
  image,
  sizes,
  className,
  preload,
}: {
  image: ImageView;
  sizes: string;
  className?: string;
  preload?: boolean;
}) {
  return (
    <Image
      src={image.src}
      width={image.width}
      height={image.height}
      alt={image.alt}
      lang={image.altLang}
      sizes={sizes}
      preload={preload}
      unoptimized={image.unoptimized}
      className={cn("h-full w-full object-cover", className)}
    />
  );
}

/** An image with its credit, when one is recorded; a feature image sits in a glass mat. */
export function CmsFigure({
  image,
  sizes,
  className,
  frameClassName,
  creditLabel,
  preload,
  matted,
}: {
  image: ImageView;
  sizes: string;
  className?: string;
  frameClassName?: string;
  creditLabel: string;
  preload?: boolean;
  matted?: boolean;
}) {
  const frame = (
    <div className={cn("media-frame rounded-2xl", frameClassName)}>
      <CmsImage image={image} sizes={sizes} preload={preload} />
    </div>
  );
  return (
    <figure className={className}>
      {matted ? <div className="media-mat">{frame}</div> : frame}
      {image.credit && (
        <figcaption className="mt-2 text-xs text-muted-foreground">
          {creditLabel}: {image.credit}
        </figcaption>
      )}
    </figure>
  );
}
