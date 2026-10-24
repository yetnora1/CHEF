import { Settings2 } from "lucide-react";
import { getTranslations } from "next-intl/server";

export async function ConfigRequired() {
  const t = await getTranslations("Auth");

  return (
    <div role="alert" className="space-y-4">
      <span className="inline-flex size-11 items-center justify-center rounded-full bg-surface-muted text-warning">
        <Settings2 aria-hidden className="size-5" />
      </span>
      <h1 className="display-md">{t("configRequiredTitle")}</h1>
      <p className="text-sm text-muted-foreground">
        {t.rich("configRequiredBody", {
          code: (chunks) => (
            <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[0.8em] break-words text-foreground">
              {chunks}
            </code>
          ),
        })}
      </p>
    </div>
  );
}
