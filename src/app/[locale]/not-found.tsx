import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default async function LocalizedNotFound() {
  const [t, tNav] = await Promise.all([getTranslations("Common"), getTranslations("Navigation")]);

  return (
    <section className="page-container flex flex-col items-start py-24 md:py-32">
      <p className="eyebrow text-accent-ink">404</p>
      <h1 className="mt-5 max-w-2xl display-lg">{t("notFoundTitle")}</h1>
      <p className="mt-5 max-w-xl text-lg text-muted-foreground">{t("notFoundBody")}</p>
      <span aria-hidden className="mt-8 tilet-rule w-28 text-accent" />
      <div className="mt-10 flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/">{t("backHome")}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/book">{tNav("planEvent")}</Link>
        </Button>
      </div>
    </section>
  );
}
