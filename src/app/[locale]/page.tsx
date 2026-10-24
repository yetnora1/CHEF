import { getLocale } from "next-intl/server";
import { AboutSection } from "@/components/public/about-section";
import { Hero } from "@/components/public/hero";
import { InquirySection } from "@/components/public/inquiry-section";
import { ServicesSection } from "@/components/public/services-section";
import { homeContent } from "@/features/content/home-content";
import { resolveLocalized, type Localized, type ResolvedText } from "@/lib/localization/translations";

export default async function HomePage() {
  const locale = await getLocale();
  // Placeholder content always has English, so the fallback never comes up empty.
  const text = (value: Localized): ResolvedText => resolveLocalized(value, locale) ?? { text: "" };
  const { hero, about, services, inquiry } = homeContent;

  return (
    <>
      <Hero
        eyebrow={text(hero.eyebrow)}
        headline={text(hero.headline)}
        lede={text(hero.lede)}
        photoSubject={text(hero.photoSubject)}
      />
      <AboutSection
        title={text(about.title)}
        body={text(about.body)}
        photoSubject={text(about.photoSubject)}
      />
      <ServicesSection
        title={text(services.title)}
        lede={text(services.lede)}
        services={services.items.map((item) => ({
          slug: item.slug,
          title: text(item.title),
          summary: text(item.summary),
          photoSubject: text(item.photoSubject),
          confirmed: item.confirmed,
        }))}
      />
      <InquirySection title={text(inquiry.title)} body={text(inquiry.body)} />
    </>
  );
}
