import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/admin/access-denied";
import { listAuditLog, parseAuditFilters } from "@/features/audit/admin-data";
import { AuditFiltersForm, AuditList } from "@/features/audit/components/audit-log";
import { listStaff } from "@/features/staff/admin-data";
import { hasPermission } from "@/lib/auth/access";
import { authorizeAdmin } from "@/lib/auth/staff-session";

// Blocks on the session cookie by design: nothing renders before authorization.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AdminAudit");
  return { title: t("title") };
}

export default async function AdminAuditLogPage({ searchParams }: PageProps<"/admin/audit-log">) {
  const decision = await authorizeAdmin("audit.read");
  if (decision.kind === "forbidden") return <AccessDenied email={decision.session.user.email} />;

  const filters = parseAuditFilters(await searchParams);
  // Names for the person filter and for people named in entries (new assignees).
  const canListStaff = hasPermission(decision.session, "users.read");
  const [t, log, staff] = await Promise.all([
    getTranslations("AdminAudit"),
    listAuditLog(filters),
    canListStaff ? listStaff() : Promise.resolve([]),
  ]);
  const people = staff.map((person) => ({ id: person.id, name: person.name }));

  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <h1 className="admin-title">{t("title")}</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">{t("intro")}</p>
      </header>
      <AuditFiltersForm filters={filters} people={people} />
      <AuditList
        entries={log.entries}
        names={new Map(people.map((person) => [person.id, person.name]))}
        filters={filters}
        nextBefore={log.nextBefore}
      />
    </div>
  );
}
