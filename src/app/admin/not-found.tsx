import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/admin/auth-shell";
import { Button } from "@/components/ui/button";
import { ADMIN_HOME_PATH } from "@/lib/auth/redirect";

export default async function AdminNotFound() {
  const [t, tAdmin] = await Promise.all([getTranslations("Common"), getTranslations("Admin")]);

  return (
    <AuthShell>
      <div className="space-y-4">
        <p className="eyebrow text-accent-ink">404</p>
        <h1 className="display-md">{t("notFoundTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("notFoundBody")}</p>
        <Button asChild variant="outline">
          <Link href={ADMIN_HOME_PATH}>{tAdmin("modules.overview")}</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
