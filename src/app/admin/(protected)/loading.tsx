import { getTranslations } from "next-intl/server";

export default async function AdminLoading() {
  const t = await getTranslations("Common");

  return (
    <div role="status" aria-live="polite" className="max-w-6xl">
      <span className="sr-only">{t("loading")}</span>
      <div aria-hidden className="animate-pulse space-y-4">
        <div className="h-4 w-24 rounded bg-surface-muted" />
        <div className="h-10 w-72 rounded-lg bg-surface-muted" />
        <div className="h-4 w-full max-w-2xl rounded bg-surface-muted" />
        <div className="grid gap-4 pt-8 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-36 rounded-2xl bg-surface-muted" />
          ))}
        </div>
      </div>
    </div>
  );
}
