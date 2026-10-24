import "server-only";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BOOKING_STATUSES, CONTACT_METHODS, EVENT_TYPES } from "./status";

/*
 * Admin reads. Every call uses the signed-in staff member's own Supabase client,
 * so RLS (via SECURITY INVOKER functions) decides what they can see; staff
 * without booking access simply get no rows. Responses are validated before use.
 */

export const PAGE_SIZE = 20;
export const BOOKING_REFERENCE = /^CH-[0-9A-F]{10}$/;
export const READ_BOOKINGS = ["bookings.read_all", "bookings.read_assigned"] as const;
export const WRITE_BOOKINGS = ["bookings.write_all", "bookings.write_assigned"] as const;

export class BookingDataError extends Error {
  constructor(operation: string, cause: unknown) {
    super(`Booking data could not be loaded: ${operation}`, { cause });
    this.name = "BookingDataError";
  }
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const SORTS = ["received_desc", "received_asc", "event_date_asc", "event_date_desc"] as const;

// Unknown or malformed query parameters are ignored rather than rejected.
const filtersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(BOOKING_STATUSES).optional().catch(undefined),
  type: z.enum(EVENT_TYPES).optional().catch(undefined),
  from: isoDate.optional().catch(undefined),
  to: isoDate.optional().catch(undefined),
  assignee: z
    .union([z.literal("unassigned"), z.uuid()])
    .optional()
    .catch(undefined),
  sort: z.enum(SORTS).catch("received_desc"),
  page: z.coerce.number().int().min(1).max(500).catch(1),
});

export type ListFilters = z.infer<typeof filtersSchema>;

export function parseListFilters(params: Record<string, string | string[] | undefined>): ListFilters {
  const first = Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );
  const filters = filtersSchema.parse(first);
  return { ...filters, q: filters.q || undefined };
}

const listRowSchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  status: z.enum(BOOKING_STATUSES),
  event_type: z.enum(EVENT_TYPES),
  event_date: z.string().nullable(),
  guest_count: z.number().int().nullable(),
  contact_name: z.string(),
  contact_email: z.string(),
  assigned_to: z.uuid().nullable(),
  assignee_name: z.string().nullable(),
  possible_duplicate: z.boolean(),
  created_at: z.string(),
  total_count: z.coerce.number(),
});

export type BookingListRow = z.infer<typeof listRowSchema>;

async function client() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new BookingDataError("client", "Supabase is not configured");
  return supabase;
}

export async function listBookings(filters: ListFilters): Promise<{ rows: BookingListRow[]; total: number }> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("list_bookings", {
    p_search: filters.q ?? null,
    p_statuses: filters.status ? [filters.status] : null,
    p_event_types: filters.type ? [filters.type] : null,
    p_event_from: filters.from ?? null,
    p_event_to: filters.to ?? null,
    p_assignee: filters.assignee && filters.assignee !== "unassigned" ? filters.assignee : null,
    p_unassigned_only: filters.assignee === "unassigned",
    p_sort: filters.sort,
    p_limit: PAGE_SIZE,
    p_offset: (filters.page - 1) * PAGE_SIZE,
  });
  if (error) throw new BookingDataError("list_bookings", error);
  const rows = z.array(listRowSchema).parse(data ?? []);
  return { rows, total: rows[0]?.total_count ?? 0 };
}

export async function inboxCounts(): Promise<Partial<Record<(typeof BOOKING_STATUSES)[number], number>>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("booking_inbox_counts");
  if (error) throw new BookingDataError("booking_inbox_counts", error);
  const rows = z
    .array(z.object({ status: z.enum(BOOKING_STATUSES), total: z.coerce.number() }))
    .parse(data ?? []);
  return Object.fromEntries(rows.map((r) => [r.status, r.total]));
}

const reportSchema = z.object({
  total: z.coerce.number(),
  last_30_days: z.coerce.number(),
  by_status: z.record(z.string(), z.coerce.number()),
  by_event_type: z.record(z.string(), z.coerce.number()),
});

export type BookingReport = z.infer<typeof reportSchema>;

export async function bookingReport(): Promise<BookingReport> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("booking_report");
  if (error) throw new BookingDataError("booking_report", error);
  return reportSchema.parse(data);
}

export async function assignableStaff(): Promise<{ id: string; name: string }[]> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("list_assignable_staff");
  if (error) throw new BookingDataError("list_assignable_staff", error);
  return z
    .array(z.object({ user_id: z.uuid(), display_name: z.string().nullable() }))
    .parse(data ?? [])
    .map((s) => ({ id: s.user_id, name: s.display_name ?? s.user_id.slice(0, 8) }));
}

const detailSchema = z.object({
  booking: z.object({
    id: z.uuid(),
    reference: z.string(),
    status: z.enum(BOOKING_STATUSES),
    source: z.enum(["website", "staff"]),
    event_type: z.enum(EVENT_TYPES),
    event_date: z.string().nullable(),
    guest_count: z.number().int().nullable(),
    venue: z.string().nullable(),
    contact_name: z.string(),
    contact_email: z.string(),
    contact_phone: z.string().nullable(),
    preferred_contact_method: z.enum(CONTACT_METHODS),
    preferred_locale: z.enum(["en", "am"]),
    service_requirements: z.string().nullable(),
    message: z.string().nullable(),
    assigned_to: z.uuid().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  }),
  assignee_name: z.string().nullable(),
  possible_duplicate_reference: z.string().nullable(),
  notes: z.array(
    z.object({ id: z.uuid(), body: z.string(), author_name: z.string().nullable(), created_at: z.string() }),
  ),
  history: z.array(
    z.object({
      from_status: z.enum(BOOKING_STATUSES).nullable(),
      to_status: z.enum(BOOKING_STATUSES),
      changed_by_name: z.string().nullable(),
      note: z.string().nullable(),
      changed_at: z.string(),
    }),
  ),
});

export type BookingDetail = z.infer<typeof detailSchema>;

/** Returns null both for unknown inquiries and for ones the caller may not see. */
export async function getBookingDetail(reference: string): Promise<BookingDetail | null> {
  if (!BOOKING_REFERENCE.test(reference)) return null;
  const supabase = await client();
  const { data, error } = await supabase.rpc("get_booking_detail", { p_reference: reference });
  if (error) throw new BookingDataError("get_booking_detail", error);
  return data === null ? null : detailSchema.parse(data);
}
