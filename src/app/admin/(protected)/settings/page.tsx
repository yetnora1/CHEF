import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/admin/access-denied";
import { getSiteSettings } from "@/features/settings/admin-data";
import { SettingsForm } from "@/features/settings/components/settings-form";
import { getClientMessages } from "@/i18n/client-messages";
import { authorizeAdmin } from "@/lib/auth/staff-session";
import { formatTimestamp } from "@/lib/format";

// Blocks on the session cookie by design: nothing renders before authorization.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AdminSettings");
  return { title: t("title") };
}

export default async function AdminSettingsPage() {
  const decision = await authorizeAdmin("settings.manage");
  if (decision.kind === "forbidden") return <AccessDenied email={decision.session.user.email} />;

  const [locale, t, settings, messages] = await Promise.all([
    getLocale(),
    getTranslations("AdminSettings"),
    getSiteSettings(),
    getClientMessages(["AdminSettings"]),
  ]);

  return (
    <div className="max-w-4xl space-y-8">
      <header>
        <h1 className="admin-title">{t("title")}</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">{t("intro")}</p>
      </header>
      {settings ? (
        <NextIntlClientProvider messages={messages}>
          <SettingsForm
            settings={settings}
            reviewedOn={
              settings.location_am_reviewed_at
                ? formatTimestamp(locale, settings.location_am_reviewed_at)
                : null
            }
            lastSaved={
              settings.version > 1
                ? t(settings.updated_by_name ? "lastSavedBy" : "lastSaved", {
                    date: formatTimestamp(locale, settings.updated_at),
                    name: settings.updated_by_name ?? "",
                  })
                : null
            }
          />
        </NextIntlClientProvider>
      ) : (
        <p role="alert" className="rounded-2xl border border-border glass p-5 text-sm">
          {t("unavailable")}
        </p>
      )}
    </div>
  );
}
