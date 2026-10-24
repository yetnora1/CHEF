import "server-only";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  CONTENT,
  CONTENT_TYPES,
  isPublicationStatus,
  PUBLICATION_STATUSES,
  type ContentType,
  type EntryImage,
  type PublicationStatus,
} from "./content-types";

/*
 * Staff reads for the CMS. Every call uses the signed-in staff member's own
 * Supabase client; the SQL functions run as the caller, so RLS decides what
 * each role sees. Responses are validated before use.
 */

export const CMS_PAGE_SIZE = 20;
export const MEDIA_PAGE_SIZE = 24;

export class CmsDataError extends Error {
  constructor(operation: string, cause: unknown) {
    super(`Content could not be loaded: ${operation}`, { cause });
    this.name = "CmsDataError";
  }
}

async function client() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new CmsDataError("client", "Supabase is not configured");
  return supabase;
}

const statusSchema = z.enum(PUBLICATION_STATUSES);

export const TRANSLATION_FILTERS = ["missing_am", "unreviewed_am", "missing_en", "unpublished"] as const;
export const LIST_SORTS = ["updated_desc", "title_asc", "order_asc"] as const;

const uuid = z.uuid();
const filtersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: statusSchema.optional().catch(undefined),
  translation: z.enum(TRANSLATION_FILTERS).optional().catch(undefined),
  parent: uuid.optional().catch(undefined),
  sort: z.enum(LIST_SORTS).catch("updated_desc"),
  page: z.coerce.number().int().min(1).max(500).catch(1),
});

export type CmsListFilters = z.infer<typeof filtersSchema>;

export function parseCmsFilters(params: Record<string, string | string[] | undefined>): CmsListFilters {
  const first = Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );
  const filters = filtersSchema.parse(first);
  return { ...filters, q: filters.q || undefined };
}

const listRowSchema = z.object({
  type: z.enum(CONTENT_TYPES),
  id: z.string(),
  slug: z.string().nullable(),
  status: statusSchema,
  sort_order: z.number().int(),
  updated_at: z.string(),
  version: z.number().int(),
  label_en: z.string().nullable(),
  label_am: z.string().nullable(),
  en_status: statusSchema.nullable(),
  am_status: statusSchema.nullable(),
  am_reviewed: z.boolean(),
  image_id: z.string().nullable(),
  parent_id: z.string().nullable(),
  total_count: z.coerce.number(),
});

export type CmsListRow = z.infer<typeof listRowSchema>;

export async function listEntries(
  type: ContentType | null,
  filters: CmsListFilters,
  pageSize = CMS_PAGE_SIZE,
): Promise<{ rows: CmsListRow[]; total: number }> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("cms_list", {
    p_type: type,
    p_search: filters.q ?? null,
    p_status: filters.status ?? null,
    p_translation: filters.translation ?? null,
    p_parent: filters.parent ?? null,
    p_sort: filters.sort,
    p_limit: pageSize,
    p_offset: (filters.page - 1) * pageSize,
  });
  if (error) throw new CmsDataError("cms_list", error);
  const rows = z.array(listRowSchema).parse(data ?? []);
  return { rows, total: rows[0]?.total_count ?? 0 };
}

const imageSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(["pending", "ready"]),
  storage_path: z.string().nullable(),
  version: z.number().int(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  alt: z.record(z.string(), z.string()).catch({}),
});

const row = z.record(z.string(), z.unknown());

const entrySchema = z.object({
  entity: row,
  translations: z.record(z.string(), row).catch({}),
  image: imageSchema.nullable().optional(),
  images: z.record(z.string(), imageSchema.nullable()).optional(),
});

export type TranslationRow = Record<string, unknown> & {
  locale: "en" | "am";
  status: PublicationStatus;
  version: number;
  language_reviewed_at: string | null;
};

export type CmsEntry = {
  type: ContentType;
  id: string;
  status: PublicationStatus;
  version: number;
  entity: Record<string, unknown>;
  translations: Partial<Record<"en" | "am", TranslationRow>>;
  image: EntryImage | null;
  images: Record<string, EntryImage | null>;
};

