import { ArrowDown, ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { HOME_SECTIONS } from "@/features/content/home-sections";
import { Button } from "@/components/ui/button";
import { CmsImage, type ImageView } from "@/features/cms/components/public/cms-image";
import { samplePhotos } from "@/features/content/sample-photos";
import { Link } from "@/i18n/navigation";
import type { ResolvedText } from "@/lib/localization/translations";
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
  const t = await getTranslations("Home");

  return (
    <section aria-labelledby="hero-heading" className="relative overflow-hidden">
      <div className="page-container grid items-center gap-10 pt-10 pb-12 md:pt-14 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16 lg:pt-16 lg:pb-16">
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
            <Button asChild size="lg">
              <Link href="/book">
                {t("heroPrimaryCta")}
                <ArrowRight aria-hidden className="motion-safe:group-hover/button:translate-x-0.5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={{ pathname: "/", hash: HOME_SECTIONS.services }}>
                {t("heroSecondaryCta")}
                <ArrowDown aria-hidden className="motion-safe:group-hover/button:translate-y-0.5" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="mx-auto w-full max-w-sm lg:max-w-none">
          {image ? (
            <div className="aspect-[4/5] w-full overflow-hidden rounded-2xl bg-surface-muted">
              <CmsImage image={image} sizes={HERO_IMAGE_SIZES} preload />
            </div>
          ) : (
            <PhotoSlot
              subject={photoSubject}
              sample={samplePhotos.hero}
              sizes={HERO_IMAGE_SIZES}
              preload
              className="aspect-[4/5] w-full"
            />
          )}
        </div>
      </div>

      <div aria-hidden className="bg-band py-2.5 text-band-accent">
        <span className="tilet-band" />
      </div>
    </section>
  );
}
