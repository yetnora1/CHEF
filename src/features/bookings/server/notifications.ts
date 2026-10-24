import "server-only";
import type { EmailConfig } from "./config";
import {
  customerAcknowledgement,
  sendWithResend,
  staffNewInquiry,
  type EmailMessage,
  type SendResult,
} from "./email";
import type { ClaimedNotification, InquiryStore } from "./store";

/*
 * Outbox delivery. Inquiries are committed before any email is attempted, so a
 * provider failure can never lose an inquiry. Each message is claimed with a row
 * lock, sent with an idempotency key (its outbox id) and marked sent or failed;
 * failed messages are retried up to 5 attempts by later runs
 * (after() following a submission, or the cron route).
 */

export type DeliveryReport = { claimed: number; sent: number; failed: number };

export async function deliverNotifications({
  store,
  email,
  limit = 10,
  send = (message, key) => sendWithResend(email, message, key),
}: {
  store: Pick<InquiryStore, "claimNotifications" | "completeNotification">;
  email: EmailConfig;
  limit?: number;
  send?: (message: EmailMessage, idempotencyKey: string) => Promise<SendResult>;
}): Promise<DeliveryReport> {
  const claimed = await store.claimNotifications(limit);
  const report: DeliveryReport = { claimed: claimed.length, sent: 0, failed: 0 };

  for (const notification of claimed) {
    let result: SendResult;
    try {
      const message = buildMessage(notification, email);
      result = message
        ? await send(message, notification.notification_id)
        : { ok: false, error: "no recipient" };
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.name : "send failed" };
    }

    try {
      await store.completeNotification(notification.notification_id, result);
    } catch {
      // Left in 'sending'; reclaimed after the stale-lock timeout. The
      // idempotency key prevents a duplicate send.
    }

    if (result.ok) report.sent += 1;
    else report.failed += 1;
    // Log identifiers only: no names, addresses or message content.
    console.info(
      `[notifications] ${notification.kind} for ${notification.booking_reference}: ${result.ok ? "sent" : `failed (${result.error})`}`,
    );
  }

  return report;
}

function buildMessage(n: ClaimedNotification, email: EmailConfig): EmailMessage | null {
  const summary = {
    reference: n.booking_reference,
    eventType: n.event_type,
    eventDate: n.event_date,
    guestCount: n.guest_count,
  };
  if (n.kind === "staff_new_inquiry") return staffNewInquiry(summary, email.staffRecipients, email.siteUrl);
  return n.contact_email
    ? customerAcknowledgement(n.preferred_locale, { ...summary, email: n.contact_email })
    : null;
}
