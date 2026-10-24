import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AccessDenied } from "@/components/admin/access-denied";
import { buttonVariants } from "@/components/ui/button";
import { ADMIN_MODULE_ICONS } from "@/features/admin/module-icons";
import { modulesFor } from "@/features/admin/modules";
import { bookingReport, inboxCounts, READ_BOOKINGS } from "@/features/bookings/admin-data";
import { OPEN_STATUSES } from "@/features/bookings/status";
import { hasPermission, type SignedInStaffSession } from "@/lib/auth/access";
import { authorizeAdmin } from "@/lib/auth/staff-session";

// Blocks on the session cookie by design: nothing renders before authorization.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Admin");
  return { title: t("overview.title") };
}

export default async function AdminOverviewPage() {
  const decision = await authorizeAdmin("admin.access");
  if (decision.kind === "forbidden") return <AccessDenied email={decision.session.user.email} />;

  const { session } = decision;
  const [t, tRoles] = await Promise.all([getTranslations("Admin"), getTranslations("Roles")]);
  // Every module this role can use (built ones link to it), except this page itself.
  const modules = modulesFor(session.permissions).filter((module) => module.key !== "overview");

  return (
    <div className="mx-auto max-w-6xl">
      <p className="text-sm font-semibold text-accent-ink">{t("overview.welcome")}</p>
      <h1 className="mt-2 display-lg">{t("overview.title")}</h1>
      <p className="mt-4 max-w-3xl text-muted-foreground">{t("overview.intro")}</p>

      <section aria-labelledby="roles-heading" className="mt-10">
        <h2 id="roles-heading" className="text-sm font-semibold">
          {t("yourRoles")}
        </h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {session.roles.map((role) => (
            <li
              key={role}
              className="rounded-full border border-border-strong/60 bg-surface px-3 py-1 text-sm font-medium"
            >
              {tRoles(role)}
            </li>
          ))}
        </ul>
      </section>

      <InquirySummary session={session} />

      <section aria-labelledby="modules-heading" className="mt-12">
        <h2 id="modules-heading" className="display-md">
          {t("overview.modulesHeading")}
        </h2>
        {modules.length === 0 ? (
          <p className="mt-4 text-muted-foreground">{t("overview.noModules")}</p>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {modules.map((module) => {
              const Icon = ADMIN_MODULE_ICONS[module.key];
              const planned = module.status === "planned";
              const description = module.key === "overview" ? null : t(`moduleDescriptions.${module.key}`);
              return (
                <li
                  key={module.key}
                  className="relative flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 transition-colors has-[a:hover]:border-border-strong"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex size-10 items-center justify-center rounded-xl bg-surface-muted text-accent-ink">
                      <Icon aria-hidden className="size-5" />
                    </span>
                    {planned && (
                      <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                        {t("plannedBadge")}
                      </span>
                    )}
                  </div>
                  <h3 className="font-semibold">
                    {planned ? (
                      t(`modules.${module.key}`)
                    ) : (
                      // The whole card is the link's target area.
                      <Link
                        href={module.href}
                        className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ring"
                      >
                        {t(`modules.${module.key}`)}
                      </Link>
                    )}
                  </h3>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/*
 * Reporting roles get aggregate counts across all inquiries (booking_report:
 * no personal data). Event managers get counts for the inquiries they can see.
 */
async function InquirySummary({ session }: { session: SignedInStaffSession }) {
  const canReport = hasPermission(session, "reports.read");
  const canRead = hasPermission(session, READ_BOOKINGS);
  if (!canReport && !canRead) return null;

  const t = await getTranslations("AdminBookings.summary");
  let stats: { label: string; value: number }[];

  if (canReport) {
    const report = await bookingReport();
    stats = [
      { label: t("total"), value: report.total },
      { label: t("last30"), value: report.last_30_days },
      { label: t("awaitingReview"), value: report.by_status.new ?? 0 },
      { label: t("open"), value: OPEN_STATUSES.reduce((sum, s) => sum + (report.by_status[s] ?? 0), 0) },
    ];
  } else {
    const counts = await inboxCounts();
    stats = [
      { label: t("total"), value: Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0) },
      { label: t("awaitingReview"), value: counts.new ?? 0 },
      { label: t("open"), value: OPEN_STATUSES.reduce((sum, s) => sum + (counts[s] ?? 0), 0) },
    ];
  }

  return (
    <section aria-labelledby="summary-heading" className="mt-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="summary-heading" className="display-md">
          {t("title")}
        </h2>
        {canRead && (
          <Link href="/admin/bookings" className={buttonVariants({ variant: "outline", size: "sm" })}>
            {t("openInbox")}
          </Link>
        )}
      </div>
      <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-border bg-surface p-5">
            <dt className="text-sm text-muted-foreground">{stat.label}</dt>
            <dd className="mt-2 font-display text-3xl tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
