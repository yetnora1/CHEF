import { ChevronLeft, ChevronRight, Copy, Search } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { FilterDisclosure } from "@/components/admin/filter-disclosure";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/form-controls";
import { formatCalendarDate, formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PAGE_SIZE, SORTS, type BookingListRow, type ListFilters } from "../../admin-data";
import { BOOKING_STATUSES, EVENT_TYPES, type BookingStatus } from "../../status";
import { StatusBadge } from "../status-badge";

const BASE = "/admin/bookings";

export function inboxHref(filters: Partial<ListFilters>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (
      value === undefined ||
      value === "" ||
      (key === "sort" && value === "received_desc") ||
      (key === "page" && value === 1)
    ) {
      continue;
    }
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${BASE}?${query}` : BASE;
}

export async function StatusTabs({
  counts,
  filters,
}: {
  counts: Partial<Record<BookingStatus, number>>;
  filters: ListFilters;
}) {
  const [t, tStatus] = await Promise.all([
    getTranslations("AdminBookings"),
    getTranslations("BookingStatus"),
  ]);
  const total = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);
  const tabs: { key: BookingStatus | undefined; label: string; count: number }[] = [
    { key: undefined, label: t("all"), count: total },
    ...BOOKING_STATUSES.filter((s) => counts[s]).map((s) => ({
      key: s,
      label: tStatus(s),
      count: counts[s] ?? 0,
    })),
  ];

  return (
    <nav aria-label={t("filters.status")} className="-mx-1 overflow-x-auto pb-1">
      <ul className="flex min-w-max gap-1.5 px-1">
        {tabs.map((tab) => {
          const active = filters.status === tab.key;
          return (
            <li key={tab.key ?? "all"}>
              <Link
                href={inboxHref({ ...filters, status: tab.key, page: 1 })}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border px-3.5 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface hover:border-border-strong",
                )}
              >
                {tab.label}
                <span className={cn("tabular-nums", active ? "opacity-85" : "text-muted-foreground")}>
                  {tab.count}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export async function InboxFilters({
  filters,
  staff,
}: {
  filters: ListFilters;
  staff: { id: string; name: string }[] | null;
}) {
  const [t, tStatus, tEvent, tAdmin] = await Promise.all([
    getTranslations("AdminBookings.filters"),
    getTranslations("BookingStatus"),
    getTranslations("EventType"),
    getTranslations("Admin"),
  ]);
  const activeCount = [
    filters.q,
    filters.status,
    filters.type,
    filters.from,
    filters.to,
    filters.assignee,
  ].filter(Boolean).length;

  return (
    <FilterDisclosure
      label={t("label")}
      activeLabel={tAdmin("activeFilters", { count: activeCount })}
      activeCount={activeCount}
    >
      <form
        method="get"
        action={BASE}
        role="search"
        aria-label={t("label")}
        className="grid gap-4 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <label className="space-y-1.5 sm:col-span-2">
          <span className="text-xs font-semibold">{t("search")}</span>
          <span className="relative block">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              name="q"
              type="search"
              defaultValue={filters.q ?? ""}
              placeholder={t("searchPlaceholder")}
              maxLength={100}
              className="h-11 pl-10"
            />
          </span>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-semibold">{t("status")}</span>
          <NativeSelect name="status" defaultValue={filters.status ?? ""} className="h-11">
            <option value="">{t("anyStatus")}</option>
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {tStatus(s)}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-semibold">{t("eventType")}</span>
          <NativeSelect name="type" defaultValue={filters.type ?? ""} className="h-11">
            <option value="">{t("anyEventType")}</option>
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {tEvent(type)}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-semibold">{t("from")}</span>
          <Input name="from" type="date" defaultValue={filters.from ?? ""} className="h-11" />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-semibold">{t("to")}</span>
          <Input name="to" type="date" defaultValue={filters.to ?? ""} className="h-11" />
        </label>
        {staff && (
          <label className="space-y-1.5">
            <span className="text-xs font-semibold">{t("assignee")}</span>
            <NativeSelect name="assignee" defaultValue={filters.assignee ?? ""} className="h-11">
              <option value="">{t("anyone")}</option>
              <option value="unassigned">{t("unassigned")}</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </label>
        )}
        <label className="space-y-1.5">
          <span className="text-xs font-semibold">{t("sort")}</span>
          <NativeSelect name="sort" defaultValue={filters.sort} className="h-11">
            {SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {t(
                  sort === "received_desc"
                    ? "sortReceivedDesc"
                    : sort === "received_asc"
                      ? "sortReceivedAsc"
                      : sort === "event_date_asc"
                        ? "sortEventAsc"
                        : "sortEventDesc",
                )}
              </option>
            ))}
          </NativeSelect>
        </label>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1 lg:col-start-4">
          <Button type="submit" size="sm" className="h-11 flex-1">
            {t("apply")}
          </Button>
          <Link href={BASE} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-11")}>
            {t("reset")}
          </Link>
        </div>
      </form>
    </FilterDisclosure>
  );
}

export async function InboxList({
  rows,
  total,
  filters,
}: {
  rows: BookingListRow[];
  total: number;
  filters: ListFilters;
}) {
  const [locale, t, tStatus, tEvent] = await Promise.all([
    getLocale(),
    getTranslations("AdminBookings"),
    getTranslations("BookingStatus"),
    getTranslations("EventType"),
  ]);

  if (rows.length === 0) {
    const filtered = Boolean(
      filters.q || filters.status || filters.type || filters.from || filters.to || filters.assignee,
    );
    return (
      <p className="rounded-2xl border border-dashed border-border-strong/60 p-10 text-center text-muted-foreground">
        {filtered || filters.page > 1 ? t("empty") : t("emptyAll")}
      </p>
    );
  }

  const detailHref = (reference: string) => `${BASE}/${reference}`;
  const eventDate = (row: BookingListRow) =>
    row.event_date ? formatCalendarDate(locale, row.event_date) : t("table.noDate");
  const assignee = (row: BookingListRow) => row.assignee_name ?? t("table.unassigned");
  const duplicate = (row: BookingListRow) =>
    row.possible_duplicate ? (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-warning">
        <Copy aria-hidden className="size-3" />
        {t("table.possibleDuplicate")}
      </span>
    ) : null;

  return (
    <>
      {/* Desktop and tablet: table */}
      <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{t("table.caption")}</caption>
          <thead className="border-b border-border text-xs font-semibold text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3">
                {t("table.reference")}
              </th>
              <th scope="col" className="px-4 py-3">
                {t("table.customer")}
              </th>
              <th scope="col" className="px-4 py-3">
                {t("table.event")}
              </th>
              <th scope="col" className="px-4 py-3">
                {t("table.eventDate")}
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                {t("table.guests")}
              </th>
              <th scope="col" className="px-4 py-3">
                {t("table.status")}
              </th>
              <th scope="col" className="px-4 py-3">
                {t("table.assignee")}
              </th>
              <th scope="col" className="px-4 py-3">
                {t("table.received")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id} className="align-top transition-colors hover:bg-surface-muted/60">
                <td className="px-4 py-3 font-mono text-xs font-semibold whitespace-nowrap">
                  <Link href={detailHref(row.reference)} className="underline-offset-2 hover:underline">
                    {row.reference}
                  </Link>
                  <div className="mt-1 font-sans">{duplicate(row)}</div>
                </td>
                <td className="max-w-56 px-4 py-3">
                  <div className="truncate font-medium">{row.contact_name}</div>
                  <div className="truncate text-xs text-muted-foreground">{row.contact_email}</div>
                </td>
                <td className="px-4 py-3">{tEvent(row.event_type)}</td>
                <td className="px-4 py-3 whitespace-nowrap">{eventDate(row)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{row.guest_count ?? "–"}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={row.status} label={tStatus(row.status)} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">{assignee(row)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                  {formatTimestamp(locale, row.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phones: one card per inquiry */}
      <ul className="space-y-3 md:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={detailHref(row.reference)}
              className="block space-y-2 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-border-strong"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-semibold">{row.reference}</span>
                <StatusBadge status={row.status} label={tStatus(row.status)} />
              </div>
              <p className="font-medium">{row.contact_name}</p>
              <p className="text-sm text-muted-foreground">
                {tEvent(row.event_type)} · {eventDate(row)}
                {row.guest_count ? ` · ${t("table.guestsCount", { count: row.guest_count })}` : ""}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{assignee(row)}</span>
                <span>{formatTimestamp(locale, row.created_at)}</span>
              </div>
              {duplicate(row)}
            </Link>
          </li>
        ))}
      </ul>

      <Pagination total={total} filters={filters} />
    </>
  );
}

async function Pagination({ total, filters }: { total: number; filters: ListFilters }) {
  const t = await getTranslations("AdminBookings.pagination");
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = (filters.page - 1) * PAGE_SIZE + 1;
  const to = Math.min(filters.page * PAGE_SIZE, total);

  return (
    <nav aria-label={t("label")} className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground tabular-nums">{t("showing", { from, to, total })}</p>
      <div className="flex gap-2">
        {filters.page > 1 ? (
          <Link
            href={inboxHref({ ...filters, page: filters.page - 1 })}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <ChevronLeft aria-hidden />
            {t("previous")}
          </Link>
        ) : null}
        {filters.page < pages ? (
          <Link
            href={inboxHref({ ...filters, page: filters.page + 1 })}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {t("next")}
            <ChevronRight aria-hidden />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
