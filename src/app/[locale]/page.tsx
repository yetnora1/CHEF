import { getLocale } from "next-intl/server";
import { AboutSection } from "@/components/public/about-section";
import { Hero } from "@/components/public/hero";
import { InquirySection } from "@/components/public/inquiry-section";
import { ServicesSection, type ServiceCard } from "@/components/public/services-section";
import { getPublicNavigation, getPublicPage, getPublicServices } from "@/features/cms/public-data";
import { pageContent, serviceCards } from "@/features/cms/public-views";
import { homeContent } from "@/features/content/home-content";
import { resolveLocalized, type Localized, type ResolvedText } from "@/lib/localization/translations";

/*
 * Homepage: published CMS content where it exists (the "home" page sections
 * and published services), section by section; otherwise the labelled
 * placeholders from src/features/content/home-content.ts, as before Stage 3.
 */
export default async function HomePage() {
  const locale = await getLocale();
  const [page, services, navigation] = await Promise.all([
    getPublicPage("home").catch(() => null),
    getPublicServices().catch(() => null),
    getPublicNavigation().catch(() => null),
  ]);

  // Placeholder content always has English, so the fallback never comes up empty.
  const placeholder = (value: Localized): ResolvedText => resolveLocalized(value, locale) ?? { text: "" };
  const content = pageContent(page, "home", locale);
  const field = (section: string, name: string): ResolvedText | null => {
    const value = content?.sections[section]?.[name];
    return value ? { text: value, lang: content.lang } : null;
  };
  const { hero, about, services: servicesCopy, inquiry } = homeContent;

  const heroHeadline = field("hero", "headline");
  const aboutBody = field("about", "body");
  const aboutTitle = field("about", "heading");
  const published = serviceCards(services ?? [], locale);
  const cards: ServiceCard[] = published.length
    ? published.map((card) => ({
        slug: card.key,
        title: card.title,
        summary: card.summary ?? { text: "" },
        photoSubject: card.title,
        confirmed: true,
        href: card.href,
        image: card.image,
      }))
    : servicesCopy.items.map((item) => ({
        slug: item.slug,
        title: placeholder(item.title),
        summary: placeholder(item.summary),
        photoSubject: placeholder(item.photoSubject),
        confirmed: item.confirmed,
      }));

  return (
    <>
      {heroHeadline ? (
        <Hero
          eyebrow={field("hero", "eyebrow")}
          headline={heroHeadline}
          lede={field("hero", "lede")}
          photoSubject={placeholder(hero.photoSubject)}
          image={content?.image("hero")}
        />
      ) : (
        <Hero
          eyebrow={placeholder(hero.eyebrow)}
          headline={placeholder(hero.headline)}
          lede={placeholder(hero.lede)}
          photoSubject={placeholder(hero.photoSubject)}
        />
      )}
      {aboutTitle || aboutBody ? (
        <AboutSection
          title={aboutTitle ?? placeholder(about.title)}
          body={aboutBody ?? { text: "" }}
          formatted
          pending={false}
          photoSubject={placeholder(about.photoSubject)}
          image={content?.image("about")}
          moreHref={navigation?.[locale].about ? "/about" : null}
        />
      ) : (
        <AboutSection
          title={placeholder(about.title)}
          body={placeholder(about.body)}
          photoSubject={placeholder(about.photoSubject)}
          moreHref={navigation?.[locale].about ? "/about" : null}
        />
      )}
      <ServicesSection
        title={field("services", "heading") ?? placeholder(servicesCopy.title)}
        lede={field("services", "lede") ?? placeholder(servicesCopy.lede)}
        services={cards}
      />
      <InquirySection
        title={field("inquiry", "heading") ?? placeholder(inquiry.title)}
        body={field("inquiry", "body") ?? placeholder(inquiry.body)}
      />
    </>
  );
}
