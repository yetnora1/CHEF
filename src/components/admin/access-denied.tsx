import { LogOut, ShieldAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth/actions";

export async function AccessDenied({ email }: { email: string | null }) {
  const t = await getTranslations("Auth");
  const tAdmin = await getTranslations("Admin");

  return (
    <div className="space-y-4">
      <span className="inline-flex size-11 items-center justify-center rounded-full bg-surface-muted text-terracotta">
        <ShieldAlert aria-hidden className="size-5" />
      </span>
      <h1 className="display-md">{t("accessDeniedTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("accessDeniedBody")}</p>
      {email && (
        <p className="text-sm">
          <span className="text-muted-foreground">{tAdmin("signedInAs")}: </span>
          <span className="font-semibold break-all">{email}</span>
        </p>
      )}
      <form action={signOut} className="pt-2">
        <Button type="submit" variant="outline">
          <LogOut aria-hidden />
          {t("signOut")}
        </Button>
      </form>
    </div>
  );
}
