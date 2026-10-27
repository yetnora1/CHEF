import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ContactMessageInput } from "@/features/contact/message-schema";
import type { AppLocale } from "@/i18n/routing";
import type { InquiryInput } from "../inquiry-schema";
import type { EventType } from "../status";

/*
 * The ONLY module that uses the Supabase secret key (service_role). It exposes
 * five narrow operations, never the client itself. In the database,
 * service_role can execute just these functions and has no direct privileges
 * on any booking or contact-message table (migrations 20261025090100 and
 * 20261027100100).
 */

export class InquiryKeyConflictError extends Error {
  constructor() {
    super("Submission key was already used for a different inquiry");
    this.name = "InquiryKeyConflictError";
  }
}

export class InquiryStoreError extends Error {
  constructor(operation: string, cause: unknown) {
    super(`Inquiry store operation failed: ${operation}`, { cause });
    this.name = "InquiryStoreError";
  }
}

const clients = new Map<string, SupabaseClient>();

function serviceClient(url: string, secretKey: string): SupabaseClient {
  const cacheKey = `${url}|${secretKey}`;
  let client = clients.get(cacheKey);
  if (!client) {
    client = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
    });
    clients.set(cacheKey, client);
  }
  return client;
}

export type InquiryStore = ReturnType<typeof createInquiryStore>;

const submitRowSchema = z.object({
  inquiry_reference: z.string().regex(/^CH-[0-9A-F]{10}$/),
  is_replay: z.boolean(),
});
const contactRowSchema = z.object({
  message_reference: z.string().regex(/^CM-[0-9A-F]{10}$/),
  is_replay: z.boolean(),
});
const rateRowSchema = z.object({ allowed: z.boolean(), retry_after_seconds: z.number().int().nonnegative() });
const notificationRowSchema = z.object({
  notification_id: z.uuid(),
  kind: z.enum(["customer_acknowledgement", "staff_new_inquiry"]),
  attempts: z.number().int(),
  booking_reference: z.string(),
  // Only returned for customer acknowledgements.
  contact_email: z.string().nullable(),
  preferred_locale: z.enum(["en", "am"]),
  event_type: z.string(),
  event_date: z.string().nullable(),
  guest_count: z.number().int().nullable(),
});

export type ClaimedNotification = z.infer<typeof notificationRowSchema> & { event_type: EventType };

export function createInquiryStore({ url, secretKey }: { url: string; secretKey: string }) {
  const db = serviceClient(url, secretKey);

  return {
    async consumeRateLimit(bucket: string, limit: number, windowSeconds: number) {
      const { data, error } = await db
        .rpc("consume_rate_limit", { p_bucket: bucket, p_limit: limit, p_window_seconds: windowSeconds })
        .single();
      if (error) throw new InquiryStoreError("consume_rate_limit", error);
      const row = rateRowSchema.parse(data);
      return { allowed: row.allowed, retryAfterSeconds: row.retry_after_seconds };
    },

    async submitInquiry(input: {
      submissionKey: string;
      inquiry: InquiryInput;
      locale: AppLocale;
      notify: boolean;
    }): Promise<{ reference: string; replay: boolean }> {
      const { inquiry } = input;
      const { data, error } = await db
        .rpc("submit_inquiry", {
          p_submission_key: input.submissionKey,
          p_contact_name: inquiry.fullName,
          p_contact_email: inquiry.email,
          p_contact_phone: inquiry.phone,
          p_preferred_contact_method: inquiry.contactMethod,
          p_event_type: inquiry.eventType,
          p_event_date: inquiry.eventDate,
          p_guest_count: inquiry.guestCount,
          p_venue: inquiry.venue,
          p_service_requirements: inquiry.requirements,
          p_message: inquiry.message,
          p_preferred_locale: input.locale,
          p_consent: true,
          p_notify: input.notify,
        })
        .single();
      if (error) {
        if (error.code === "23505") throw new InquiryKeyConflictError();
        throw new InquiryStoreError("submit_inquiry", error);
      }
      const row = submitRowSchema.parse(data);
      return { reference: row.inquiry_reference, replay: row.is_replay };
    },

    async submitContactMessage(input: {
      submissionKey: string;
      message: ContactMessageInput;
      locale: AppLocale;
    }): Promise<{ reference: string; replay: boolean }> {
      const { message } = input;
      const { data, error } = await db
        .rpc("submit_contact_message", {
          p_submission_key: input.submissionKey,
          p_contact_name: message.fullName,
          p_contact_email: message.email,
          p_contact_phone: message.phone,
          p_subject: message.subject,
          p_message: message.message,
          p_preferred_locale: input.locale,
          p_consent: true,
        })
        .single();
      if (error) {
        if (error.code === "23505") throw new InquiryKeyConflictError();
        throw new InquiryStoreError("submit_contact_message", error);
      }
      const row = contactRowSchema.parse(data);
      return { reference: row.message_reference, replay: row.is_replay };
    },

    async claimNotifications(limit: number): Promise<ClaimedNotification[]> {
      const { data, error } = await db.rpc("claim_notifications", { p_limit: limit });
      if (error) throw new InquiryStoreError("claim_notifications", error);
      return z.array(notificationRowSchema).parse(data ?? []) as ClaimedNotification[];
    },

    async completeNotification(
      id: string,
      outcome: { ok: true; providerId: string | null } | { ok: false; error: string },
    ) {
      const { error } = await db.rpc("complete_notification", {
        p_notification_id: id,
        p_succeeded: outcome.ok,
        p_provider_message_id: outcome.ok ? outcome.providerId : null,
        p_error: outcome.ok ? null : outcome.error,
      });
      if (error) throw new InquiryStoreError("complete_notification", error);
    },
  };
}
