import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  ClipboardList,
  Inbox,
  Languages,
  NotebookPen,
} from "lucide-react";
import { AccessDenied } from "@/components/admin/access-denied";
import { buttonVariants } from "@/components/ui/button";
import { ADMIN_MODULE_ICONS } from "@/features/admin/module-icons";
import { modulesFor } from "@/features/admin/modules";
import { bookingReport, inboxCounts, READ_BOOKINGS } from "@/features/bookings/admin-data";
import { OPEN_STATUSES } from "@/features/bookings/status";
import { listEntries, type CmsListFilters } from "@/features/cms/admin-data";
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
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
        <div>
          <p className="text-sm font-semibold text-accent-ink">{t("overview.welcome")}</p>
          <h1 className="mt-2 admin-title">{t("overview.title")}</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">{t("overview.intro")}</p>
        </div>
        <section aria-labelledby="roles-heading">
          <h2 id="roles-heading" className="text-xs font-semibold text-muted-foreground">
            {t("yourRoles")}
          </h2>
          <ul className="mt-2 flex flex-wrap gap-2">
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
      </header>

      <NeedsAttention session={session} />

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

/** Resolves to null instead of failing the page when one count cannot be loaded. */
async function settle<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch {
    return null;
  }
}

const LIST_DEFAULTS: CmsListFilters = { sort: "updated_desc", page: 1 };

/*
 * Work waiting for this role, each count computed with the same filters as
 * the screen it links to (the Translations screen lists unpublished entries
 * by default), so the number matches what opens. Roles without the matching
 * permission do not see the item; RLS limits what each count includes.
 */
async function NeedsAttention({ session }: { session: SignedInStaffSession }) {
  const canReadBookings = hasPermission(session, READ_BOOKINGS);
  const canReadContent = hasPermission(session, "content.read");
  const canTranslate = hasPermission(session, "translations.write");
  if (!canReadBookings && !canReadContent) return null;

  const t = await getTranslations("Admin.overview");
  const [counts, inReview, amharic] = await Promise.all([
    canReadBookings ? settle(inboxCounts) : null,
    canReadContent
      ? settle(() =>
          listEntries(null, { ...LIST_DEFAULTS, status: "in_review", translation: "unpublished" }, 1),
        )
      : null,
    canReadContent
      ? settle(() => listEntries(null, { ...LIST_DEFAULTS, translation: "unreviewed_am" }, 1))
      : null,
  ]);

  type Item = {
    key: "inquiries" | "assigned" | "review" | "amharic";
    Icon: typeof Inbox;
    count: number | null;
    text: string;
    href: string | null;
  };
  const items: Item[] = [];
  if (canReadBookings) {
    const count = counts ? (counts.new ?? 0) : null;
    items.push({
      key: "inquiries",
      Icon: Inbox,
      count,
      text: t("attentionNewInquiries", { count: count ?? 0 }),
      href: "/admin/bookings?status=new",
    });
  }
  if (canReadBookings && !hasPermission(session, "bookings.read_all")) {
    // Roles that see only their own assignments (RLS limits the counts to them).
    const count = counts
      ? OPEN_STATUSES.filter((status) => status !== "new").reduce(
          (sum, status) => sum + (counts[status] ?? 0),
          0,
        )
      : null;
    items.push({
      key: "assigned",
      Icon: ClipboardList,
      count,
      text: t("attentionAssigned", { count: count ?? 0 }),
      href: "/admin/bookings",
    });
  }
  if (canReadContent) {
    const reviewCount = inReview?.total ?? null;
    items.push({
      key: "review",
      Icon: NotebookPen,
      count: reviewCount,
      text: t("attentionInReview", { count: reviewCount ?? 0 }),
      href: canTranslate ? "/admin/translations?status=in_review" : null,
    });
    const amharicCount = amharic?.total ?? null;
    items.push({
      key: "amharic",
      Icon: Languages,
      count: amharicCount,
      text: t("attentionAmharic", { count: amharicCount ?? 0 }),
      href: canTranslate ? "/admin/translations?translation=unreviewed_am" : null,
    });
  }

  const waiting = items.filter((item) => item.count === null || item.count > 0);

  return (
    <section aria-labelledby="attention-heading" className="mt-10">
      <h2 id="attention-heading" className="display-md">
        {t("attentionTitle")}
      </h2>
      {waiting.length === 0 ? (
        <p className="mt-4 flex items-center gap-2.5 rounded-2xl border border-border bg-surface p-5 text-sm text-muted-foreground">
          <CircleCheck aria-hidden className="size-5 shrink-0 text-success" />
          {t("attentionNone")}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {waiting.map(({ key, Icon, count, text, href }) => (
            <li
              key={key}
              className="relative flex items-center gap-4 p-4 has-[a:hover]:bg-surface-muted sm:px-5"
            >
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-accent-ink">
                {count === null ? (
                  <CircleAlert aria-hidden className="size-5 text-warning" />
                ) : (
                  <Icon aria-hidden className="size-5" />
                )}
              </span>
              {count === null ? (
                <p className="text-sm text-muted-foreground">
                  {t("attentionUnavailable", { topic: t(`attentionTopics.${key}`) })}
                </p>
              ) : href ? (
                <Link
                  href={href}
                  className="flex flex-1 items-center justify-between gap-3 text-sm font-semibold after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring"
                >
                  {text}
                  <ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              ) : (
                <p className="text-sm font-semibold">{text}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
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
            <dd className="mt-2 font-display text-3xl font-bold tracking-tight tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
