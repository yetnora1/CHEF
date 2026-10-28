import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Check, ShieldCheck, UserPlus } from "lucide-react";
import { AccessDenied } from "@/components/admin/access-denied";
import { listStaff } from "@/features/staff/admin-data";
import { StaffList, type StaffMemberView } from "@/features/staff/components/staff-list";
import { StaffMessages } from "@/features/staff/components/staff-messages";
import { capabilitiesOf, isPrivilegedRole, roleEditing } from "@/features/staff/roles";
import { hasPermission } from "@/lib/auth/access";
import { authorizeAdmin } from "@/lib/auth/staff-session";
import { formatCalendarDate, formatTimestamp } from "@/lib/format";
import { APP_ROLES } from "@/lib/permissions/matrix";

// Blocks on the session cookie by design: nothing renders before authorization.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AdminStaff");
  return { title: t("title") };
}

export default async function AdminStaffPage() {
  const decision = await authorizeAdmin("users.read");
  if (decision.kind === "forbidden") return <AccessDenied email={decision.session.user.email} />;

  const { session } = decision;
  const [locale, t, tRoles, staff] = await Promise.all([
    getLocale(),
    getTranslations("AdminStaff"),
    getTranslations("Roles"),
    listStaff(),
  ]);
  const actor = { id: session.user.id, permissions: session.permissions };
  const members: StaffMemberView[] = staff.map((person) => ({
    id: person.id,
    name: person.name,
    email: person.email,
    isYou: person.id === session.user.id,
    roles: person.roles,
    joined: person.createdAt ? formatCalendarDate(locale, person.createdAt) : null,
    lastSignIn: person.lastSignInAt ? formatTimestamp(locale, person.lastSignInAt) : null,
    editing: roleEditing(actor, { id: person.id, roles: person.roles }),
  }));
  const withoutRole = members.filter((member) => member.roles.length === 0).length;

  return (
    <div className="max-w-5xl space-y-12">
      <header>
        <h1 className="admin-title">{t("title")}</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">{t("intro")}</p>
      </header>

      {hasPermission(session, "users.manage") && (
        <section
          aria-labelledby="add-staff-heading"
          className="rounded-2xl border border-border glass p-5 sm:p-6"
        >
          <div className="flex items-start gap-4">
            <span className="hidden size-10 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-accent-ink sm:inline-flex">
              <UserPlus aria-hidden className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 id="add-staff-heading" className="font-semibold">
                {t("addTitle")}
              </h2>
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground marker:font-semibold marker:text-foreground">
                <li>{t("addStep1")}</li>
                <li>{t("addStep2")}</li>
                <li>{t("addStep3")}</li>
              </ol>
            </div>
          </div>
        </section>
      )}

      <section aria-labelledby="people-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2 id="people-heading" className="display-md">
            {t("peopleHeading")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("peopleCount", { count: members.length })}
            {withoutRole > 0 && <> · {t("withoutRoleCount", { count: withoutRole })}</>}
          </p>
        </div>
        <div className="mt-6">
          {members.length === 0 ? (
            <p className="text-muted-foreground">{t("empty")}</p>
          ) : (
            <StaffMessages>
              <StaffList members={members} />
            </StaffMessages>
          )}
        </div>
      </section>

      <section aria-labelledby="guide-heading">
        <h2 id="guide-heading" className="display-md">
          {t("guideHeading")}
        </h2>
        <p className="mt-3 max-w-3xl text-sm text-muted-foreground">{t("guideIntro")}</p>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {APP_ROLES.map((role) => (
            <li key={role} className="rounded-2xl border border-border glass p-5">
              <h3 className="flex items-center gap-2 font-semibold">
                {isPrivilegedRole(role) && <ShieldCheck aria-hidden className="size-4 text-action-bottom" />}
                {tRoles(role)}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">{t(`roleDescriptions.${role}`)}</p>
              {isPrivilegedRole(role) && <p className="mt-2 text-xs font-medium">{t("lockedHint")}</p>}
              <ul aria-label={t("canDo", { role: tRoles(role) })} className="mt-4 space-y-2 text-sm">
                {capabilitiesOf(role).map((capability) => (
                  <li key={capability} className="flex gap-2">
                    <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                    <span>{t(`capabilities.${capability}`)}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
