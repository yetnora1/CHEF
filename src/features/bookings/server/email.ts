import "server-only";
import type { AppLocale } from "@/i18n/routing";
import am from "@/messages/am.json";
import en from "@/messages/en.json";
import type { EventType } from "../status";
import type { EmailConfig } from "./config";

/*
 * Transactional email: templates and a minimal Resend client (HTTPS API, no SDK).
 * Every value from the inquiry is HTML-escaped. Messages never say an event is
 * confirmed or a date is available.
 *
 * Anyone can type any address into the public form, so the acknowledgement
 * carries no free text from the submission (not even the name): only the
 * reference, the event type, the date and the guest count. That keeps it
 * useless for sending a chosen message to a third party.
 */

export type EmailMessage = {
  to: string[];
  subject: string;
  text: string;
  html: string;
};

export type SendResult = { ok: true; providerId: string | null } | { ok: false; error: string };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const catalogues = { en, am } as const;

function eventTypeLabel(locale: AppLocale, eventType: EventType): string {
  return catalogues[locale].EventType[eventType] ?? eventType;
}

function formatEventDate(locale: AppLocale, isoDate: string | null): string | null {
  if (!isoDate) return null;
  return new Intl.DateTimeFormat(locale === "am" ? "am-ET" : "en-GB", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

function render(paragraphs: string[]): { text: string; html: string } {
  return {
    text: paragraphs.join("\n\n"),
    html: `<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.6;color:#171d1a">${paragraphs
      .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
      .join("")}</body></html>`,
  };
}

type InquirySummary = {
  reference: string;
  eventType: EventType;
  eventDate: string | null;
  guestCount: number | null;
};

const ACK_COPY = {
  en: {
    subject: (ref: string) => `We received your inquiry (${ref})`,
    greeting: "Hello,",
    received: "Thank you for contacting CHEF SIS. We have received your event inquiry.",
    reference: (ref: string) => `Reference: ${ref}`,
    event: (type: string, date: string | null, guests: number | null) =>
      `Event: ${[type, date, guests ? `about ${guests} guests` : null].filter(Boolean).join(", ")}`,
    notConfirmed:
      "This message only confirms that your request arrived. It is not a booking confirmation and does not confirm availability for your date. CHEF SIS will review your inquiry before replying.",
    ignore: "If you did not send this inquiry, you can ignore this email.",
  },
  // Draft Amharic: requires native-speaker review before launch (docs/LOCALIZATION.md).
  am: {
    subject: (ref: string) => `ጥያቄዎ ደርሶናል (${ref})`,
    greeting: "ሰላም፣",
    received: "CHEF SISን ስላነጋገሩ እናመሰግናለን። የዝግጅት ጥያቄዎ ደርሶናል።",
    reference: (ref: string) => `መለያ ቁጥር፦ ${ref}`,
    event: (type: string, date: string | null, guests: number | null) =>
      `ዝግጅት፦ ${[type, date, guests ? `ወደ ${guests} እንግዶች` : null].filter(Boolean).join("፣ ")}`,
    notConfirmed:
      "ይህ መልዕክት ጥያቄዎ መድረሱን ብቻ ያረጋግጣል። የቦታ ማስያዣ ማረጋገጫ አይደለም፤ ለቀንዎ መገኘታችንንም አያረጋግጥም። CHEF SIS ጥያቄዎን ከገመገሙ በኋላ ምላሽ ይሰጣሉ።",
    ignore: "ይህን ጥያቄ ያልላኩ ከሆነ ይህን ኢሜይል ችላ ማለት ይችላሉ።",
  },
} as const;

export function customerAcknowledgement(
  locale: AppLocale,
  inquiry: InquirySummary & { email: string },
): EmailMessage {
  const copy = ACK_COPY[locale];
  const body = render([
    copy.greeting,
    copy.received,
    copy.reference(inquiry.reference),
    copy.event(
      eventTypeLabel(locale, inquiry.eventType),
      formatEventDate(locale, inquiry.eventDate),
      inquiry.guestCount,
    ),
    copy.notConfirmed,
    copy.ignore,
  ]);
  return { to: [inquiry.email], subject: copy.subject(inquiry.reference), ...body };
}

/** Staff alert: deliberately omits contact details, which stay in the admin inbox. */
export function staffNewInquiry(inquiry: InquirySummary, recipients: string[], siteUrl: URL): EmailMessage {
  const link = new URL(`/admin/bookings/${encodeURIComponent(inquiry.reference)}`, siteUrl).toString();
  const body = render([
    `A new event inquiry was submitted on the website.`,
    `Reference: ${inquiry.reference}`,
    `Event: ${[
      eventTypeLabel("en", inquiry.eventType),
      formatEventDate("en", inquiry.eventDate),
      inquiry.guestCount ? `about ${inquiry.guestCount} guests` : null,
    ]
      .filter(Boolean)
      .join(", ")}`,
    `Open it in the admin inbox (sign-in required): ${link}`,
  ]);
  return { to: recipients, subject: `New event inquiry ${inquiry.reference}`, ...body };
}

export async function sendWithResend(
  config: EmailConfig,
  message: EmailMessage,
  idempotencyKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        // Resend de-duplicates retries carrying the same key.
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from: config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!response.ok) return { ok: false, error: `provider responded ${response.status}` };
    const data = (await response.json().catch(() => ({}))) as { id?: unknown };
    return { ok: true, providerId: typeof data.id === "string" ? data.id : null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.name : "send failed" };
  }
}
