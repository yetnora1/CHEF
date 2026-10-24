import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/admin/access-denied";
import { AuthShell } from "@/components/admin/auth-shell";
import { ConfigRequired } from "@/components/admin/config-required";
import { LoginForm } from "@/features/auth/login-form";
import { safeAdminRedirect } from "@/lib/auth/redirect";
import { getStaffSession } from "@/lib/auth/staff-session";

// Blocks on the session cookie by design: nothing renders before authorization.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth");
  return { title: t("loginTitle") };
}

export default async function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  const { next } = await searchParams;
  const destination = safeAdminRedirect(typeof next === "string" ? next : undefined);
  const session = await getStaffSession();
  const t = await getTranslations("Auth");

  if (session.status === "signed-in" && session.permissions.includes("admin.access")) {
    redirect(destination);
  }

  return (
    <AuthShell>
      {session.status === "unconfigured" ? (
        <ConfigRequired />
      ) : session.status === "signed-in" ? (
        <AccessDenied email={session.user.email} />
      ) : (
        <div className="space-y-7">
          <div className="space-y-2">
            <h1 className="display-md">{t("loginTitle")}</h1>
            <p className="text-sm text-muted-foreground">{t("loginSubtitle")}</p>
          </div>
          <LoginForm next={destination} />
          <p className="border-t border-border pt-5 text-xs text-muted-foreground">{t("noPublicSignup")}</p>
        </div>
      )}
    </AuthShell>
  );
}
