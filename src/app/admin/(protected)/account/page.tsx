import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/admin/access-denied";
import { AccountScreen, type EmailOutcome } from "@/features/account/components/account-screen";
import { authorizeAdmin } from "@/lib/auth/staff-session";

// Blocks on the session cookie by design: nothing renders before authorization.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AdminAccount");
  return { title: t("title") };
}

const EMAIL_OUTCOMES: readonly string[] = ["done", "partial", "failed"] satisfies EmailOutcome[];

export default async function AdminAccountPage({ searchParams }: PageProps<"/admin/account">) {
  const decision = await authorizeAdmin("admin.access");
  if (decision.kind === "forbidden") return <AccessDenied email={decision.session.user.email} />;
  const { email } = await searchParams;
  return (
    <AccountScreen
      session={decision.session}
      emailOutcome={
        typeof email === "string" && EMAIL_OUTCOMES.includes(email) ? (email as EmailOutcome) : null
      }
    />
  );
}
