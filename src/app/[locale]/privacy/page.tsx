import { FileWarning } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { PRIVACY_LAST_UPDATED, privacyContent } from "@/features/content/privacy-content";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations("Privacy");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: `/${locale}/privacy`, languages: { en: "/en/privacy", am: "/am/privacy" } },
  };
}

export default async function PrivacyPage() {
  const locale = await getLocale();
  const t = await getTranslations("Privacy");
  const content = privacyContent[locale];
  const updated = new Intl.DateTimeFormat(locale === "am" ? "am-ET" : "en-GB", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${PRIVACY_LAST_UPDATED}T00:00:00Z`));

  return (
    <article className="page-container max-w-3xl py-14 md:py-20">
      <p className="eyebrow text-accent-ink">{t("eyebrow")}</p>
      <h1 className="mt-5 display-lg">{content.title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{t("lastUpdated", { date: updated })}</p>

      <div
        role="note"
        className="mt-8 flex items-start gap-3 rounded-2xl border border-dashed border-warning/60 p-5 text-sm leading-relaxed"
      >
        <FileWarning aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="space-y-2">
          <p>{t("draftNotice")}</p>
          {content.translationNote && <p>{content.translationNote}</p>}
        </div>
      </div>

      <p className="mt-8 text-lg text-muted-foreground">{content.intro}</p>

      <div className="mt-10 space-y-10">
        {content.sections.map((section) => (
          <section key={section.id} aria-labelledby={`privacy-${section.id}`} className="space-y-3">
            <h2 id={`privacy-${section.id}`} className="display-md">
              {section.heading}
            </h2>
            {section.paragraphs?.map((p) => (
              <p key={p}>{p}</p>
            ))}
            {section.items && (
              <ul className="list-disc space-y-1.5 pl-6 marker:text-accent-ink">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
            {section.after?.map((p) => (
              <p key={p}>{p}</p>
            ))}
            {section.review && (
              <p className="rounded-xl bg-surface-muted px-4 py-3 text-sm">
                <span className="font-semibold text-terracotta">{t("reviewTag")}: </span>
                {section.review}
              </p>
            )}
          </section>
        ))}
      </div>
    </article>
  );
}
