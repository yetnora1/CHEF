"use client";

import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/*
 * Server errors in protected admin routes land here, including a failed
 * permission lookup (which denies access rather than guessing). Production
 * builds never forward server error messages to the browser; only a digest is
 * available for matching server logs.
 */
export default function AdminError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("Common");
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;

  return (
    <div role="alert" className="mx-auto max-w-xl space-y-4 rounded-2xl border border-border glass p-7">
      <span className="inline-flex size-11 items-center justify-center rounded-full bg-surface-muted text-danger">
        <TriangleAlert aria-hidden className="size-5" />
      </span>
      <h1 className="display-md">{t("errorTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("errorBody")}</p>
      {digest && (
        <p className="font-mono text-xs text-muted-foreground">
          {t("errorReference", { reference: digest })}
        </p>
      )}
      <Button variant="action" onClick={() => retry()}>
        {t("tryAgain")}
      </Button>
    </div>
  );
}
