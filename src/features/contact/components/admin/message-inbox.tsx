import { ChevronLeft, ChevronRight, Mail, Phone, Search } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/form-controls";
import { LOCALE_NATIVE_NAMES, type AppLocale } from "@/i18n/routing";
import { formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  MESSAGE_PAGE_SIZE,
  type MessageFilters,
  type MessageRow,
  type MessageStatus,
} from "../../admin-data";
import { MessageStatusForm } from "./message-status-form";

const BASE = "/admin/messages";

export function messagesHref(filters: Partial<MessageFilters>): string {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== "new") params.set("status", filters.status);
  if (filters.q) params.set("q", filters.q);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  const query = params.toString();
  return query ? `${BASE}?${query}` : BASE;
}

export async function MessageTabs({
  counts,
  filters,
}: {
  counts: Record<MessageStatus, number>;
  filters: MessageFilters;
}) {
  const t = await getTranslations("AdminMessages");
  const tabs = [
    { key: "new", label: t("statusNew"), count: counts.new },
    { key: "handled", label: t("statusHandled"), count: counts.handled },
    { key: "all", label: t("all"), count: counts.new + counts.handled },
  ] as const;

  return (
    <nav aria-label={t("tabsLabel")} className="-mx-1 overflow-x-auto pb-1">
      <ul className="flex min-w-max gap-1.5 px-1">
        {tabs.map((tab) => {
          const active = filters.status === tab.key;
          return (
            <li key={tab.key}>
              <Link
                href={messagesHref({ ...filters, status: tab.key, page: 1 })}
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

export async function MessageSearch({ filters }: { filters: MessageFilters }) {
  const t = await getTranslations("AdminMessages");
  return (
    <form method="get" action={BASE} role="search" className="flex flex-wrap items-end gap-2">
      {filters.status !== "new" && <input type="hidden" name="status" value={filters.status} />}
      <label className="min-w-60 flex-1 space-y-1.5">
        <span className="text-xs font-semibold">{t("searchLabel")}</span>
        <span className="relative block">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder={t("searchPlaceholder")}
            maxLength={100}
            className="h-11 pl-10"
          />
        </span>
      </label>
      <Button type="submit" size="sm" className="h-11">
        {t("search")}
      </Button>
      {filters.q && (
        <Link
          href={messagesHref({ status: filters.status })}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-11")}
        >
          {t("clearSearch")}
        </Link>
      )}
    </form>
  );
}

export async function MessageList({
  rows,
  total,
  filters,
  canWrite,
}: {
  rows: MessageRow[];
  total: number;
  filters: MessageFilters;
  canWrite: boolean;
}) {
  const [t, locale] = await Promise.all([
    getTranslations("AdminMessages"),
    getLocale() as Promise<AppLocale>,
  ]);

  if (rows.length === 0) {
    const empty = filters.q ? t("emptySearch") : filters.status === "all" ? t("emptyAll") : t("empty");
    return (
      <p className="rounded-2xl border border-dashed border-border-strong/60 p-10 text-center text-muted-foreground">
        {empty}
      </p>
    );
  }

  const labels = {
    markHandled: t("markHandled"),
    markNew: t("markNew"),
    errorGeneric: t("errorGeneric"),
    errorForbidden: t("errorForbidden"),
    errorNotFound: t("errorNotFound"),
  };

  return (
    <>
      <ul className="space-y-4">
        {rows.map((row) => {
          const replySubject = t("replySubject", { subject: row.subject ?? row.reference });
          return (
            <li key={row.id}>
              <article
                aria-labelledby={`message-${row.id}`}
                className="rounded-2xl border border-border bg-surface p-5 sm:p-6"
              >
                <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                  <div className="min-w-0">
                    <h2 id={`message-${row.id}`} className="text-lg font-semibold break-words">
                      {row.subject ?? <span className="text-muted-foreground">{t("noSubject")}</span>}
                    </h2>
                    <p className="mt-1 text-sm break-words">
                      <span className="font-medium">{row.contact_name}</span>
                      <span className="text-muted-foreground"> · {row.contact_email}</span>
                      {row.contact_phone && (
                        <span className="text-muted-foreground"> · {row.contact_phone}</span>
                      )}
                    </p>
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground sm:text-right">
                    <p>
                      <span
                        className={cn(
                          "mr-2 inline-flex rounded-full px-2 py-0.5 font-semibold",
                          row.status === "new"
                            ? "bg-accent/15 text-accent-ink"
                            : "bg-surface-muted text-muted-foreground",
                        )}
                      >
                        {row.status === "new" ? t("statusNew") : t("statusHandled")}
                      </span>
                      <time dateTime={row.created_at}>
                        {t("received", { date: formatTimestamp(locale, row.created_at) })}
                      </time>
                    </p>
                    <p>
                      <span className="font-mono font-semibold">{row.reference}</span>
                      {" · "}
                      {t("siteLanguage", { language: LOCALE_NATIVE_NAMES[row.preferred_locale] })}
                    </p>
                  </div>
                </header>

                <p className="mt-4 text-sm leading-relaxed break-words whitespace-pre-wrap">{row.message}</p>

                <footer className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
                  <a
                    href={`mailto:${row.contact_email}?subject=${encodeURIComponent(replySubject)}`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    <Mail aria-hidden />
                    {t("replyByEmail")}
                  </a>
                  {row.contact_phone && (
                    <a
                      href={`tel:${row.contact_phone.replace(/[^\d+]/g, "")}`}
                      className={buttonVariants({ variant: "ghost", size: "sm" })}
                    >
                      <Phone aria-hidden />
                      {t("call")}
                    </a>
                  )}
                  {canWrite && <MessageStatusForm messageId={row.id} status={row.status} labels={labels} />}
                  {row.status === "handled" && row.handled_at && (
                    <p className="text-xs text-muted-foreground sm:ml-auto">
                      {row.handled_by_name
                        ? t("handledBy", {
                            name: row.handled_by_name,
                            date: formatTimestamp(locale, row.handled_at),
                          })
                        : t("handledOn", { date: formatTimestamp(locale, row.handled_at) })}
                    </p>
                  )}
                </footer>
              </article>
            </li>
          );
        })}
      </ul>
      <Pagination total={total} filters={filters} />
    </>
  );
}

async function Pagination({ total, filters }: { total: number; filters: MessageFilters }) {
  const t = await getTranslations("AdminMessages.pagination");
  const pages = Math.max(1, Math.ceil(total / MESSAGE_PAGE_SIZE));
  const from = (filters.page - 1) * MESSAGE_PAGE_SIZE + 1;
  const to = Math.min(filters.page * MESSAGE_PAGE_SIZE, total);

  return (
    <nav aria-label={t("label")} className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground tabular-nums">{t("showing", { from, to, total })}</p>
      <div className="flex gap-2">
        {filters.page > 1 ? (
          <Link
            href={messagesHref({ ...filters, page: filters.page - 1 })}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <ChevronLeft aria-hidden />
            {t("previous")}
          </Link>
        ) : null}
        {filters.page < pages ? (
          <Link
            href={messagesHref({ ...filters, page: filters.page + 1 })}
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
