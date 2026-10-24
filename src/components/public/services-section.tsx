import { getTranslations } from "next-intl/server";
import { CmsImage, type ImageView } from "@/features/cms/components/public/cms-image";
import { Link } from "@/i18n/navigation";
import { HOME_SECTIONS } from "@/features/content/home-sections";
import type { ResolvedText } from "@/lib/localization/translations";
import { PhotoSlot } from "./photo-slot";

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

export async function ServicesSection({ title, lede, services }: ServicesSectionProps) {
  const t = await getTranslations("Home");

  return (
    <section
      id={HOME_SECTIONS.services}
      aria-labelledby="services-heading"
      className="border-y border-border bg-surface py-20 md:py-28"
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
        <ul className="mt-14 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((service, index) => (
            <li key={service.slug} className="relative flex flex-col">
              {service.image ? (
                <div className="aspect-[4/3] w-full overflow-hidden rounded-[1.75rem] bg-surface-muted">
                  <CmsImage
                    image={service.image}
                    sizes="(min-width: 64rem) 18rem, (min-width: 40rem) 50vw, 100vw"
                  />
                </div>
              ) : (
                <PhotoSlot subject={service.photoSubject} className="aspect-[4/3] w-full" />
              )}
              <p aria-hidden className="mt-6 font-display text-sm text-accent-ink tabular-nums">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-2 display-md" lang={service.title.lang}>
                {service.href ? (
                  <Link href={service.href} className="after:absolute after:inset-0 hover:underline">
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
