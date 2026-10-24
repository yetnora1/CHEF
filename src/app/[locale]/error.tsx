"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function PublicError({ retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("Common");

  return (
    <section role="alert" className="page-container flex flex-col items-start py-24 md:py-32">
      <h1 className="max-w-2xl display-lg">{t("errorTitle")}</h1>
      <p className="mt-5 max-w-xl text-lg text-muted-foreground">{t("errorBody")}</p>
      <Button className="mt-10" onClick={() => retry()}>
        {t("tryAgain")}
      </Button>
    </section>
  );
}
