import { AlertTriangle, ArrowLeft, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { AccessDenied } from "@/components/admin/access-denied";
import { assignableStaff, getBookingDetail, READ_BOOKINGS } from "@/features/bookings/admin-data";
import { AssignForm, NoteForm, StatusForm } from "@/features/bookings/components/admin/workflow-forms";
import { StatusBadge } from "@/features/bookings/components/status-badge";
import { BOOKING_STATUSES, type BookingStatus } from "@/features/bookings/status";
import { LOCALE_NATIVE_NAMES } from "@/i18n/routing";
import { hasPermission } from "@/lib/auth/access";
import { authorizeAdmin } from "@/lib/auth/staff-session";
import { formatCalendarDate, formatTimestamp } from "@/lib/format";

// Blocks on the session cookie by design: nothing renders before authorization.
export const instant = false;

// Same shape the database enforces; anything else is shown as text, never as a
// mailto: link (which could carry extra recipients or a prefilled message).
const LINKABLE_EMAIL = /^[A-Za-z0-9_'+.-]+@([A-Za-z0-9][A-Za-z0-9-]*.)+[A-Za-z]{2,}$/;

export async function generateMetadata({
  params,
}: PageProps<"/admin/bookings/[reference]">): Promise<Metadata> {
  const { reference } = await params;
  return { title: /^CH-[0-9A-F]{10}$/.test(reference) ? reference : undefined };
}

export default async function AdminBookingDetailPage({ params }: PageProps<"/admin/bookings/[reference]">) {
  const decision = await authorizeAdmin(READ_BOOKINGS);
  if (decision.kind === "forbidden") return <AccessDenied email={decision.session.user.email} />;
  const { session } = decision;

  const { reference } = await params;
  const [locale, t, tForm, tStatus, tEvent, tContact, detail] = await Promise.all([
    getLocale(),
    getTranslations("AdminBookings"),
    getTranslations("Booking"),
    getTranslations("BookingStatus"),
    getTranslations("EventType"),
    getTranslations("ContactMethod"),
    getBookingDetail(reference),
  ]);

  // Same response for "does not exist" and "not yours": no existence oracle.
  if (!detail) {
    return (
      <div className="mx-auto max-w-xl space-y-4 rounded-2xl border border-border bg-surface p-7">
        <h1 className="display-md">{t("detail.notFoundTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("detail.notFoundBody")}</p>
        <BackLink label={t("detail.back")} />
      </div>
    );
  }

  const { booking } = detail;
  const canWrite =
    hasPermission(session, "bookings.write_all") ||
    (hasPermission(session, "bookings.write_assigned") && booking.assigned_to === session.user.id);
  const canAssign = hasPermission(session, "bookings.assign");
  const staff = canAssign ? await assignableStaff() : [];

  const statusLabels = Object.fromEntries(BOOKING_STATUSES.map((s) => [s, tStatus(s)])) as Record<
    BookingStatus,
    string
  >;
  const results = {
    saved: t("result.saved"),
    errorGeneric: t("result.errorGeneric"),
    errorTransition: t("result.errorTransition"),
    errorNotFound: t("result.errorNotFound"),
    errorAssignee: t("result.errorAssignee"),
    errorForbidden: t("result.errorForbidden"),
    errorNoteLength: t("result.errorNoteLength"),
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <BackLink label={t("detail.back")} />

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-wide">{booking.reference}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("detail.receivedOn", { date: formatTimestamp(locale, booking.created_at) })} ·{" "}
            {booking.source === "website" ? t("detail.sourceWebsite") : t("detail.sourceStaff")}
          </p>
        </div>
        <StatusBadge status={booking.status} label={tStatus(booking.status)} className="text-sm" />
      </header>

      {detail.possible_duplicate_reference && (
        <p className="flex items-start gap-2 rounded-xl border border-warning/50 bg-warning/8 p-4 text-sm">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          <Link
            href={`/admin/bookings/${detail.possible_duplicate_reference}`}
            className="underline decoration-warning/60 underline-offset-2 hover:decoration-current"
          >
            {t("detail.duplicateWarning", { reference: detail.possible_duplicate_reference })}
          </Link>
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Panel title={t("detail.eventDetails")}>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Item label={t("table.event")}>{tEvent(booking.event_type)}</Item>
              <Item label={t("table.eventDate")}>
                {booking.event_date ? formatCalendarDate(locale, booking.event_date) : t("table.noDate")}
              </Item>
              <Item label={t("table.guests")}>{booking.guest_count ?? t("detail.none")}</Item>
              <Item label={tForm("venue")}>{booking.venue ?? t("detail.none")}</Item>
            </dl>
          </Panel>

          <Panel title={t("detail.requirements")}>
            <Text value={booking.service_requirements} empty={t("detail.none")} />
            <h3 className="mt-5 text-sm font-semibold">{t("detail.message")}</h3>
            <Text value={booking.message} empty={t("detail.none")} />
          </Panel>

          <Panel title={t("detail.contact")}>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Item label={t("table.customer")}>{booking.contact_name}</Item>
              <Item label={tForm("email")}>
                {LINKABLE_EMAIL.test(booking.contact_email) ? (
                  <a
                    href={`mailto:${booking.contact_email}`}
                    className="break-all underline underline-offset-2"
                  >
                    {booking.contact_email}
                  </a>
                ) : (
                  <span className="break-all">{booking.contact_email}</span>
                )}
              </Item>
              <Item label={t("detail.preferredContact")}>{tContact(booking.preferred_contact_method)}</Item>
              {booking.contact_phone && (
                <Item label={tForm("phone")}>
                  <a
                    href={`tel:${booking.contact_phone.replace(/[^\d+]/g, "")}`}
                    className="underline underline-offset-2"
                  >
                    {booking.contact_phone}
                  </a>
                </Item>
              )}
              <Item label={t("detail.language")}>
                <span lang={booking.preferred_locale}>{LOCALE_NATIVE_NAMES[booking.preferred_locale]}</span>
              </Item>
            </dl>
          </Panel>
        </div>

        <div className="space-y-6">
          {canWrite && (
            <Panel title={t("detail.workflow")}>
              <StatusForm
                key={booking.status}
                bookingId={booking.id}
                current={booking.status}
                statusLabels={statusLabels}
                results={results}
                labels={{
                  nextStatus: t("detail.nextStatus"),
                  choose: t("detail.choose"),
                  note: t("detail.statusNote"),
                  submit: t("detail.updateStatus"),
                  noTransitions: t("detail.noTransitions"),
                  confirmTitles: Object.fromEntries(
                    BOOKING_STATUSES.map((s) => [s, t("detail.confirmTitle", { status: statusLabels[s] })]),
                  ) as Record<BookingStatus, string>,
                  confirmBody: t("detail.confirmBody"),
                  confirmConfirmedBody: t("detail.confirmConfirmedBody"),
                  confirm: t("detail.confirm"),
                  cancel: t("detail.cancel"),
                }}
              />
            </Panel>
          )}

          <Panel title={t("detail.assignment")}>
            {canAssign ? (
              <AssignForm
                key={booking.assigned_to ?? "none"}
                bookingId={booking.id}
                current={booking.assigned_to}
                staff={staff}
                results={results}
                labels={{
                  assignTo: t("detail.assignTo"),
                  unassigned: t("table.unassigned"),
                  submit: t("detail.saveAssignment"),
                  confirmTitle: t("detail.confirmAssignTitle"),
                  confirmBody: t("detail.confirmAssignBody"),
                  confirm: t("detail.confirm"),
                  cancel: t("detail.cancel"),
                }}
              />
            ) : (
              <p className="text-sm">{detail.assignee_name ?? t("table.unassigned")}</p>
            )}
          </Panel>

          <Panel title={t("detail.notes")}>
            <p className="mb-4 flex items-start gap-2 text-xs text-muted-foreground">
              <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              {t("detail.notesPrivacy")}
            </p>
            {detail.notes.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("detail.noNotes")}</p>
            ) : (
              <ul className="space-y-3">
                {detail.notes.map((note) => (
                  <li key={note.id} className="rounded-xl bg-surface-muted p-3.5">
                    <p className="text-sm whitespace-pre-wrap">{note.body}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {note.author_name ?? "—"} · {formatTimestamp(locale, note.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {canWrite && (
              <div className="mt-5 border-t border-border pt-5">
                <NoteForm
                  bookingId={booking.id}
                  results={results}
                  labels={{
                    note: t("detail.addNote"),
                    placeholder: t("detail.notePlaceholder"),
                    submit: t("detail.addNote"),
                  }}
                />
              </div>
            )}
          </Panel>

          <Panel title={t("detail.history")}>
            <ol className="space-y-4 border-l border-border pl-5">
              {detail.history.map((entry, index) => (
                <li key={`${entry.changed_at}-${index}`} className="relative">
                  <span
                    aria-hidden
                    className="absolute top-1.5 -left-[1.4rem] size-2.5 rounded-full bg-accent"
                  />
                  <p className="text-sm font-medium">
                    {entry.from_status
                      ? `${tStatus(entry.from_status)} → ${tStatus(entry.to_status)}`
                      : `${t("detail.historyCreated")}: ${tStatus(entry.to_status)}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatTimestamp(locale, entry.changed_at)}
                    {entry.changed_by_name ? ` · ${t("detail.by", { name: entry.changed_by_name })}` : ""}
                  </p>
                  {entry.note && <p className="mt-1 text-sm whitespace-pre-wrap">{entry.note}</p>}
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function BackLink({ label }: { label: string }) {
  return (
    <Link
      href="/admin/bookings"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft aria-hidden className="size-4" />
      {label}
    </Link>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

/** Customer text is rendered as text (React escapes it); line breaks are preserved. */
function Text({ value, empty }: { value: string | null; empty: string }) {
  return value ? (
    <p className="text-sm whitespace-pre-wrap">{value}</p>
  ) : (
    <p className="text-sm text-muted-foreground">{empty}</p>
  );
}
