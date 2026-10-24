import { getTranslations } from "next-intl/server";

/**
 * Site-wide notice while the public site still shows placeholder copy and
 * imagery. Remove (or gate on a site setting) once final content is published.
 */
export async function PreviewNotice() {
  const t = await getTranslations("Common");
  return (
    <div className="bg-band text-band-foreground">
      <p className="page-container py-2 text-center text-xs leading-relaxed text-band-muted">
        {t("previewNotice")}
      </p>
    </div>
  );
}
