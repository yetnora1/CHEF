import "server-only";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AUDIT_CATEGORIES, type AuditEntry } from "./describe";

/*
 * Audit log reads with the signed-in staff member's own client.
 * public.list_audit_log is SECURITY INVOKER: RLS (audit.read) decides what
 * anyone sees, and it returns nothing for everyone else.
 */

export const AUDIT_PAGE_SIZE = 50;

export class AuditDataError extends Error {
  constructor(operation: string, cause: unknown) {
    super(`The audit log could not be loaded: ${operation}`, { cause });
    this.name = "AuditDataError";
  }
}

// Unknown or malformed query parameters are ignored rather than rejected.
const filtersSchema = z.object({
  category: z.enum(AUDIT_CATEGORIES).optional().catch(undefined),
  actor: z.uuid().optional().catch(undefined),
  before: z.coerce.number().int().positive().optional().catch(undefined),
});

export type AuditFilters = z.infer<typeof filtersSchema>;

export function parseAuditFilters(params: Record<string, string | string[] | undefined>): AuditFilters {
  const first = Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );
  return filtersSchema.parse(first);
}

const rowSchema = z.object({
  id: z.coerce.number().int(),
  occurred_at: z.string(),
  actor_id: z.uuid().nullable(),
  actor_name: z.string().nullable(),
  action: z.string(),
  target_type: z.string().nullable(),
  target_id: z.string().nullable(),
  target_name: z.string().nullable(),
  details: z.record(z.string(), z.unknown()).nullable(),
});

/** One page, newest first, and the id to continue from when there are older entries. */
export async function listAuditLog(
  filters: AuditFilters,
): Promise<{ entries: AuditEntry[]; nextBefore: number | null }> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new AuditDataError("client", "Supabase is not configured");
  const { data, error } = await supabase.rpc("list_audit_log", {
    p_category: filters.category ?? null,
    p_actor: filters.actor ?? null,
    p_before: filters.before ?? null,
    // One more than shown tells whether an older page exists.
    p_limit: AUDIT_PAGE_SIZE + 1,
  });
  if (error) throw new AuditDataError("list_audit_log", error);
  const rows = z.array(rowSchema).parse(data ?? []);
  const entries = rows.slice(0, AUDIT_PAGE_SIZE).map((row) => ({
    id: row.id,
    occurredAt: row.occurred_at,
    actorId: row.actor_id,
    actorName: row.actor_name,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    targetName: row.target_name,
    details: row.details ?? {},
  }));
  return { entries, nextBefore: rows.length > AUDIT_PAGE_SIZE ? entries.at(-1)!.id : null };
}
