import { ArrowDown, ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { HOME_SECTIONS } from "@/features/content/home-sections";
import { Button } from "@/components/ui/button";
import { CmsImage, type ImageView } from "@/features/cms/components/public/cms-image";
import { getSiteMedia } from "@/features/cms/public-data";
import { Link } from "@/i18n/navigation";
import type { ResolvedText } from "@/lib/localization/translations";
import { cn } from "@/lib/utils";
import { PhotoSlot } from "./photo-slot";

const HERO_IMAGE_SIZES = "(min-width: 64rem) 30rem, 24rem";

type HeroProps = {
  eyebrow: ResolvedText | null;
  headline: ResolvedText;
  lede: ResolvedText | null;
  photoSubject: ResolvedText;
  /** A published image; the labelled placeholder is shown otherwise. */
  image?: ImageView | null;
};

export async function Hero({ eyebrow, headline, lede, photoSubject, image }: HeroProps) {
  const [t, site] = await Promise.all([getTranslations("Home"), getSiteMedia()]);
  const photo = image ? null : site.slot("hero");
  const hasPicture = Boolean(image) || photo !== null;

  return (
    <section aria-labelledby="hero-heading" className="relative overflow-hidden">
      <div
        className={cn(
          "page-container grid items-center gap-10 pt-10 pb-12 md:pt-14 lg:gap-16 lg:pt-16 lg:pb-16",
          hasPicture && "lg:grid-cols-[1.15fr_0.85fr]",
        )}
      >
        <div className="max-w-2xl">
          {eyebrow && (
            <p className="eyebrow text-accent-ink" lang={eyebrow.lang}>
              {eyebrow.text}
            </p>
          )}
          <h1 id="hero-heading" className="mt-6 display-xl text-foreground" lang={headline.lang}>
            {headline.text}
          </h1>
          {lede && (
            <p className="mt-6 max-w-xl text-lg text-muted-foreground" lang={lede.lang}>
              {lede.text}
            </p>
          )}
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" variant="primary" className="w-full sm:w-auto">
              <Link href="/book">
                {t("heroPrimaryCta")}
                <ArrowRight aria-hidden className="motion-safe:group-hover/button:translate-x-0.5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <Link href={{ pathname: "/", hash: HOME_SECTIONS.services }}>
                {t("heroSecondaryCta")}
                <ArrowDown aria-hidden className="motion-safe:group-hover/button:translate-y-0.5" />
              </Link>
            </Button>
          </div>
        </div>

        {hasPicture && (
          <div className="mx-auto w-full max-w-sm media-mat lg:max-w-none">
            {image ? (
              <div className="media-frame aspect-[4/5] w-full rounded-2xl">
                <CmsImage image={image} sizes={HERO_IMAGE_SIZES} preload />
              </div>
            ) : (
              <PhotoSlot
                subject={photoSubject}
                photo={photo}
                sizes={HERO_IMAGE_SIZES}
                preload
                className="aspect-[4/5] w-full"
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}
