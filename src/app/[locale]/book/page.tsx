import { ArrowRight, Info } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { InquiryForm, type InquiryCaptcha } from "@/features/bookings/components/inquiry-form";
import { getInquiryConfig } from "@/features/bookings/server/config";
import { siteNavigation } from "@/features/cms/navigation";
import { getClientMessages } from "@/i18n/client-messages";
import { Link } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations("Booking");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: `/${locale}/book`, languages: { en: "/en/book", am: "/am/book" } },
  };
}

const PROCESS_STEPS = ["processStep1", "processStep2", "processStep3"] as const;

export default async function BookPage() {
  const t = await getTranslations("Booking");

  return (
    <section aria-labelledby="book-heading" className="page-container py-14 md:py-20">
      <div className="grid gap-12 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <p className="eyebrow text-accent-ink">{t("eyebrow")}</p>
          <h1 id="book-heading" className="mt-5 display-lg">
            {t("title")}
          </h1>
          <p className="mt-5 text-lg text-muted-foreground">{t("intro")}</p>
          <div className="mt-8 rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <h2 className="text-sm font-semibold">{t("processTitle")}</h2>
            <ol className="mt-4 space-y-3 text-sm leading-relaxed">
              {PROCESS_STEPS.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span
                    aria-hidden
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-border-strong/60 font-display text-xs text-accent-ink tabular-nums"
                  >
                    {index + 1}
                  </span>
                  <span className="pt-0.5">{t(step)}</span>
                </li>
              ))}
            </ol>
            <p className="mt-5 flex items-start gap-3 border-t border-border pt-4 text-sm leading-relaxed text-muted-foreground">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-accent-ink" />
              {t("notBookingNote")}
            </p>
          </div>
        </div>

        <Suspense fallback={<FormPlaceholder />}>
          <InquiryFormSection />
        </Suspense>
      </div>
    </section>
  );
}

/** Reads the live server configuration, so it renders per request. */
async function InquiryFormSection() {
  await connection();
  const locale = await getLocale();
  const config = getInquiryConfig();

  if (!config.available) {
    const [t, tHome, tCommon, navigation] = await Promise.all([
      getTranslations("Booking"),
      getTranslations("Home"),
      getTranslations("Common"),
      siteNavigation(locale),
    ]);
    const services = navigation.find((link) => link.key === "services")?.href ?? "/";
    return (
      <div role="status" className="self-start rounded-3xl border border-border bg-surface p-7 sm:p-10">
        <h2 className="display-md">{t("unavailableTitle")}</h2>
        <p className="mt-4 text-muted-foreground">{t("unavailableBody")}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href={services}>
              {tHome("heroSecondaryCta")}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/">{tCommon("backHome")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Only the public site key and mode reach the browser; secrets stay here.
  const captcha: InquiryCaptcha =
    config.captcha.mode === "turnstile"
      ? { mode: "turnstile", siteKey: config.captcha.siteKey }
      : { mode: "local-bypass" };
  const messages = await getClientMessages(["Booking", "EventType", "ContactMethod"]);

  return (
    <NextIntlClientProvider messages={messages}>
      <InquiryForm locale={locale} captcha={captcha} />
    </NextIntlClientProvider>
  );
}

function FormPlaceholder() {
  return (
    <div aria-hidden className="animate-pulse space-y-6">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 w-32 rounded bg-surface-muted" />
          <div className="h-12 rounded-xl bg-surface-muted" />
        </div>
      ))}
    </div>
  );
}
