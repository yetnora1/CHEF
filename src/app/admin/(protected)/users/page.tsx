import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Check, Minus, UserPlus } from "lucide-react";
import { AccessDenied } from "@/components/admin/access-denied";
import { listStaff } from "@/features/staff/admin-data";
import { RoleChip } from "@/features/staff/components/role-chip";
import { StaffList, type StaffMemberView } from "@/features/staff/components/staff-list";
import { StaffMessages } from "@/features/staff/components/staff-messages";
import { capabilitiesOf, ROLE_CAPABILITIES, roleCan, roleEditing } from "@/features/staff/roles";
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

const ADD_STEPS = ["addStep1", "addStep2", "addStep3"] as const;

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
    <div className="max-w-5xl space-y-10">
      <header>
        <h1 className="admin-title">{t("title")}</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">{t("intro")}</p>
      </header>

      {hasPermission(session, "users.manage") && (
        <section aria-labelledby="add-staff-heading" className="rounded-2xl border border-border glass p-5">
          <h2 id="add-staff-heading" className="flex items-center gap-2.5 text-sm font-semibold">
            <span className="inline-flex size-8 items-center justify-center rounded-lg bg-surface-muted text-accent-ink">
              <UserPlus aria-hidden className="size-4" />
            </span>
            {t("addTitle")}
          </h2>
          <ol className="mt-4 grid gap-3 text-sm leading-relaxed text-muted-foreground md:grid-cols-3">
            {ADD_STEPS.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span
                  aria-hidden
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-border-strong text-xs font-semibold text-foreground tabular-nums"
                >
                  {index + 1}
                </span>
                <span>{t(step)}</span>
              </li>
            ))}
          </ol>
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
        <div className="mt-5">
          {members.length === 0 ? (
            <p className="rounded-2xl border border-border glass p-6 text-muted-foreground">{t("empty")}</p>
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
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{t("guideIntro")}</p>

        {/* From md: one comparison table. */}
        <div className="mt-5 hidden overflow-hidden rounded-2xl border border-border glass md:block">
          <table aria-labelledby="guide-heading" className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="w-[28%] p-4 text-left align-top">
                  <span className="sr-only">{t("guideAbility")}</span>
                </th>
                {APP_ROLES.map((role) => (
                  <th key={role} scope="col" className="p-3 text-left align-top font-normal">
                    <RoleChip role={role} label={tRoles(role)} />
                    <span className="mt-2 block text-xs leading-snug text-muted-foreground">
                      {t(`roleDescriptions.${role}`)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ROLE_CAPABILITIES.map((capability) => (
                <tr key={capability.key} className="transition-colors hover:bg-glass-raised">
                  <th scope="row" className="px-4 py-3 text-left font-medium">
                    {t(`capabilities.${capability.key}`)}
                  </th>
                  {APP_ROLES.map((role) => (
                    <td key={role} className="px-3 py-3">
                      {roleCan(role, capability.key) ? (
                        <>
                          <Check aria-hidden className="size-4.5 text-success" />
                          <span className="sr-only">{t("guideYes")}</span>
                        </>
                      ) : (
                        <>
                          <Minus aria-hidden className="size-4 text-muted-foreground/45" />
                          <span className="sr-only">{t("guideNo")}</span>
                        </>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Phones: one card per role. */}
        <ul className="mt-5 grid gap-3 md:hidden">
          {APP_ROLES.map((role) => (
            <li key={role} className="rounded-2xl border border-border glass p-4">
              <RoleChip role={role} label={tRoles(role)} />
              <p className="mt-2 text-sm text-muted-foreground">{t(`roleDescriptions.${role}`)}</p>
              <ul aria-label={t("canDo", { role: tRoles(role) })} className="mt-3 space-y-1.5 text-sm">
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
