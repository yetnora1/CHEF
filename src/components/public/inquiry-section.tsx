import { Info } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { HOME_SECTIONS } from "@/features/content/home-sections";
import type { ResolvedText } from "@/lib/localization/translations";

type InquirySectionProps = {
  title: ResolvedText;
  body: ResolvedText;
};

/**
 * The event inquiry call to action. The inquiry form itself is the next stage;
 * until then this section says so plainly instead of showing a dead button.
 */
export async function InquirySection({ title, body }: InquirySectionProps) {
  const t = await getTranslations("Home");

  return (
    <section
      id={HOME_SECTIONS.inquire}
      aria-labelledby="inquire-heading"
      className="relative isolate overflow-hidden bg-band text-band-foreground"
    >
      <span aria-hidden className="absolute inset-0 -z-10 lattice-backdrop text-band-accent opacity-[0.07]" />
      <span aria-hidden className="tilet-band text-band-accent" />
      <div className="page-container grid gap-10 py-20 md:py-28 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
        <div className="max-w-2xl">
          <p className="eyebrow text-band-accent">{t("inquiryEyebrow")}</p>
          <h2 id="inquire-heading" className="mt-5 display-lg" lang={title.lang}>
            {title.text}
          </h2>
          <p className="mt-6 text-lg text-band-muted" lang={body.lang}>
            {body.text}
          </p>
        </div>
        <p className="flex items-start gap-3 rounded-2xl border border-band-muted/30 bg-white/5 p-5 text-sm text-band-foreground lg:justify-self-end">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-band-accent" />
          {t("inquiryStatus")}
        </p>
      </div>
      <span aria-hidden className="tilet-band text-band-accent" />
    </section>
  );
}
