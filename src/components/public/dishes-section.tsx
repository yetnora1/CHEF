import { getLocale, getTranslations } from "next-intl/server";
import { dishes } from "@/features/content/dishes";
import { samplePhotos } from "@/features/content/sample-photos";
import type { AppLocale } from "@/i18n/routing";
import { resolveLocalized } from "@/lib/localization/translations";
import { DishGrid, type DishCard } from "./dish-grid";

/**
 * Fasting and non-fasting Ethiopian dishes as a filterable grid of photo cards,
 * after the food stories. General facts about the cuisine (features/content/
 * dishes.ts) with openly licensed sample photographs, credited on /credits.
 */
export async function DishesSection() {
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations("Home");
  const other: AppLocale = locale === "am" ? "en" : "am";

  const cards: DishCard[] = dishes.map((dish) => {
    const photo = samplePhotos[dish.photo];
    const otherName = dish.name[other];
    return {
      key: dish.key,
      kind: dish.kind,
      name: resolveLocalized(dish.name, locale) ?? { text: dish.key },
      otherName: otherName ? { text: otherName, lang: other } : null,
      description: resolveLocalized(dish.description, locale) ?? { text: "" },
      image: (() => {
        const alt = resolveLocalized(photo.alt, locale);
        return { src: photo.src, alt: alt?.text ?? "", lang: alt?.lang };
      })(),
    };
  });

  return (
    <section aria-labelledby="dishes-heading" className="py-14 md:py-20">
      <div className="page-container">
        <div className="max-w-2xl">
          <p className="eyebrow text-accent-ink">{t("dishesEyebrow")}</p>
          <h2 id="dishes-heading" className="mt-5 display-lg">
            {t("dishesTitle")}
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">{t("dishesLede")}</p>
        </div>
        <DishGrid
          dishes={cards}
          labels={{
            filter: t("dishesFilter"),
            all: t("dishesAll"),
            fasting: t("dishesFasting"),
            nonFasting: t("dishesNonFasting"),
            showing: Array.from({ length: cards.length + 1 }, (_, count) => t("dishesShowing", { count })),
          }}
        />
      </div>
    </section>
  );
}
