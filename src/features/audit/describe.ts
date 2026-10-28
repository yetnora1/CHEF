import { BOOKING_STATUSES, type BookingStatus } from "@/features/bookings/status";
import {
  CONTENT,
  isContentType,
  isPublicationStatus,
  type ContentType,
  type PublicationStatus,
} from "@/features/cms/content-types";
import { isAppRole, type AppRole } from "@/lib/permissions/matrix";

/*
 * Turns raw audit rows (supabase/migrations: assign_role, the inquiry and
 * message workflows, the CMS and settings triggers) into the parts the audit
 * screen labels in plain language. Details are untrusted JSON, so every value
 * is checked before use; anything unknown is shown as its raw code.
 */

/** The part of an action before the first dot; the screen filters by these. */
export const AUDIT_CATEGORIES = [
  "role",
  "booking",
  "contact_message",
  "content",
  "media",
  "settings",
] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export const KNOWN_ACTIONS = [
  "role.assigned",
  "role.revoked",
  "role.bootstrap_owner",
  "booking.status_changed",
  "booking.assigned",
  "booking.erased",
  "contact_message.status_changed",
  "content.created",
  "content.updated",
  "content.deleted",
  "content.status_changed",
  "media.created",
  "media.updated",
  "media.deleted",
  "media.uploaded",
  "media.replaced",
  "settings.updated",
] as const;
export type KnownAction = (typeof KNOWN_ACTIONS)[number];

export type AuditEntry = {
  id: number;
  occurredAt: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetName: string | null;
  details: Record<string, unknown>;
};

/** A status in the workflow the entry belongs to; the screen labels it. */
export type AuditStatus =
  | { kind: "booking"; value: BookingStatus }
  | { kind: "message"; value: "new" | "handled" }
  | { kind: "content"; value: PublicationStatus };

export type AuditTarget =
  | { kind: "user"; name: string | null; href: string }
  | { kind: "booking"; reference: string; href: string | null }
  | { kind: "message"; reference: string; href: string }
  | { kind: "content"; type: ContentType; locale: "en" | "am" | null; href: string | null }
  | { kind: "media"; locale: "en" | "am" | null; href: string | null }
  | { kind: "settings"; href: string }
  | { kind: "unknown"; type: string | null; id: string | null };

export type AuditDescription = {
  /** Null for an action this screen does not know: it shows the raw code. */
  action: KnownAction | null;
  role: AppRole | null;
  from: AuditStatus | null;
  to: AuditStatus | null;
  /** booking.assigned: the new assignee's id (null when unassigned). */
  assignee: string | null;
  fields: string[];
  review: "confirmed" | "cleared" | null;
  target: AuditTarget;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BOOKING_REFERENCE = /^CH-[0-9A-F]{10}$/;
const MESSAGE_REFERENCE = /^CM-[0-9A-F]{10}$/;

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

function isKnownAction(action: string): action is KnownAction {
  return (KNOWN_ACTIONS as readonly string[]).includes(action);
}

function status(category: string, value: unknown): AuditStatus | null {
  if (typeof value !== "string") return null;
  if (category === "booking" && (BOOKING_STATUSES as readonly string[]).includes(value))
    return { kind: "booking", value: value as BookingStatus };
  if (category === "contact_message" && (value === "new" || value === "handled"))
    return { kind: "message", value };
  if (category === "content" && isPublicationStatus(value)) return { kind: "content", value };
  return null;
}

function locale(value: unknown): "en" | "am" | null {
  return value === "en" || value === "am" ? value : null;
}

function target(entry: AuditEntry, deleted: boolean): AuditTarget {
  const { targetType: type, targetId: id, details } = entry;
  if (type === "user" && id && UUID.test(id))
    return { kind: "user", name: entry.targetName, href: `/admin/users#staff-${id}` };
  if (type === "booking" && id && BOOKING_REFERENCE.test(id))
    return { kind: "booking", reference: id, href: deleted ? null : `/admin/bookings/${id}` };
  if (type === "contact_message" && id && MESSAGE_REFERENCE.test(id))
    return { kind: "message", reference: id, href: `/admin/messages?status=all&q=${id}` };
  if (type === "site_settings") return { kind: "settings", href: "/admin/settings" };
  if (type?.startsWith("media_asset")) {
    const href = id && UUID.test(id) && !deleted ? `/admin/media/${id}` : null;
    return { kind: "media", locale: locale(details.locale), href };
  }
  // service, service_translation, page_image… all belong to one content entry.
  const base = type?.replace(/_(translation|image)$/, "");
  if (base && isContentType(base)) {
    const def = CONTENT[base];
    const valid = id && (def.idColumn === "key" ? /^[a-z_]+$/.test(id) : UUID.test(id));
    // Deleting a language version leaves the entry itself in place.
    const entryDeleted = deleted && type === base;
    return {
      kind: "content",
      type: base,
      locale: locale(details.locale),
      href: valid && !entryDeleted ? `${def.basePath}/${id}` : null,
    };
  }
  return { kind: "unknown", type, id };
}

// Described separately: the status change and the Amharic review.
const HIDDEN_FIELDS = new Set(["status", "language_reviewed_at"]);

export function describeAuditEntry(entry: AuditEntry): AuditDescription {
  const action = isKnownAction(entry.action) ? entry.action : null;
  const category = entry.action.split(".")[0] ?? "";
  const { details } = entry;
  const fields = Array.isArray(details.fields)
    ? details.fields.filter(
        (field): field is string => typeof field === "string" && !HIDDEN_FIELDS.has(field),
      )
    : [];
  const review = details.review === "confirmed" || details.review === "cleared" ? details.review : null;
  const role = isAppRole(details.role) ? details.role : null;
  const assignee = text(details.to);

  return {
    action,
    role,
    from: status(category, details.from),
    to: status(category, action === "content.status_changed" ? details.status : details.to),
    assignee: action === "booking.assigned" && assignee && UUID.test(assignee) ? assignee : null,
    fields,
    review,
    target: target(entry, action === "booking.erased" || entry.action.endsWith(".deleted")),
  };
}

/** Business-day key (YYYY-MM-DD in the business time zone) for grouping entries by day. */
export function auditDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The business days shown as "Today" and "Yesterday". */
export function recentDays(timeZone: string, now: Date = new Date()): { today: string; yesterday: string } {
  return {
    today: auditDay(now.toISOString(), timeZone),
    yesterday: auditDay(new Date(now.getTime() - DAY_MS).toISOString(), timeZone),
  };
}
