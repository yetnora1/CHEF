import { EVENT_TYPES } from "@/features/bookings/status";
import { cleanLine, cleanMultiline } from "@/lib/text";
import { DIETARY_TAGS, SLUG_MAX, SLUG_PATTERN, type FieldDef } from "./content-types";
import type { PageDef, PageSections } from "./pages";

/*
 * Validation for CMS forms, shared by the browser (instant feedback) and the
 * server actions (the security boundary). Errors are stable codes that the UI
 * translates. Lengths are counted in code points, like PostgreSQL char_length.
 */

export const FIELD_ERRORS = [
  "required",
  "tooLong",
  "invalidSlug",
  "invalidChoice",
  "invalidNumber",
  "taken",
] as const;
export type FieldError = (typeof FIELD_ERRORS)[number];

/** Form values: a string per field, or several for multi-select fields. */
export type FormValues = Record<string, string | string[]>;

export type ParseResult =
  { success: true; data: Record<string, unknown> } | { success: false; errors: Record<string, FieldError> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ORDER_LIMIT = 9999;

const length = (value: string) => [...value].length;
const single = (value: string | string[] | undefined) =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function parseField(
  field: FieldDef,
  raw: string | string[] | undefined,
): { value: unknown } | { error: FieldError } {
  switch (field.kind) {
    case "text":
    case "textarea":
    case "markup": {
      const value = field.kind === "text" ? cleanLine(single(raw)) : cleanMultiline(single(raw));
      if (!value) return field.required ? { error: "required" } : { value: null };
      if (field.max && length(value) > field.max) return { error: "tooLong" };
      return { value };
    }
    case "slug": {
      const value = cleanLine(single(raw)).toLowerCase();
      if (!value) return { error: "required" };
      if (length(value) > SLUG_MAX || !SLUG_PATTERN.test(value)) return { error: "invalidSlug" };
      return { value };
    }
    case "order": {
      const value = single(raw).trim();
      if (!value) return { value: 0 };
      const number = Number(value);
      if (!Number.isInteger(number) || Math.abs(number) > ORDER_LIMIT) return { error: "invalidNumber" };
      return { value: number };
    }
    case "image":
    case "category": {
      const value = single(raw).trim();
      if (!value) return field.required ? { error: "required" } : { value: null };
      return isUuid(value) ? { value } : { error: "invalidChoice" };
    }
    case "dietary": {
      const values = [...new Set((Array.isArray(raw) ? raw : raw ? [raw] : []).filter(Boolean))];
      if (!values.every((v) => (DIETARY_TAGS as readonly string[]).includes(v)))
        return { error: "invalidChoice" };
      return { value: values };
    }
    case "eventType": {
      const value = single(raw).trim();
      if (!value) return { value: null };
      return (EVENT_TYPES as readonly string[]).includes(value) ? { value } : { error: "invalidChoice" };
    }
  }
}

export function parseFields(fields: readonly FieldDef[], raw: FormValues): ParseResult {
  const data: Record<string, unknown> = {};
  const errors: Record<string, FieldError> = {};
  for (const field of fields) {
    const result = parseField(field, raw[field.name]);
    if ("error" in result) errors[field.name] = result.error;
    else data[field.name] = result.value;
  }
  return Object.keys(errors).length ? { success: false, errors } : { success: true, data };
}

/** Form field name of a page section field. */
export const sectionFieldName = (section: string, field: string) => `sections.${section}.${field}`;

/** Page sections from a form; empty fields are omitted. */
export function parseSections(
  page: PageDef,
  raw: FormValues,
): { success: true; data: PageSections } | { success: false; errors: Record<string, FieldError> } {
  const data: PageSections = {};
  const errors: Record<string, FieldError> = {};
  for (const section of page.sections) {
    const values: Record<string, string> = {};
    for (const field of section.fields) {
      const name = sectionFieldName(section.key, field.name);
      const result = parseField(field, raw[name]);
      if ("error" in result) errors[name] = result.error;
      else if (typeof result.value === "string") values[field.name] = result.value;
    }
    if (Object.keys(values).length) data[section.key] = values;
  }
  return Object.keys(errors).length ? { success: false, errors } : { success: true, data };
}

/**
 * Stored sections, read defensively: only the page's known sections and fields,
 * only strings within their limits. Anything else is dropped.
 */
export function readSections(page: PageDef, stored: unknown): PageSections {
  const out: PageSections = {};
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return out;
  const source = stored as Record<string, unknown>;
  for (const section of page.sections) {
    const values = source[section.key];
    if (!values || typeof values !== "object" || Array.isArray(values)) continue;
    const kept: Record<string, string> = {};
    for (const field of section.fields) {
      const value = (values as Record<string, unknown>)[field.name];
      if (typeof value === "string" && value.trim() && length(value) <= field.max) kept[field.name] = value;
    }
    if (Object.keys(kept).length) out[section.key] = kept;
  }
  return out;
}

export function formDataToValues(formData: FormData): FormValues {
  const out: FormValues = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    const existing = out[key];
    if (existing === undefined) out[key] = value;
    else out[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
  }
  return out;
}
