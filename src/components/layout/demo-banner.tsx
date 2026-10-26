import { FlaskConical } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { isDemoMode } from "@/lib/demo";

/**
 * Shown on every public and admin page in demo mode, so sample content and
 * in-memory data are never mistaken for the live site or saved work.
 */
export async function DemoBanner() {
  if (!isDemoMode()) return null;
  const t = await getTranslations("Common");
  return (
    <div role="note" className="border-b border-warning/40 bg-warning text-background">
      <p className="mx-auto flex max-w-7xl items-start justify-center gap-2 px-4 py-2 text-sm leading-snug sm:items-center">
        <FlaskConical aria-hidden className="mt-0.5 size-4 shrink-0 sm:mt-0" />
        <span>
          <strong className="font-semibold">{t("demoTitle")}</strong> {t("demoBody")}
        </span>
      </p>
    </div>
  );
}
