import { ArrowRight, CalendarDays, Info, Mail, MapPin, Phone, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { contactDetails } from "@/features/content/contact-content";
import { Link } from "@/i18n/navigation";
import { resolveLocalized } from "@/lib/localization/translations";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations("Contact");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: `/${locale}/contact`, languages: { en: "/en/contact", am: "/am/contact" } },
  };
}

type Detail = { key: string; icon: LucideIcon; label: string; value: string; href?: string; lang?: string };

/**
 * Contact: the event inquiry form first (the working channel), then phone,
 * email and location, each shown only once confirmed in contact-content.ts.
 */
export default async function ContactPage() {
  const locale = await getLocale();
  const [t, tHome] = await Promise.all([getTranslations("Contact"), getTranslations("Home")]);

  const { phone, email, location } = contactDetails;
  const place = location ? resolveLocalized(location, locale) : null;
  const details: Detail[] = [
    ...(phone
      ? [
          {
            key: "phone",
            icon: Phone,
            label: t("phone"),
            value: phone,
            href: `tel:${phone.replace(/[^\d+]/g, "")}`,
          },
        ]
      : []),
    ...(email
      ? [{ key: "email", icon: Mail, label: t("email"), value: email, href: `mailto:${email}` }]
      : []),
    ...(place
      ? [{ key: "location", icon: MapPin, label: t("location"), value: place.text, lang: place.lang }]
      : []),
  ];

  return (
    <section className="page-container py-14 md:py-20">
      <header className="max-w-2xl">
        <h1 className="display-lg">{t("title")}</h1>
        <p className="mt-4 text-lg text-muted-foreground">{t("lede")}</p>
      </header>

      <div className={cn("mt-10 grid gap-6", details.length ? "md:grid-cols-2" : "max-w-xl")}>
        <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
          <span className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarDays aria-hidden className="size-5" />
          </span>
          <h2 className="mt-5 display-md">{t("inquiryTitle")}</h2>
          <p className="mt-2 text-muted-foreground">{t("inquiryBody")}</p>
          <Button asChild className="mt-6">
            <Link href="/book">
              {tHome("inquiryCta")}
              <ArrowRight aria-hidden className="motion-safe:group-hover/button:translate-x-0.5" />
            </Link>
          </Button>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info aria-hidden className="size-3.5 shrink-0" />
            {tHome("inquiryNote")}
          </p>
        </div>

        {details.length > 0 && (
          <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
            <h2 className="display-md">{t("detailsTitle")}</h2>
            <dl className="mt-4 divide-y divide-border">
              {details.map(({ key, icon: Icon, label, value, href, lang }) => (
                <div key={key} className="flex items-center gap-4 py-4">
                  <Icon aria-hidden className="size-5 shrink-0 text-accent-ink" />
                  <div>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="font-semibold" lang={lang}>
                      {href ? (
                        <a href={href} className="underline-offset-4 hover:text-primary hover:underline">
                          {value}
                        </a>
                      ) : (
                        value
                      )}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </section>
  );
}
