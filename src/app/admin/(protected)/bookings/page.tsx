import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/admin/access-denied";
import {
  assignableStaff,
  inboxCounts,
  listBookings,
  parseListFilters,
  READ_BOOKINGS,
} from "@/features/bookings/admin-data";
import { InboxFilters, InboxList, StatusTabs } from "@/features/bookings/components/admin/inbox";
import { hasPermission } from "@/lib/auth/access";
import { authorizeAdmin } from "@/lib/auth/staff-session";

// Blocks on the session cookie by design: nothing renders before authorization.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AdminBookings");
  return { title: t("title") };
}

export default async function AdminBookingsPage({ searchParams }: PageProps<"/admin/bookings">) {
  const decision = await authorizeAdmin(READ_BOOKINGS);
  if (decision.kind === "forbidden") return <AccessDenied email={decision.session.user.email} />;

  const canAssign = hasPermission(decision.session, "bookings.assign");
  const filters = parseListFilters(await searchParams);
  const [t, list, counts, staff] = await Promise.all([
    getTranslations("AdminBookings"),
    listBookings(filters),
    inboxCounts(),
    canAssign ? assignableStaff() : Promise.resolve(null),
  ]);

  return (
    <div className="max-w-7xl space-y-6">
      <header>
        <h1 className="admin-title">{t("title")}</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">{t("intro")}</p>
      </header>
      <StatusTabs counts={counts} filters={filters} />
      <InboxFilters filters={filters} staff={staff} />
      <InboxList rows={list.rows} total={list.total} filters={filters} />
    </div>
  );
}