export async function getEntry(type: ContentType, id: string): Promise<CmsEntry | null> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("cms_get", { p_type: type, p_id: id });
  if (error) throw new CmsDataError("cms_get", error);
  if (data === null) return null;
  const parsed = entrySchema.parse(data);
  const status = parsed.entity.status;
  const def = CONTENT[type];
  return {
    type,
    id: String(parsed.entity[def.idColumn]),
    status: isPublicationStatus(status) ? status : "draft",
    version: Number(parsed.entity.version),
    entity: parsed.entity,
    translations: Object.fromEntries(
      Object.entries(parsed.translations)
        .filter(([locale]) => locale === "en" || locale === "am")
        .map(([locale, values]) => [
          locale,
          { ...values, status: isPublicationStatus(values.status) ? values.status : "draft" },
        ]),
    ) as CmsEntry["translations"],
    image: (parsed.image as EntryImage | null | undefined) ?? null,
    images: (parsed.images as CmsEntry["images"] | undefined) ?? {},
  };
}

/** Menu categories for the item form and filters (all statuses, by order). */
export async function listCategories(): Promise<{ id: string; label: string; status: string }[]> {
  const { rows } = await listEntries("menu_category", { sort: "order_asc", page: 1 }, 100);
  return rows.map((r) => ({ id: r.id, label: r.label_en ?? r.label_am ?? r.slug ?? r.id, status: r.status }));
}

export const MEDIA_FILTERS = ["ready", "unused", "missing_alt", "incomplete"] as const;
export type MediaFilter = (typeof MEDIA_FILTERS)[number];

const mediaFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  filter: z.enum(MEDIA_FILTERS).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(500).catch(1),
});

export type MediaListFilters = z.infer<typeof mediaFiltersSchema>;

export function parseMediaFilters(params: Record<string, string | string[] | undefined>): MediaListFilters {
  const first = Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );
  const filters = mediaFiltersSchema.parse(first);
  return { ...filters, q: filters.q || undefined };
}

const mediaRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(["pending", "ready"]),
  storage_path: z.string().nullable(),
  mime_type: z.string().nullable(),
  byte_size: z.number().int().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  version: z.number().int(),
  updated_at: z.string(),
  alt_en: z.string().nullable(),
  alt_am: z.string().nullable(),
  am_reviewed: z.boolean(),
  usage_count: z.number().int(),
  is_public: z.boolean(),
  total_count: z.coerce.number(),
});

export type MediaListRow = z.infer<typeof mediaRowSchema>;

export async function listMedia(
  filters: MediaListFilters,
  pageSize = MEDIA_PAGE_SIZE,
): Promise<{ rows: MediaListRow[]; total: number }> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("media_list", {
    p_search: filters.q ?? null,
    p_filter: filters.filter ?? null,
    p_limit: pageSize,
    p_offset: (filters.page - 1) * pageSize,
  });
  if (error) throw new CmsDataError("media_list", error);
  const rows = z.array(mediaRowSchema).parse(data ?? []);
  return { rows, total: rows[0]?.total_count ?? 0 };
}

const mediaDetailSchema = z.object({
  asset: z.object({
    id: z.string(),
    title: z.string(),
    credit: z.string().nullable(),
    status: z.enum(["pending", "ready"]),
    storage_path: z.string().nullable(),
    pending_path: z.string().nullable(),
    mime_type: z.string().nullable(),
    byte_size: z.number().int().nullable(),
    width: z.number().int().nullable(),
    height: z.number().int().nullable(),
    version: z.number().int(),
    updated_at: z.string(),
  }),
  translations: z.record(
    z.string(),
    z.object({
      locale: z.string(),
      alt_text: z.string(),
      version: z.number().int(),
      language_reviewed_at: z.string().nullable(),
    }),
  ),
  usages: z.array(z.object({ type: z.string(), id: z.string(), label: z.string(), status: z.string() })),
  is_public: z.boolean(),
});

export type MediaDetail = z.infer<typeof mediaDetailSchema>;

export async function getMediaAsset(id: string): Promise<MediaDetail | null> {
  if (!uuid.safeParse(id).success) return null;
  const supabase = await client();
  const { data, error } = await supabase.rpc("media_get", { p_id: id });
  if (error) throw new CmsDataError("media_get", error);
  return data === null ? null : mediaDetailSchema.parse(data);
}

const cleanupSchema = z.array(
  z.object({
    kind: z.enum(["untracked_file", "stale_upload"]),
    asset_id: z.string().nullable(),
    object_name: z.string(),
    since: z.string(),
  }),
);

export type CleanupCandidate = z.infer<typeof cleanupSchema>[number];

export async function mediaCleanupCandidates(): Promise<CleanupCandidate[]> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("media_cleanup_candidates");
  if (error) throw new CmsDataError("media_cleanup_candidates", error);
  return cleanupSchema.parse(data ?? []);
}
