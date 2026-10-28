import { z } from "zod";
import { isAppLocale, type AppLocale } from "@/i18n/routing";
import { cleanLine, cleanMultiline } from "@/lib/text";
import { CONTACT_METHODS, EVENT_TYPES, type ContactMethod, type EventType } from "./status";

/*
 * Event inquiry validation, shared by the browser (instant feedback) and the
 * server action (the security boundary). Error messages are stable codes that
 * the UI translates; nothing user-supplied is echoed back in an error.
 */

export const BUSINESS_TIME_ZONE = "Africa/Addis_Ababa";

export const INQUIRY_LIMITS = {
  nameMin: 2,
  nameMax: 160,
  emailMax: 254,
  phoneMax: 40,
  phoneDigitsMin: 7,
  phoneDigitsMax: 15,
  venueMax: 300,
  requirementsMin: 3,
  requirementsMax: 2000,
  messageMax: 3000,
  guestsMin: 1,
  guestsMax: 10000,
  maxDaysAhead: 1095,
} as const;

export const INQUIRY_ERROR_CODES = [
  "required",
  "tooShort",
  "tooLong",
  "invalidEmail",
  "invalidPhone",
  "phoneRequired",
  "invalidDate",
  "dateNotFuture",
  "dateTooFar",
  "notWholeNumber",
  "guestMin",
  "guestMax",
  "invalidChoice",
  "consentRequired",
] as const;

export type InquiryErrorCode = (typeof INQUIRY_ERROR_CODES)[number];

export const INQUIRY_FIELDS = [
  "fullName",
  "email",
  "phone",
  "contactMethod",
  "eventType",
  "eventDate",
  "guestCount",
  "venue",
  "requirements",
  "message",
  "consent",
] as const;

export type InquiryField = (typeof INQUIRY_FIELDS)[number];
export type InquiryFieldErrors = Partial<Record<InquiryField, InquiryErrorCode>>;

export { cleanLine, cleanMultiline };

export type InquiryInput = {
  fullName: string;
  email: string;
  phone: string | null;
  contactMethod: ContactMethod;
  eventType: EventType;
  eventDate: string | null;
  guestCount: number;
  venue: string | null;
  requirements: string;
  message: string | null;
};

/** International phone numbers: digits with optional +, spaces, dots, dashes and brackets. */
export function isValidPhone(value: string): boolean {
  if (!/^\+?[0-9\s().-]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, "").length;
  return digits >= INQUIRY_LIMITS.phoneDigitsMin && digits <= INQUIRY_LIMITS.phoneDigitsMax;
}

/** Today's date (YYYY-MM-DD) in the business's time zone. */
export function businessToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The event-date window offered by the form: tomorrow to about three years ahead. */
export function eventDateBounds(now: Date = new Date()) {
  const today = businessToday(now);
  return { min: addDays(today, 1), max: addDays(today, INQUIRY_LIMITS.maxDaysAhead) };
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Missing form fields arrive as undefined; treat them as empty strings so the
// field's own rules decide whether that is allowed.
const optionalString = z
  .string()
  .nullish()
  .transform((value) => value ?? "");

function createSchema(now: () => Date) {
  const L = INQUIRY_LIMITS;

  return z
    .object({
      fullName: optionalString
        .transform(cleanLine)
        .pipe(z.string().min(1, "required").min(L.nameMin, "tooShort").max(L.nameMax, "tooLong")),
      email: optionalString
        .transform((v) => cleanLine(v).toLowerCase())
        .pipe(z.string().min(1, "required").max(L.emailMax, "tooLong").pipe(z.email("invalidEmail"))),
      phone: optionalString.transform(cleanLine).pipe(
        z
          .string()
          .max(L.phoneMax, "tooLong")
          .refine((v) => v === "" || isValidPhone(v), "invalidPhone"),
      ),
      contactMethod: optionalString
        .transform((v) => v || "email")
        .pipe(z.enum(CONTACT_METHODS, "invalidChoice")),
      eventType: optionalString.pipe(
        z.string().min(1, "required").pipe(z.enum(EVENT_TYPES, "invalidChoice")),
      ),
      // Checked on the field itself, so a past date is caught even while other fields are
      // still empty (the form validates one step at a time).
      eventDate: optionalString
        .transform((v) => v.trim())
        .superRefine((value, ctx) => {
          if (value === "") return;
          const { min, max } = eventDateBounds(now());
          if (!isRealDate(value)) ctx.addIssue({ code: "custom", message: "invalidDate" });
          else if (value < min) ctx.addIssue({ code: "custom", message: "dateNotFuture" });
          else if (value > max) ctx.addIssue({ code: "custom", message: "dateTooFar" });
        }),
      guestCount: optionalString
        .transform((v) => v.trim())
        .pipe(
          z
            .string()
            .min(1, "required")
            .regex(/^\d{1,6}$/, "notWholeNumber")
            .transform(Number)
            .pipe(z.number().int().min(L.guestsMin, "guestMin").max(L.guestsMax, "guestMax")),
        ),
      venue: optionalString.transform(cleanLine).pipe(z.string().max(L.venueMax, "tooLong")),
      requirements: optionalString
        .transform(cleanMultiline)
        .pipe(
          z.string().min(1, "required").min(L.requirementsMin, "tooShort").max(L.requirementsMax, "tooLong"),
        ),
      message: optionalString.transform(cleanMultiline).pipe(z.string().max(L.messageMax, "tooLong")),
      consent: z.union([z.literal("on"), z.literal("true"), z.literal(true)], "consentRequired"),
    })
    .refine((data) => data.contactMethod === "email" || data.phone !== "", {
      path: ["phone"],
      message: "phoneRequired",
      // A whole-form rule normally waits until every field is valid; this one needs only the
      // two fields it reads, so it is reported together with any other problems.
      when: ({ issues }) =>
        !issues.some((issue) => issue.path?.[0] === "phone" || issue.path?.[0] === "contactMethod"),
    });
}

export type InquiryParseResult =
  { success: true; data: InquiryInput } | { success: false; fieldErrors: InquiryFieldErrors };

/** Validates and normalises raw form values. Unknown keys are ignored. */
export function parseInquiry(
  raw: Record<string, unknown>,
  now: () => Date = () => new Date(),
): InquiryParseResult {
  const result = createSchema(now).safeParse(raw);
  if (!result.success) {
    const fieldErrors: InquiryFieldErrors = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      if (typeof field !== "string" || !(INQUIRY_FIELDS as readonly string[]).includes(field)) continue;
      const code = (INQUIRY_ERROR_CODES as readonly string[]).includes(issue.message)
        ? (issue.message as InquiryErrorCode)
        : "invalidChoice";
      fieldErrors[field as InquiryField] ??= code;
    }
    return { success: false, fieldErrors };
  }

  const d = result.data;
  return {
    success: true,
    data: {
      fullName: d.fullName,
      email: d.email,
      phone: d.phone || null,
      contactMethod: d.contactMethod,
      eventType: d.eventType,
      eventDate: d.eventDate || null,
      guestCount: d.guestCount,
      venue: d.venue || null,
      requirements: d.requirements,
      message: d.message || null,
    },
  };
}

/** Reads string fields from FormData; files and repeated keys are ignored. */
export function formDataToRecord(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !(key in out)) out[key] = value;
  }
  return out;
}

export function readLocale(value: unknown): AppLocale {
  return isAppLocale(value) ? value : "en";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSubmissionKey(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
