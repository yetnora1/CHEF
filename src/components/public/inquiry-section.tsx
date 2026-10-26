import { ArrowRight, Info } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { HOME_SECTIONS } from "@/features/content/home-sections";
import { Link } from "@/i18n/navigation";
import type { ResolvedText } from "@/lib/localization/translations";

type InquirySectionProps = {
  title: ResolvedText;
  body: ResolvedText;
};

/** The event inquiry call to action: a slim band linking to the inquiry form. */
export async function InquirySection({ title, body }: InquirySectionProps) {
  const t = await getTranslations("Home");

  return (
    <section
      id={HOME_SECTIONS.inquire}
      aria-labelledby="inquire-heading"
      className="bg-band text-band-foreground"
    >
      <div className="page-container flex flex-col gap-5 py-8 md:flex-row md:items-center md:justify-between md:gap-10 md:py-10">
        <div className="max-w-2xl">
          <h2 id="inquire-heading" className="display-md" lang={title.lang}>
            {title.text}
          </h2>
          <p className="mt-2 text-band-muted" lang={body.lang}>
            {body.text}
          </p>
        </div>
        <div className="shrink-0 space-y-2">
          <Button asChild variant="band">
            <Link href="/book">
              {t("inquiryCta")}
              <ArrowRight aria-hidden className="motion-safe:group-hover/button:translate-x-0.5" />
            </Link>
          </Button>
          <p className="flex items-center gap-1.5 text-xs text-band-muted">
            <Info aria-hidden className="size-3.5 shrink-0 text-band-accent" />
            {t("inquiryNote")}
          </p>
        </div>
      </div>
    </section>
  );
}
