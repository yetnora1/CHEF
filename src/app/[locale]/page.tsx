import { getLocale, getTranslations } from "next-intl/server";
import { AboutSection } from "@/components/public/about-section";
import { FoodReel } from "@/components/public/food-reel";
import { Hero } from "@/components/public/hero";
import { ServicesSection, type ServiceCard } from "@/components/public/services-section";
import { StorySection } from "@/components/public/story-section";
import { getPublicNavigation, getPublicPage, getPublicServices } from "@/features/cms/public-data";
import { pageContent, serviceCards } from "@/features/cms/public-views";
import { contactHrefFor } from "@/features/contact/service-subject";
import { foodStories } from "@/features/content/food-stories";
import { homeContent } from "@/features/content/home-content";
import { samplePhotos } from "@/features/content/sample-photos";
import { sampleVideos } from "@/features/content/sample-videos";
import { resolveLocalized, type Localized, type ResolvedText } from "@/lib/localization/translations";

/*
 * Homepage: published CMS content where it exists (the "home" page sections
 * and published services), section by section; otherwise the labelled
 * placeholders from src/features/content/home-content.ts, as before Stage 3.
 */
export default async function HomePage() {
  const locale = await getLocale();
  const [page, services, navigation, tHome] = await Promise.all([
    getPublicPage("home").catch(() => null),
    getPublicServices().catch(() => null),
    getPublicNavigation().catch(() => null),
    getTranslations("Home"),
  ]);

  // Placeholder content always has English, so the fallback never comes up empty.
  const placeholder = (value: Localized): ResolvedText => resolveLocalized(value, locale) ?? { text: "" };
  const content = pageContent(page, "home", locale);
  const field = (section: string, name: string): ResolvedText | null => {
    const value = content?.sections[section]?.[name];
    return value ? { text: value, lang: content.lang } : null;
  };
  const { hero, about, services: servicesCopy } = homeContent;

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
        contactHref: contactHrefFor(card.key),
        href: card.href,
        image: card.image,
      }))
    : servicesCopy.items.map((item) => ({
        slug: item.slug,
        title: placeholder(item.title),
        summary: placeholder(item.summary),
        photoSubject: placeholder(item.photoSubject),
        contactHref: contactHrefFor(item.slug),
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
      <FoodReel
        clips={sampleVideos}
        labels={{ region: tHome("videosLabel"), pause: tHome("videosPause"), play: tHome("videosPlay") }}
      />
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
          pending={false}
          photoSubject={placeholder(about.photoSubject)}
          moreHref={navigation?.[locale].about ? "/about" : null}
        />
      )}
      {foodStories.map((story, index) => (
        <StorySection
          key={story.key}
          id={`story-${story.key}`}
          eyebrow={placeholder(story.eyebrow)}
          title={placeholder(story.title)}
          body={placeholder(story.body)}
          photo={samplePhotos[story.photo]}
          // "Meet Chef Harena" has its image on the left, so these start on the right.
          imageRight={index % 2 === 0}
        />
      ))}
      <ServicesSection
        title={field("services", "heading") ?? placeholder(servicesCopy.title)}
        lede={field("services", "lede") ?? placeholder(servicesCopy.lede)}
        services={cards}
      />
    </>
  );
}
