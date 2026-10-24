/**
 * Inquiry lifecycle. The database enforces these transitions
 * (private.is_allowed_booking_transition); this mirror lets the UI offer only
 * valid next steps. tests/integration/db/inquiry-workflow.test.ts compares the
 * two for every pair of statuses.
 */

export const BOOKING_STATUSES = [
  "new",
  "in_review",
  "contacted",
  "quoted",
  "confirmed",
  "completed",
  "declined",
  "cancelled",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  new: ["in_review", "contacted", "declined", "cancelled"],
  in_review: ["contacted", "quoted", "declined", "cancelled"],
  contacted: ["quoted", "confirmed", "declined", "cancelled"],
  quoted: ["contacted", "confirmed", "declined", "cancelled"],
  confirmed: ["completed", "cancelled"],
  completed: [],
  declined: ["in_review"],
  cancelled: ["in_review"],
};

/** Changes that commit the business or close an inquiry ask for confirmation. */
export const CONSEQUENTIAL_STATUSES: ReadonlySet<BookingStatus> = new Set([
  "confirmed",
  "completed",
  "declined",
  "cancelled",
]);

export const OPEN_STATUSES: readonly BookingStatus[] = [
  "new",
  "in_review",
  "contacted",
  "quoted",
  "confirmed",
];

export function isBookingStatus(value: unknown): value is BookingStatus {
  return (BOOKING_STATUSES as readonly unknown[]).includes(value);
}

export const EVENT_TYPES = [
  "wedding",
  "corporate",
  "summit",
  "private_dining",
  "culinary_experience",
  "other",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export function isEventType(value: unknown): value is EventType {
  return (EVENT_TYPES as readonly unknown[]).includes(value);
}

export const CONTACT_METHODS = ["email", "phone", "messaging_app"] as const;

export type ContactMethod = (typeof CONTACT_METHODS)[number];
