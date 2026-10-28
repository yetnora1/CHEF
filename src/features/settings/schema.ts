import { z } from "zod";
import { isValidPhone } from "@/features/bookings/inquiry-schema";
import { cleanLine } from "@/lib/text";

/*
 * The site settings form: one parser for the server action, mirroring the
 * CHECK constraints on public.site_settings (the database still enforces
 * them). Empty fields mean "not shown on the website" and are stored as null.
 */

export const SOCIAL_PLATFORMS = ["instagram", "facebook", "tiktok", "youtube"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

/** The business's own page on each platform: https, that platform's host only. */
const SOCIAL_LINK: Record<SocialPlatform, RegExp> = {
  instagram: /^https:\/\/(www\.)?instagram\.com\/\S+$/,
  facebook: /^https:\/\/((www|m)\.)?facebook\.com\/\S+$/,
  tiktok: /^https:\/\/(www\.)?tiktok\.com\/@\S+$/,
  youtube: /^https:\/\/(www\.)?youtube\.com\/\S+$/,
};

const TELEGRAM_USERNAME = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;

export const SETTINGS_LIMITS = { email: 254, phone: 40, location: 120, link: 300 } as const;

export const SETTINGS_TEXT_FIELDS = [
  "contact_email",
  "contact_phone",
  "whatsapp_phone",
  "telegram_username",
  "location_en",
  "location_am",
  "instagram_url",
  "facebook_url",
  "tiktok_url",
  "youtube_url",
] as const;

export type SettingsTextField = (typeof SETTINGS_TEXT_FIELDS)[number];

/** Every column a save can change (as named in settings.updated audit entries). */
export const SETTINGS_FIELDS = [
  ...SETTINGS_TEXT_FIELDS,
  "location_am_reviewed_at",
  "inquiries_open",
] as const;
export type SettingsField = (typeof SETTINGS_FIELDS)[number];

export function isSettingsField(value: string): value is SettingsField {
  return (SETTINGS_FIELDS as readonly string[]).includes(value);
}

export type SettingsFieldError =
  "tooLong" | "invalidEmail" | "invalidPhone" | "needsCountryCode" | "invalidTelegram" | "invalidLink";

export type SettingsValues = Record<SettingsTextField, string | null> & {
  inquiries_open: boolean;
  /** The "reviewed by a fluent Amharic speaker" box for location_am. */
  location_am_reviewed: boolean;
};

/** "https://t.me/name", "t.me/name" and "@name" all mean the username "name". */
export function telegramUsername(value: string): string {
  return value.replace(/^(https?:\/\/)?(www\.)?(t|telegram)\.me\//i, "").replace(/^@/, "");
}

/**
 * Adds a missing https://, upgrades http:// and lowercases the host, so links
 * copied from a browser or typed by hand are accepted. Anything else (other
 * schemes, other hosts, credentials) still fails the platform check.
 */
export function normalizeLink(value: string): string {
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol === "http:") url.protocol = "https:";
    return url.href;
  } catch {
    return value;
  }
}

/** Digits of an international number, for https://wa.me/<digits>. */
export function whatsappDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Digits and a leading + only, for tel: links. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function optional(
  max: number,
  check: (value: string) => SettingsFieldError | null,
  normalize: (value: string) => string = (value) => value,
) {
  return z
    .string()
    .transform((value) => normalize(cleanLine(value)))
    .superRefine((value, ctx) => {
      if (value === "") return;
      const error = value.length > max ? "tooLong" : check(value);
      if (error) ctx.addIssue({ code: "custom", message: error });
    })
    .transform((value) => value || null);
}

const email = z.email();
const phone = (value: string) =>
  isValidPhone(value) && value.length <= SETTINGS_LIMITS.phone ? null : "invalidPhone";
const link = (platform: SocialPlatform) =>
  optional(
    SETTINGS_LIMITS.link,
    (value) => (SOCIAL_LINK[platform].test(value) ? null : "invalidLink"),
    normalizeLink,
  );

const formSchema = z.object({
  contact_email: optional(SETTINGS_LIMITS.email, (value) =>
    email.safeParse(value).success ? null : "invalidEmail",
  ),
  contact_phone: optional(SETTINGS_LIMITS.phone, phone),
  // wa.me links need the full international number.
  whatsapp_phone: optional(
    SETTINGS_LIMITS.phone,
    (value) => phone(value) ?? (value.startsWith("+") ? null : "needsCountryCode"),
  ),
  telegram_username: optional(
    32,
    (value) => (TELEGRAM_USERNAME.test(value) ? null : "invalidTelegram"),
    telegramUsername,
  ),
  location_en: optional(SETTINGS_LIMITS.location, () => null),
  location_am: optional(SETTINGS_LIMITS.location, () => null),
  instagram_url: link("instagram"),
  facebook_url: link("facebook"),
  tiktok_url: link("tiktok"),
  youtube_url: link("youtube"),
});

export type SettingsParseResult =
  | { success: true; values: SettingsValues }
  | { success: false; fieldErrors: Partial<Record<SettingsTextField, SettingsFieldError>> };

export function parseSettingsForm(formData: FormData): SettingsParseResult {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  const parsed = formSchema.safeParse(
    Object.fromEntries(SETTINGS_TEXT_FIELDS.map((name) => [name, text(name)])),
  );
  if (!parsed.success) {
    const fieldErrors: Partial<Record<SettingsTextField, SettingsFieldError>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as SettingsTextField;
      fieldErrors[field] ??= issue.message as SettingsFieldError;
    }
    return { success: false, fieldErrors };
  }
  return {
    success: true,
    values: {
      ...parsed.data,
      inquiries_open: formData.get("inquiries_open") === "on",
      location_am_reviewed: formData.get("location_am_reviewed") === "on",
    },
  };
}
