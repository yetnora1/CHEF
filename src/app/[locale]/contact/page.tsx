import { AtSign, Mail, MapPin, MessageCircle, Phone, Send, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { getContactConfig } from "@/features/bookings/server/config";
import { ContactForm } from "@/features/contact/components/contact-form";
import { contactSubjectFor } from "@/features/contact/service-subject";
import { getPublicSiteSettings } from "@/features/settings/public-data";
import { telHref, whatsappDigits } from "@/features/settings/schema";
import { getClientMessages } from "@/i18n/client-messages";
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
 * Contact: the message form, beside the contact details and social links that
 * staff have entered in Admin → Settings (each shown only once it is set).
 */
export default async function ContactPage({ searchParams }: PageProps<"/[locale]/contact">) {
  const locale = await getLocale();
  const [t, tFooter, settings] = await Promise.all([
    getTranslations("Contact"),
    getTranslations("Footer"),
    getPublicSiteSettings(),
  ]);

  // An Amharic location reaches this page only once reviewed; else English, marked lang="en".
  const place = settings
    ? resolveLocalized(
        { en: settings.location.en ?? undefined, am: settings.location.am ?? undefined },
        locale,
      )
    : null;
  const details: Detail[] = settings
    ? [
        ...(settings.phone
          ? [
              {
                key: "phone",
                icon: Phone,
                label: t("phone"),
                value: settings.phone,
                href: telHref(settings.phone),
              },
            ]
          : []),
        ...(settings.whatsapp
          ? [
              {
                key: "whatsapp",
                icon: MessageCircle,
                label: t("whatsapp"),
                value: settings.whatsapp,
                href: `https://wa.me/${whatsappDigits(settings.whatsapp)}`,
              },
            ]
          : []),
        ...(settings.telegram
          ? [
              {
                key: "telegram",
                icon: Send,
                label: t("telegram"),
                value: `@${settings.telegram}`,
                href: `https://t.me/${settings.telegram}`,
              },
            ]
          : []),
        ...(settings.email
          ? [
              {
                key: "email",
                icon: Mail,
                label: t("email"),
                value: settings.email,
                href: `mailto:${settings.email}`,
              },
            ]
          : []),
        ...(place
          ? [{ key: "location", icon: MapPin, label: t("location"), value: place.text, lang: place.lang }]
          : []),
      ]
    : [];
  const social = settings?.social ?? [];

  return (
    <section className="page-container py-14 md:py-20">
      {/* Phones: intro, form, then any confirmed contact details. Desktop: intro and
          details on the left, the form beside them. */}
      <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:grid-rows-[auto_1fr] lg:gap-x-16">
        <header className="lg:col-start-1 lg:row-start-1">
          <h1 className="display-lg">{t("title")}</h1>
          <p className="mt-4 text-lg text-muted-foreground">{t("lede")}</p>
        </header>

        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <Suspense fallback={<FormPlaceholder />}>
            <ContactFormSection searchParams={searchParams} />
          </Suspense>
        </div>

        {(details.length > 0 || social.length > 0) && (
          <div className="lg:col-start-1 lg:row-start-2 lg:self-start">
            <div className="rounded-2xl border border-border glass p-6">
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
                {social.length > 0 && (
                  <div className="flex items-center gap-4 py-4">
                    <AtSign aria-hidden className="size-5 shrink-0 text-accent-ink" />
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("social")}</dt>
                      <dd>
                        <ul className="flex flex-wrap gap-x-4 gap-y-1 font-semibold">
                          {social.map(({ platform, url }) => (
                            <li key={platform}>
                              <a
                                href={url}
                                rel="me"
                                className="underline-offset-4 hover:text-primary hover:underline"
                              >
                                {tFooter(`social.${platform}`)}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </dd>
                    </div>
                  </div>
                )}
              </dl>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Reads the live server configuration, so it renders per request. A service card
 * links here with `?service=<slug>`, which prefills the subject (known services only).
 */
async function ContactFormSection({ searchParams }: Pick<PageProps<"/[locale]/contact">, "searchParams">) {
  await connection();
  const locale = await getLocale();
  // Storage only: the contact form uses no CAPTCHA (see getContactConfig).
  const config = getContactConfig();

  if (!config.available) {
    const t = await getTranslations("ContactForm");
    return (
      <div role="status" className="self-start rounded-2xl border border-border glass p-6 sm:p-8">
        <h2 className="display-md">{t("unavailableTitle")}</h2>
        <p className="mt-3 text-muted-foreground">{t("unavailableBody")}</p>
      </div>
    );
  }

  const [messages, subject] = await Promise.all([
    getClientMessages(["ContactForm"]),
    searchParams.then(({ service }) => contactSubjectFor(service, locale)),
  ]);

  return (
    <NextIntlClientProvider messages={messages}>
      <ContactForm locale={locale} defaultSubject={subject} />
    </NextIntlClientProvider>
  );
}

function FormPlaceholder() {
  return (
    <div aria-hidden className="animate-pulse space-y-6 rounded-2xl border border-border glass p-6 sm:p-8">
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
