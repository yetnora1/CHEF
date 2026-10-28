import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  FileText,
  Image as ImageIcon,
  Inbox,
  MessagesSquare,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { FilterDisclosure } from "@/components/admin/filter-disclosure";
import { Button, buttonVariants } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/form-controls";
import { BUSINESS_TIME_ZONE, formatCalendarDate } from "@/lib/format";
import { fieldLabelKey } from "@/features/cms/message-keys";
import { isSettingsField } from "@/features/settings/schema";
import { cn } from "@/lib/utils";
import type { AuditFilters } from "../admin-data";
import {
  AUDIT_CATEGORIES,
  auditDay,
  describeAuditEntry,
  recentDays,
  type AuditCategory,
  type AuditDescription,
  type AuditEntry,
  type AuditStatus,
  type AuditTarget,
} from "../describe";

const BASE = "/admin/audit-log";

const CATEGORY_ICONS: Record<AuditCategory, LucideIcon> = {
  role: ShieldCheck,
  booking: Inbox,
  contact_message: MessagesSquare,
  content: FileText,
  media: ImageIcon,
  settings: Settings,
};

/** Each area's colour (a `hue-*` utility in globals.css), so entries can be told apart at a glance. */
const CATEGORY_HUES: Record<AuditCategory, string> = {
  role: "hue-violet",
  booking: "hue-amber",
  contact_message: "hue-sky",
  content: "hue-teal",
  media: "hue-rose",
  settings: "hue-indigo",
};

function query(filters: AuditFilters, before?: number) {
  const params = new URLSearchParams();
  if (filters.category) params.set("category", filters.category);
  if (filters.actor) params.set("actor", filters.actor);
  if (before) params.set("before", String(before));
  const search = params.toString();
  return search ? `${BASE}?${search}` : BASE;
}

export async function AuditFiltersForm({
  filters,
  people,
}: {
  filters: AuditFilters;
  people: { id: string; name: string }[];
}) {
  const [t, tAdmin] = await Promise.all([getTranslations("AdminAudit"), getTranslations("Admin")]);
  const activeCount = [filters.category, filters.actor].filter(Boolean).length;

  return (
    <FilterDisclosure
      label={t("filters.label")}
      activeLabel={tAdmin("activeFilters", { count: activeCount })}
      activeCount={activeCount}
    >
      <form
        method="get"
        action={BASE}
        role="search"
        aria-label={t("filters.label")}
        className="grid gap-4 rounded-2xl border border-border glass p-4 sm:grid-cols-[1fr_1fr_auto]"
      >
        <label className="space-y-1.5">
          <span className="text-xs font-semibold">{t("filters.category")}</span>
          <NativeSelect name="category" defaultValue={filters.category ?? ""} className="h-11">
            <option value="">{t("filters.anyCategory")}</option>
            {AUDIT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {t(`categories.${category}`)}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-semibold">{t("filters.person")}</span>
          <NativeSelect name="actor" defaultValue={filters.actor ?? ""} className="h-11">
            <option value="">{t("filters.anyone")}</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <div className="flex items-end gap-2">
          <Button type="submit" size="sm" className="h-11 flex-1">
            {t("filters.apply")}
          </Button>
          <Link href={BASE} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-11")}>
            {t("filters.reset")}
          </Link>
        </div>
      </form>
    </FilterDisclosure>
  );
}

/**
 * The log, newest first and grouped by day (in the business time zone). Each
 * entry says who did what to which item, with a link to the item if it still
 * exists.
 */
export async function AuditList({
  entries,
  names,
  filters,
  nextBefore,
}: {
  entries: AuditEntry[];
  /** Staff names by id, for people named in details (e.g. a new assignee). */
  names: ReadonlyMap<string, string>;
  filters: AuditFilters;
  nextBefore: number | null;
}) {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("AdminAudit")]);
  const filtered = Boolean(filters.category || filters.actor);

  if (entries.length === 0) {
    return (
      <div className="space-y-4">
        <p className="rounded-2xl border border-border glass p-6 text-muted-foreground">
          {filters.before ? t("emptyOlder") : filtered ? t("emptyFiltered") : t("empty")}
        </p>
        {filters.before && <NewestLink filters={filters} label={t("newest")} />}
      </div>
    );
  }

  const time = new Intl.DateTimeFormat(locale === "am" ? "am-ET" : "en-GB", {
    timeStyle: "short",
    timeZone: BUSINESS_TIME_ZONE,
  });
  const { today, yesterday } = recentDays(BUSINESS_TIME_ZONE);
  const days: { day: string; entries: AuditEntry[] }[] = [];
  for (const entry of entries) {
    const day = auditDay(entry.occurredAt, BUSINESS_TIME_ZONE);
    const group = days.at(-1);
    if (group?.day === day) group.entries.push(entry);
    else days.push({ day, entries: [entry] });
  }

  return (
    <div className="space-y-8">
      {days.map(({ day, entries: dayEntries }) => (
        <section key={day} aria-labelledby={`audit-day-${day}`}>
          <h2 id={`audit-day-${day}`} className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
            {day === today || day === yesterday ? (
              <>
                {day === today ? t("today") : t("yesterday")}
                <span className="font-normal text-muted-foreground">{formatCalendarDate(locale, day)}</span>
              </>
            ) : (
              formatCalendarDate(locale, day)
            )}
          </h2>
          <ol className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border glass">
            {dayEntries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                names={names}
                time={time.format(new Date(entry.occurredAt))}
              />
            ))}
          </ol>
        </section>
      ))}
      <nav aria-label={t("pagesLabel")} className="flex flex-wrap gap-3">
        {filters.before && <NewestLink filters={filters} label={t("newest")} />}
        {nextBefore && (
          <Link
            href={query(filters, nextBefore)}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {t("older")}
            <ArrowRight aria-hidden />
          </Link>
        )}
      </nav>
    </div>
  );
}

