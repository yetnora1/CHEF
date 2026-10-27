import { z } from "zod";
import { isValidPhone } from "@/features/bookings/inquiry-schema";
import { cleanLine, cleanMultiline } from "@/lib/text";

/*
 * Contact form validation, shared by the browser (instant feedback) and the
 * server action (the security boundary). Error messages are stable codes that
 * the UI translates; nothing user-supplied is echoed back in an error.
 */

export const CONTACT_LIMITS = {
  nameMin: 2,
  nameMax: 160,
  emailMax: 254,
  phoneMax: 40,
  subjectMax: 150,
  messageMin: 10,
  messageMax: 3000,
} as const;

export const CONTACT_ERROR_CODES = [
  "required",
  "tooShort",
  "tooLong",
  "invalidEmail",
  "invalidPhone",
  "consentRequired",
] as const;

export type ContactErrorCode = (typeof CONTACT_ERROR_CODES)[number];

export const CONTACT_FIELDS = ["fullName", "email", "phone", "subject", "message", "consent"] as const;

export type ContactField = (typeof CONTACT_FIELDS)[number];
export type ContactFieldErrors = Partial<Record<ContactField, ContactErrorCode>>;

export type ContactMessageInput = {
  fullName: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
};

// Missing form fields arrive as undefined; treat them as empty strings so the
// field's own rules decide whether that is allowed.
const optionalString = z
  .string()
  .nullish()
  .transform((value) => value ?? "");

const L = CONTACT_LIMITS;

const schema = z.object({
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
  subject: optionalString.transform(cleanLine).pipe(z.string().max(L.subjectMax, "tooLong")),
  message: optionalString
    .transform(cleanMultiline)
    .pipe(z.string().min(1, "required").min(L.messageMin, "tooShort").max(L.messageMax, "tooLong")),
  consent: z.union([z.literal("on"), z.literal("true"), z.literal(true)], "consentRequired"),
});

export type ContactParseResult =
  { success: true; data: ContactMessageInput } | { success: false; fieldErrors: ContactFieldErrors };

/** Validates and normalises raw form values. Unknown keys are ignored. */
export function parseContactMessage(raw: Record<string, unknown>): ContactParseResult {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const fieldErrors: ContactFieldErrors = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      if (typeof field !== "string" || !(CONTACT_FIELDS as readonly string[]).includes(field)) continue;
      const code = (CONTACT_ERROR_CODES as readonly string[]).includes(issue.message)
        ? (issue.message as ContactErrorCode)
        : "required";
      fieldErrors[field as ContactField] ??= code;
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
      subject: d.subject || null,
      message: d.message,
    },
  };
}
