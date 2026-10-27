import { ArrowRight, CalendarDays, Info, Mail, MapPin, Phone, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { getInquiryConfig } from "@/features/bookings/server/config";
import { ContactForm, type ContactCaptcha } from "@/features/contact/components/contact-form";
import { contactDetails } from "@/features/content/contact-content";
import { getClientMessages } from "@/i18n/client-messages";
import { Link } from "@/i18n/navigation";
import { resolveLocalized } from "@/lib/localization/translations";

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
 * Contact: the message form, beside a shortcut to the event inquiry form and
 * the phone, email and location shown only once confirmed in contact-content.ts.
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
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div className="space-y-6 lg:sticky lg:top-28 lg:self-start">
          <header>
            <h1 className="display-lg">{t("title")}</h1>
            <p className="mt-4 text-lg text-muted-foreground">{t("lede")}</p>
          </header>

          <div className="rounded-2xl border border-border bg-surface p-6">
            <div className="flex items-center gap-3">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <CalendarDays aria-hidden className="size-5" />
              </span>
              <h2 className="text-lg font-semibold">{t("inquiryTitle")}</h2>
            </div>
            <p className="mt-3 text-muted-foreground">{t("inquiryBody")}</p>
            <Button asChild variant="outline" className="mt-5">
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
            <div className="rounded-2xl border border-border bg-surface p-6">
              <h2 className="text-lg font-semibold">{t("detailsTitle")}</h2>
              <dl className="mt-2 divide-y divide-border">
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

        <Suspense fallback={<FormPlaceholder />}>
          <ContactFormSection />
        </Suspense>
      </div>
    </section>
  );
}

/** Reads the live server configuration, so it renders per request. */
async function ContactFormSection() {
  await connection();
  const locale = await getLocale();
  const config = getInquiryConfig();

  if (!config.available) {
    const t = await getTranslations("ContactForm");
    return (
      <div role="status" className="self-start rounded-2xl border border-border bg-surface p-6 sm:p-8">
        <h2 className="display-md">{t("unavailableTitle")}</h2>
        <p className="mt-3 text-muted-foreground">{t("unavailableBody")}</p>
      </div>
    );
  }

  // Only the public site key and mode reach the browser; secrets stay here.
  const captcha: ContactCaptcha =
    config.captcha.mode === "turnstile"
      ? { mode: "turnstile", siteKey: config.captcha.siteKey }
      : { mode: "local-bypass" };
  const messages = await getClientMessages(["ContactForm"]);

  return (
    <NextIntlClientProvider messages={messages}>
      <ContactForm locale={locale} captcha={captcha} />
    </NextIntlClientProvider>
  );
}

function FormPlaceholder() {
  return (
    <div
      aria-hidden
      className="animate-pulse space-y-6 rounded-2xl border border-border bg-surface p-6 sm:p-8"
    >
      <div className="h-7 w-48 rounded bg-surface-muted" />
      <div className="grid gap-6 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-24 rounded bg-surface-muted" />
            <div className="h-12 rounded-xl bg-surface-muted" />
          </div>
        ))}
      </div>
      <div className="h-36 rounded-xl bg-surface-muted" />
    </div>
  );
}
