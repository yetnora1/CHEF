import { AtSign, CheckCircle2, KeyRound, Mail, TriangleAlert, type LucideIcon } from "lucide-react";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { getClientMessages } from "@/i18n/client-messages";
import type { SignedInStaffSession } from "@/lib/auth/access";
import { getMyUsername } from "../data";
import { EmailForm, PasswordForm, UsernameForm } from "./account-forms";

/** What became of an email confirmation link (see account/email-confirmed/route.ts). */
export type EmailOutcome = "done" | "partial" | "failed";

function Card({
  icon: Icon,
  heading,
  intro,
  children,
}: {
  icon: LucideIcon;
  heading: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-2xl border border-border glass p-4 sm:p-6">
      <div className="space-y-1.5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Icon aria-hidden className="size-5 text-muted-foreground" />
          {heading}
        </h2>
        <p className="text-sm text-muted-foreground">{intro}</p>
      </div>
      {children}
    </section>
  );
}

/** A staff member's own sign-in details (the page authorizes before rendering this). */
export async function AccountScreen({
  session,
  emailOutcome,
}: {
  session: SignedInStaffSession;
  emailOutcome: EmailOutcome | null;
}) {
  const [t, username, messages] = await Promise.all([
    getTranslations("AdminAccount"),
    getMyUsername(),
    getClientMessages(["AdminAccount"]),
  ]);

  return (
    <NextIntlClientProvider messages={messages}>
      <div className="max-w-3xl space-y-6">
        <header>
          <h1 className="admin-title">{t("title")}</h1>
          <p className="mt-3 text-muted-foreground">{t("intro")}</p>
        </header>

        {emailOutcome && (
          <p
            role={emailOutcome === "failed" ? "alert" : "status"}
            className="flex items-start gap-2.5 rounded-xl border border-border glass p-3.5 text-sm font-medium"
          >
            {emailOutcome === "failed" ? (
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
            ) : (
              <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
            )}
            {t(`email.outcome.${emailOutcome}`)}
          </p>
        )}

        <Card icon={AtSign} heading={t("username.heading")} intro={t("username.intro")}>
          <UsernameForm username={username} />
        </Card>
        <Card icon={Mail} heading={t("email.heading")} intro={t("email.intro")}>
          <EmailForm
            email={session.user.email}
            pendingEmail={session.user.pendingEmail}
            lapsedEmail={session.user.lapsedEmail}
          />
        </Card>
        <Card icon={KeyRound} heading={t("password.heading")} intro={t("password.intro")}>
          <PasswordForm pendingEmail={session.user.pendingEmail} />
        </Card>
      </div>
    </NextIntlClientProvider>
  );
}
