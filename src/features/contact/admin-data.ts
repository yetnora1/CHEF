import "server-only";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/*
 * Admin reads of contact messages. Every call uses the signed-in staff
 * member's own Supabase client, so RLS (via SECURITY INVOKER functions)
 * decides what they see; staff without messages.read get no rows.
 */

export const MESSAGE_PAGE_SIZE = 20;
export const MESSAGE_STATUSES = ["new", "handled"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export class MessageDataError extends Error {
  constructor(operation: string, cause: unknown) {
    super(`Contact messages could not be loaded: ${operation}`, { cause });
    this.name = "MessageDataError";
  }
}

// Unknown or malformed query parameters are ignored rather than rejected.
// The inbox opens on new messages; "all" shows both states.
const filtersSchema = z.object({
  status: z.enum([...MESSAGE_STATUSES, "all"]).catch("new"),
  q: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(500).catch(1),
});

export type MessageFilters = z.infer<typeof filtersSchema>;

export function parseMessageFilters(params: Record<string, string | string[] | undefined>): MessageFilters {
  const first = Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );
  const filters = filtersSchema.parse(first);
  return { ...filters, q: filters.q || undefined };
}

const rowSchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  status: z.enum(MESSAGE_STATUSES),
  contact_name: z.string(),
  contact_email: z.string(),
  contact_phone: z.string().nullable(),
  subject: z.string().nullable(),
  message: z.string(),
  preferred_locale: z.enum(["en", "am"]),
  handled_at: z.string().nullable(),
  handled_by_name: z.string().nullable(),
  created_at: z.string(),
  total_count: z.coerce.number(),
});

export type MessageRow = z.infer<typeof rowSchema>;

async function client() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new MessageDataError("client", "Supabase is not configured");
  return supabase;
}

export async function listMessages(filters: MessageFilters): Promise<{ rows: MessageRow[]; total: number }> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("list_contact_messages", {
    p_status: filters.status === "all" ? null : filters.status,
    p_search: filters.q ?? null,
    p_limit: MESSAGE_PAGE_SIZE,
    p_offset: (filters.page - 1) * MESSAGE_PAGE_SIZE,
  });
  if (error) throw new MessageDataError("list_contact_messages", error);
  const rows = z.array(rowSchema).parse(data ?? []);
  return { rows, total: rows[0]?.total_count ?? 0 };
}

export async function messageCounts(): Promise<Record<MessageStatus, number>> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("contact_message_counts");
  if (error) throw new MessageDataError("contact_message_counts", error);
  const rows = z
    .array(z.object({ status: z.enum(MESSAGE_STATUSES), total: z.coerce.number() }))
    .parse(data ?? []);
  const counts: Record<MessageStatus, number> = { new: 0, handled: 0 };
  for (const row of rows) counts[row.status] = row.total;
  return counts;
}
