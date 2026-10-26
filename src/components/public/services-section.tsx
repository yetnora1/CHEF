import { getTranslations } from "next-intl/server";
import { CmsImage, type ImageView } from "@/features/cms/components/public/cms-image";
import { Link } from "@/i18n/navigation";
import { HOME_SECTIONS } from "@/features/content/home-sections";
import { samplePhotoFor } from "@/features/content/sample-photos";
import type { ResolvedText } from "@/lib/localization/translations";
import { cn } from "@/lib/utils";
import { PhotoSlot } from "./photo-slot";

const SERVICE_IMAGE_SIZES = "(min-width: 64rem) 18rem, (min-width: 40rem) 50vw, 100vw";
// A linked card's photo zooms slightly while the card is hovered.
const CARD_IMAGE_HOVER =
  "transition-transform duration-260 ease-out motion-safe:group-hover/card:scale-[1.03]";

export type ServiceCard = {
  slug: string;
  title: ResolvedText;
  summary: ResolvedText;
  photoSubject: ResolvedText;
  confirmed: boolean;
  /** Published services link to their page and may have an image. */
  href?: string;
  image?: ImageView | null;
};

type ServicesSectionProps = {
  title: ResolvedText;
  lede: ResolvedText;
  services: ServiceCard[];
};

/** Columns that fill whole rows for the usual counts (no empty slot beside three services). */
function desktopColumns(count: number): string {
  if (count % 4 === 0) return "lg:grid-cols-4";
  if (count <= 2) return "lg:grid-cols-2";
  return "lg:grid-cols-3";
}

export async function ServicesSection({ title, lede, services }: ServicesSectionProps) {
  const t = await getTranslations("Home");

  return (
    <section
      id={HOME_SECTIONS.services}
      aria-labelledby="services-heading"
      className="border-y border-border bg-surface py-14 md:py-20"
    >
      <div className="page-container">
        <div className="grid gap-6 md:grid-cols-[1fr_1fr] md:items-end">
          <div>
            <p className="eyebrow text-accent-ink">{t("servicesEyebrow")}</p>
            <h2 id="services-heading" className="mt-5 display-lg" lang={title.lang}>
              {title.text}
            </h2>
          </div>
          <p className="max-w-lg text-muted-foreground md:justify-self-end" lang={lede.lang}>
            {lede.text}
          </p>
        </div>

        {/* Placeholder cards are not links; published services link to their page. */}
        <ul className={cn("mt-10 grid gap-x-6 gap-y-10 sm:grid-cols-2", desktopColumns(services.length))}>
          {services.map((service) => (
            <li key={service.slug} className="group/card relative flex flex-col">
              {service.image ? (
                <div className="aspect-[4/3] w-full overflow-hidden rounded-2xl bg-surface-muted">
                  <CmsImage
                    image={service.image}
                    sizes={SERVICE_IMAGE_SIZES}
                    className={service.href ? CARD_IMAGE_HOVER : undefined}
                  />
                </div>
              ) : (
                <PhotoSlot
                  subject={service.photoSubject}
                  sample={samplePhotoFor(service.slug)}
                  sizes={SERVICE_IMAGE_SIZES}
                  className="aspect-[4/3] w-full"
                />
              )}
              <h3 className="mt-5 display-md" lang={service.title.lang}>
                {service.href ? (
                  <Link
                    href={service.href}
                    className="underline-offset-4 group-hover/card:underline after:absolute after:inset-0"
                  >
                    {service.title.text}
                  </Link>
                ) : (
                  service.title.text
                )}
              </h3>
              <p className="mt-3 text-sm text-muted-foreground" lang={service.summary.lang}>
                {service.summary.text}
              </p>
              {!service.confirmed && (
                <p className="mt-4 inline-flex w-fit items-center gap-2 rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold text-terracotta">
                  <span aria-hidden className="size-1.5 rounded-full bg-terracotta" />
                  {t("serviceToBeConfirmed")}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
