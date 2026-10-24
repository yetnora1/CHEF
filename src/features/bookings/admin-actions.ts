"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { authorizeAdmin } from "@/lib/auth/staff-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { WRITE_BOOKINGS } from "./admin-data";
import { BOOKING_STATUSES } from "./status";

/*
 * Staff mutations. Each action re-checks the session and permission on the
 * server; the database functions then authorize again (assignment scope,
 * transition rules) and write the history and audit entries.
 */

export type AdminActionState =
  | { status: "idle" }
  | { status: "success" }
  | {
      status: "error";
      message:
        | "errorGeneric"
        | "errorTransition"
        | "errorNotFound"
        | "errorAssignee"
        | "errorForbidden"
        | "errorNoteLength";
    };

type ErrorMessage = Extract<AdminActionState, { status: "error" }>["message"];

function failure(code: string | undefined, invalidMeans: ErrorMessage): AdminActionState {
  switch (code) {
    case "22023":
      return { status: "error", message: invalidMeans };
    case "P0002":
      return { status: "error", message: "errorNotFound" };
    case "42501":
      return { status: "error", message: "errorForbidden" };
    default:
      return { status: "error", message: "errorGeneric" };
  }
}

const fields = (formData: FormData) =>
  Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")) as Record<
    string,
    string
  >;

export async function changeBookingStatusAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const decision = await authorizeAdmin(WRITE_BOOKINGS);
  if (decision.kind !== "allow") return { status: "error", message: "errorForbidden" };

  const parsed = z
    .object({
      bookingId: z.uuid(),
      toStatus: z.enum(BOOKING_STATUSES),
      note: z.string().trim().max(1000).optional(),
    })
    .safeParse(fields(formData));
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some((i) => i.path[0] === "note");
    return { status: "error", message: tooLong ? "errorNoteLength" : "errorGeneric" };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: "errorGeneric" };
  const { error } = await supabase.rpc("change_booking_status", {
    p_booking_id: parsed.data.bookingId,
    p_to_status: parsed.data.toStatus,
    p_note: parsed.data.note || null,
  });
  if (error) return failure(error.code, "errorTransition");

  refresh();
  return { status: "success" };
}

export async function assignBookingAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const decision = await authorizeAdmin("bookings.assign");
  if (decision.kind !== "allow") return { status: "error", message: "errorForbidden" };

  const parsed = z
    .object({ bookingId: z.uuid(), assignee: z.union([z.literal(""), z.uuid()]) })
    .safeParse(fields(formData));
  if (!parsed.success) return { status: "error", message: "errorGeneric" };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: "errorGeneric" };
  const { error } = await supabase.rpc("assign_booking", {
    p_booking_id: parsed.data.bookingId,
    p_assignee: parsed.data.assignee || null,
  });
  if (error) return failure(error.code, "errorAssignee");

  refresh();
  return { status: "success" };
}

export async function addBookingNoteAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const decision = await authorizeAdmin(WRITE_BOOKINGS);
  if (decision.kind !== "allow") return { status: "error", message: "errorForbidden" };

  const parsed = z
    .object({ bookingId: z.uuid(), body: z.string().trim().min(1).max(4000) })
    .safeParse(fields(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues.some((i) => i.path[0] === "body") ? "errorNoteLength" : "errorGeneric",
    };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: "errorGeneric" };
  const { error } = await supabase.rpc("add_booking_note", {
    p_booking_id: parsed.data.bookingId,
    p_body: parsed.data.body,
  });
  if (error) return failure(error.code, "errorNoteLength");

  refresh();
  return { status: "success" };
}
