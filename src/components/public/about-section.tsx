import { getTranslations } from "next-intl/server";
import { HOME_SECTIONS } from "@/features/content/home-sections";
import type { ResolvedText } from "@/lib/localization/translations";
import { PhotoSlot } from "./photo-slot";

type AboutSectionProps = {
  title: ResolvedText;
  body: ResolvedText;
  photoSubject: ResolvedText;
};

export async function AboutSection({ title, body, photoSubject }: AboutSectionProps) {
  const t = await getTranslations("Home");

  return (
    <section id={HOME_SECTIONS.about} aria-labelledby="about-heading" className="py-20 md:py-28">
      <div className="page-container grid items-center gap-12 md:grid-cols-[0.8fr_1fr] lg:gap-20">
        <PhotoSlot subject={photoSubject} className="aspect-[4/5] w-full max-w-sm md:max-w-none" />

        <div className="max-w-xl">
          <p className="eyebrow text-accent-ink">{t("aboutEyebrow")}</p>
          <h2 id="about-heading" className="mt-5 display-lg" lang={title.lang}>
            {title.text}
          </h2>
          <span aria-hidden className="mt-7 tilet-rule w-28 text-accent" />
          <p className="mt-7 text-lg text-muted-foreground" lang={body.lang}>
            {body.text}
          </p>
          <p className="mt-8 inline-flex items-center gap-2 rounded-full border border-dashed border-border-strong px-4 py-2 text-xs font-semibold text-muted-foreground">
            <span aria-hidden className="size-1.5 rounded-full bg-terracotta" />
            {t("aboutPending")}
          </p>
        </div>
      </div>
    </section>
  );
}
