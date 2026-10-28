import { ArrowUpRight, Mail, MapPin, MessageCircle, Phone, Send, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { getContactConfig } from "@/features/bookings/server/config";
import { ContactForm } from "@/features/contact/components/contact-form";
import { contactSubjectFor } from "@/features/contact/service-subject";
import { getPublicSiteSettings } from "@/features/settings/public-data";
import { telHref, whatsappDigits } from "@/features/settings/schema";
import { getClientMessages } from "@/i18n/client-messages";
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

type DetailKey = "phone" | "whatsapp" | "telegram" | "email" | "location";

type Detail = { key: DetailKey; label: string; value: string; href?: string; lang?: string };

/** Each way to reach CHEF SIS has its own icon and colour (a `hue-*` utility in globals.css). */
const DETAIL_STYLE: Record<DetailKey, { icon: LucideIcon; hue: string }> = {
  phone: { icon: Phone, hue: "hue-amber" },
  whatsapp: { icon: MessageCircle, hue: "hue-teal" },
  telegram: { icon: Send, hue: "hue-sky" },
  email: { icon: Mail, hue: "hue-indigo" },
  location: { icon: MapPin, hue: "hue-rose" },
};

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
                key: "phone" as const,
                label: t("phone"),
                value: settings.phone,
                href: telHref(settings.phone),
              },
            ]
          : []),
        ...(settings.whatsapp
          ? [
              {
                key: "whatsapp" as const,
                label: t("whatsapp"),
                value: settings.whatsapp,
                href: `https://wa.me/${whatsappDigits(settings.whatsapp)}`,
              },
            ]
          : []),
        ...(settings.telegram
          ? [
              {
                key: "telegram" as const,
                label: t("telegram"),
                value: `@${settings.telegram}`,
                href: `https://t.me/${settings.telegram}`,
              },
            ]
          : []),
        ...(settings.email
          ? [
              {
                key: "email" as const,
                label: t("email"),
                value: settings.email,
                href: `mailto:${settings.email}`,
              },
            ]
          : []),
        ...(place
          ? [{ key: "location" as const, label: t("location"), value: place.text, lang: place.lang }]
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
            <div className="rounded-2xl border border-border glass p-3 sm:p-4">
              <h2 className="px-3 pt-2 text-lg font-semibold">{t("detailsTitle")}</h2>
              {details.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {details.map((detail) => (
                    <li key={detail.key}>
                      <DetailRow detail={detail} />
                    </li>
                  ))}
                </ul>
              )}
              {social.length > 0 && (
                <div className="mt-2 border-t border-border px-3 pt-4 pb-2">
                  <h3 className="text-xs font-semibold text-muted-foreground">{t("social")}</h3>
                  <ul className="mt-2.5 flex flex-wrap gap-2">
                    {social.map(({ platform, url }) => (
                      <li key={platform}>
                        <a href={url} rel="me" className={buttonVariants({ variant: "outline", size: "sm" })}>
                          {tFooter(`social.${platform}`)}
                          <ArrowUpRight
                            aria-hidden
                            className="group-hover/button:translate-x-0.5 group-hover/button:-translate-y-0.5"
                          />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** One way to reach CHEF SIS: the whole row is the link (call, chat, write), with room for a thumb. */
function DetailRow({ detail }: { detail: Detail }) {
  const { icon: Icon, hue } = DETAIL_STYLE[detail.key];
  const body = (
    <>
      <span
        className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-xl tint-chip", hue)}
      >
        <Icon aria-hidden className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted-foreground">{detail.label}</span>
        <span className="block font-semibold break-words" lang={detail.lang}>
          {detail.value}
        </span>
      </span>
    </>
  );
  if (!detail.href) return <div className="flex items-center gap-4 px-3 py-2.5">{body}</div>;
  return (
    <a
      href={detail.href}
      className="group flex items-center gap-4 rounded-xl px-3 py-2.5 transition-colors hover:bg-glass-raised focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
    >
      {body}
      <ArrowUpRight
        aria-hidden
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground motion-reduce:transition-none"
      />
    </a>
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