function NewestLink({ filters, label }: { filters: AuditFilters; label: string }) {
  return (
    <Link href={query(filters)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
      {label}
    </Link>
  );
}

async function EntryRow({
  entry,
  names,
  time,
}: {
  entry: AuditEntry;
  names: ReadonlyMap<string, string>;
  time: string;
}) {
  const [t, tRoles, tBooking, tPublication, tMessages, tCms, tSettings] = await Promise.all([
    getTranslations("AdminAudit"),
    getTranslations("Roles"),
    getTranslations("BookingStatus"),
    getTranslations("PublicationStatus"),
    getTranslations("AdminMessages"),
    getTranslations("AdminCms"),
    getTranslations("AdminSettings"),
  ]);
  const described = describeAuditEntry(entry);
  const category = entry.action.split(".")[0] as AuditCategory;
  const Icon = CATEGORY_ICONS[category] ?? FileText;
  const hue = CATEGORY_HUES[category];

  const statusLabel = (status: AuditStatus | null) => {
    if (!status) return t("unknownValue");
    if (status.kind === "booking") return tBooking(status.value);
    if (status.kind === "content") return tPublication(status.value);
    return tMessages(status.value === "new" ? "statusNew" : "statusHandled");
  };
  const fieldLabel = (field: string) => {
    if (described.target.kind === "settings") {
      return isSettingsField(field) ? tSettings(`labels.${field}`) : field;
    }
    return tCms.has(fieldLabelKey(field)) ? tCms(fieldLabelKey(field)) : field.replaceAll("_", " ");
  };

  const what = summary(described, {
    t,
    role: described.role ? tRoles(described.role) : t("unknownValue"),
    from: statusLabel(described.from),
    to: statusLabel(described.to),
    assignee: described.assignee ? (names.get(described.assignee) ?? t("formerStaff")) : null,
    raw: entry.action,
  });
  const actor = entry.actorName ?? (entry.actorId ? t("formerStaff") : t("system"));
  const details = [
    described.fields.length > 0
      ? t("changedFields", { fields: described.fields.map(fieldLabel).join(", ") })
      : null,
    described.review ? t(`review.${described.review}`) : null,
  ].filter((detail) => detail !== null);

  return (
    <li className="grid gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-glass-raised sm:grid-cols-[3.5rem_minmax(0,1fr)_auto] sm:items-center">
      <p className="text-xs font-medium text-muted-foreground tabular-nums">
        <time dateTime={entry.occurredAt}>{time}</time>
      </p>
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-lg",
            hue ? cn("tint-chip", hue) : "bg-surface-muted text-accent-ink",
          )}
        >
          <Icon aria-hidden className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{what}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[t("by", { name: actor }), ...details].join(" · ")}
          </p>
        </div>
      </div>
      <TargetLink target={described.target} t={t} />
    </li>
  );
}

type AuditTranslator = Awaited<ReturnType<typeof getTranslations<"AdminAudit">>>;

function summary(
  described: AuditDescription,
  labels: {
    t: AuditTranslator;
    role: string;
    from: string;
    to: string;
    assignee: string | null;
    raw: string;
  },
): string {
  const { t } = labels;
  switch (described.action) {
    case null:
      return t("actions.unknown", { action: labels.raw });
    case "role.assigned":
    case "role.revoked":
      return t(`actions.${described.action}`, { role: labels.role });
    case "booking.status_changed":
    case "contact_message.status_changed":
    case "content.status_changed":
      return t("actions.statusChanged", { from: labels.from, to: labels.to });
    case "booking.assigned":
      return labels.assignee
        ? t("actions.booking.assigned", { name: labels.assignee })
        : t("actions.booking.unassigned");
    default:
      return t(`actions.${described.action}`);
  }
}

async function TargetLink({ target, t }: { target: AuditTarget; t: AuditTranslator }) {
  const tCms = await getTranslations("AdminCms");
  const language = (locale: "en" | "am" | null) => (locale ? ` · ${tCms(`languages.${locale}`)}` : "");
  let label: string;
  let href: string | null = null;
  switch (target.kind) {
    case "user":
      label = target.name ?? t("formerStaff");
      href = target.href;
      break;
    case "booking":
      label = t("targets.booking", { reference: target.reference });
      href = target.href;
      break;
    case "message":
      label = t("targets.message", { reference: target.reference });
      href = target.href;
      break;
    case "content":
      label = `${tCms(`types.${target.type}.singular`)}${language(target.locale)}`;
      href = target.href;
      break;
    case "media":
      label = `${t("targets.media")}${language(target.locale)}`;
      href = target.href;
      break;
    case "settings":
      label = t("targets.settings");
      href = target.href;
      break;
    case "unknown":
      label = [target.type, target.id].filter(Boolean).join(" ") || t("unknownValue");
      break;
  }
  const pill =
    "inline-flex max-w-full min-w-0 items-center gap-1 justify-self-start rounded-md border px-2 py-1 text-xs font-medium max-sm:ml-11 sm:max-w-56 sm:justify-self-end";
  return href ? (
    <Link
      href={href}
      className={cn(
        pill,
        "border-border bg-glass-raised transition-colors hover:border-border-strong hover:bg-glass-raised-hover",
      )}
    >
      <span className="truncate">{label}</span>
      <ArrowUpRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
    </Link>
  ) : (
    <span className={cn(pill, "border-dashed border-border text-muted-foreground")}>
      <span className="truncate">{label}</span>
    </span>
  );
}
