import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { CmsImage, type ImageView } from "@/features/cms/components/public/cms-image";
import { Markup } from "@/features/cms/markup";
import { Link } from "@/i18n/navigation";
import { HOME_SECTIONS } from "@/features/content/home-sections";
import { getSiteMedia } from "@/features/cms/public-data";
import type { ResolvedText } from "@/lib/localization/translations";
import { cn } from "@/lib/utils";
import { FEATURE_MEDIA, FeatureRow } from "./feature-row";
import { PhotoSlot } from "./photo-slot";

const ABOUT_IMAGE_SIZES = "(min-width: 48rem) 40vw, 92vw";

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
  const [t, site] = await Promise.all([getTranslations("Home"), getSiteMedia()]);
  const photo = image ? null : site.slot("about");

  return (
    <FeatureRow
      id={HOME_SECTIONS.about}
      headingId="about-heading"
      eyebrow={{ text: t("aboutEyebrow") }}
      hue="hue-teal"
      title={title}
      media={
        image ? (
          <div className={cn("media-frame rounded-2xl", FEATURE_MEDIA)}>
            <CmsImage image={image} sizes={ABOUT_IMAGE_SIZES} />
          </div>
        ) : (
          photo !== null && (
            <PhotoSlot
              subject={photoSubject}
              photo={photo}
              sizes={ABOUT_IMAGE_SIZES}
              className={FEATURE_MEDIA}
            />
          )
        )
      }
    >
      {formatted ? (
        <Markup text={body.text} lang={body.lang} headingBase={3} className="mt-5" />
      ) : (
        <p className="mt-5 text-lg text-muted-foreground" lang={body.lang}>
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
    </FeatureRow>
  );
}
