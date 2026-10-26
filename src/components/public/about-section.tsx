import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { CmsImage, type ImageView } from "@/features/cms/components/public/cms-image";
import { Markup } from "@/features/cms/markup";
import { Link } from "@/i18n/navigation";
import { HOME_SECTIONS } from "@/features/content/home-sections";
import { samplePhotos } from "@/features/content/sample-photos";
import type { ResolvedText } from "@/lib/localization/translations";
import { PhotoSlot } from "./photo-slot";

const ABOUT_IMAGE_SIZES = "(min-width: 48rem) 40vw, 24rem";

type AboutSectionProps = {
  title: ResolvedText;
  body: ResolvedText;
  photoSubject: ResolvedText;
  image?: ImageView | null;
  /** The body uses the CMS formatting syntax (otherwise plain text). */
  formatted?: boolean;
  /** Placeholder copy: say that the chef's own words are still to come. */
  pending?: boolean;
  /** Link to the full About page once it is published. */
  moreHref?: string | null;
};

export async function AboutSection({
  title,
  body,
  photoSubject,
  image,
  formatted,
  pending = true,
  moreHref,
}: AboutSectionProps) {
  const t = await getTranslations("Home");

  return (
    <section id={HOME_SECTIONS.about} aria-labelledby="about-heading" className="py-14 md:py-20">
      <div className="page-container grid items-center gap-12 md:grid-cols-[0.8fr_1fr] lg:gap-20">
        {image ? (
          <div className="aspect-[4/5] w-full max-w-sm overflow-hidden rounded-2xl bg-surface-muted md:max-w-none">
            <CmsImage image={image} sizes={ABOUT_IMAGE_SIZES} />
          </div>
        ) : (
          <PhotoSlot
            subject={photoSubject}
            sample={samplePhotos.about}
            sizes={ABOUT_IMAGE_SIZES}
            className="aspect-[4/5] w-full max-w-sm md:max-w-none"
          />
        )}

        <div className="max-w-xl">
          <p className="eyebrow text-accent-ink">{t("aboutEyebrow")}</p>
          <h2 id="about-heading" className="mt-5 display-lg" lang={title.lang}>
            {title.text}
          </h2>
          <span aria-hidden className="mt-7 tilet-rule w-28 text-accent" />
          {formatted ? (
            <Markup text={body.text} lang={body.lang} headingBase={3} className="mt-7" />
          ) : (
            <p className="mt-7 text-lg text-muted-foreground" lang={body.lang}>
              {body.text}
            </p>
          )}
          {pending && (
            <p className="mt-8 inline-flex items-center gap-2 rounded-full border border-dashed border-border-strong px-4 py-2 text-xs font-semibold text-muted-foreground">
              <span aria-hidden className="size-1.5 rounded-full bg-terracotta" />
              {t("aboutPending")}
            </p>
          )}
          {moreHref && (
            <Link
              href={moreHref}
              className="group/more mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-ink underline-offset-4 hover:text-foreground hover:underline"
            >
              {t("aboutMore")}
              <ArrowRight
                aria-hidden
                className="size-4 transition-transform duration-200 motion-safe:group-hover/more:translate-x-0.5"
              />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
