import { ArrowDown, ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { HOME_SECTIONS } from "@/features/content/home-sections";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { ResolvedText } from "@/lib/localization/translations";
import { PhotoSlot } from "./photo-slot";

type HeroProps = {
  eyebrow: ResolvedText;
  headline: ResolvedText;
  lede: ResolvedText;
  photoSubject: ResolvedText;
};

export async function Hero({ eyebrow, headline, lede, photoSubject }: HeroProps) {
  const t = await getTranslations("Home");

  return (
    <section aria-labelledby="hero-heading" className="relative overflow-hidden">
      <div className="page-container grid items-center gap-12 pt-12 pb-16 md:pt-16 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16 lg:pt-20 lg:pb-24">
        <div className="max-w-2xl">
          <p className="eyebrow text-accent-ink" lang={eyebrow.lang}>
            {eyebrow.text}
          </p>
          <h1 id="hero-heading" className="mt-6 display-xl text-foreground" lang={headline.lang}>
            {headline.text}
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground" lang={lede.lang}>
            {lede.text}
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/book">
                {t("heroPrimaryCta")}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={{ pathname: "/", hash: HOME_SECTIONS.services }}>
                {t("heroSecondaryCta")}
                <ArrowDown aria-hidden />
              </Link>
            </Button>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[18rem] sm:max-w-sm lg:max-w-none">
          {/* Offset gold outline echoing the arch. */}
          <span
            aria-hidden
            className="absolute inset-0 translate-x-4 translate-y-4 rounded-t-[999px] rounded-b-[1.75rem] border border-accent/70 sm:translate-x-5 sm:translate-y-5"
          />
          <PhotoSlot subject={photoSubject} shape="arch" className="relative aspect-[4/5] w-full" />
        </div>
      </div>

      <div aria-hidden className="bg-band py-2.5 text-band-accent">
        <span className="tilet-band" />
      </div>
    </section>
  );
}
