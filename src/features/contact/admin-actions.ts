"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { authorizeAdmin } from "@/lib/auth/staff-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MESSAGE_STATUSES } from "./admin-data";

/*
 * Staff mutation: mark a message handled or new again. The action re-checks
 * the session and permission; the database function authorizes again and
 * writes the audit entry.
 */

export type MessageActionState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: "errorGeneric" | "errorForbidden" | "errorNotFound" };

export async function setMessageStatusAction(
  _previous: MessageActionState,
  formData: FormData,
): Promise<MessageActionState> {
  const decision = await authorizeAdmin("messages.write");
  if (decision.kind !== "allow") return { status: "error", message: "errorForbidden" };

  const parsed = z
    .object({ messageId: z.uuid(), toStatus: z.enum(MESSAGE_STATUSES) })
    .safeParse({ messageId: formData.get("messageId"), toStatus: formData.get("toStatus") });
  if (!parsed.success) return { status: "error", message: "errorGeneric" };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: "errorGeneric" };
  const { error } = await supabase.rpc("set_contact_message_status", {
    p_message_id: parsed.data.messageId,
    p_status: parsed.data.toStatus,
  });
  if (error) {
    if (error.code === "P0002") return { status: "error", message: "errorNotFound" };
    if (error.code === "42501") return { status: "error", message: "errorForbidden" };
    return { status: "error", message: "errorGeneric" };
  }

  refresh();
  return { status: "success" };
}
