import type { AdminModuleKey } from "@/features/admin/modules";
import type { EventType } from "@/features/bookings/status";

/*
 * Content type registry: one definition per kind of content, used by the admin
 * lists and forms, server-side validation (schemas.ts) and the server actions.
 * Table and column names match supabase/migrations/20261027090200_*.sql; the
 * database enforces permissions and constraints, this module mirrors them so
 * the admin can explain problems before saving.
 */

export const PUBLICATION_STATUSES = ["draft", "in_review", "published", "archived"] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export function isPublicationStatus(value: unknown): value is PublicationStatus {
  return (PUBLICATION_STATUSES as readonly unknown[]).includes(value);
}

/**
 * Entering, leaving or editing these states needs content.publish
 * (mirrors private.enforce_publish_permission).
 */
export const RESTRICTED_STATUSES: ReadonlySet<PublicationStatus> = new Set(["published", "archived"]);

export function needsPublishPermission(from: PublicationStatus, to: PublicationStatus): boolean {
  return RESTRICTED_STATUSES.has(from) || RESTRICTED_STATUSES.has(to);
}

/** Next steps offered in the admin for each status. */
export const STATUS_ACTIONS: Record<PublicationStatus, readonly PublicationStatus[]> = {
  draft: ["in_review", "published", "archived"],
  in_review: ["draft", "published", "archived"],
  published: ["draft", "archived"],
  archived: ["draft"],
};

export const DIETARY_TAGS = ["vegetarian", "vegan", "fasting", "spicy"] as const;
export type DietaryTag = (typeof DIETARY_TAGS)[number];

export function isDietaryTag(value: unknown): value is DietaryTag {
  return (DIETARY_TAGS as readonly unknown[]).includes(value);
}

export type FieldKind =
  "text" | "textarea" | "markup" | "slug" | "order" | "image" | "category" | "dietary" | "eventType";

export type FieldDef = {
  /** Database column (or section field) name. */
  name: string;
  kind: FieldKind;
  required?: boolean;
  /** Maximum length in characters (matches the database check constraint). */
  max?: number;
  rows?: number;
};

export const CONTENT_TYPES = [
  "page",
  "service",
  "menu_category",
  "menu_item",
  "gallery_item",
  "journal_post",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export function isContentType(value: unknown): value is ContentType {
  return (CONTENT_TYPES as readonly unknown[]).includes(value);
}

export type ContentTypeDef = {
  type: ContentType;
  table: string;
  translationTable: string;
  /** Translation column referencing the entity. */
  parentColumn: string;
  idColumn: "id" | "key";
  module: AdminModuleKey;
  /** Admin list URL; entries live at `${basePath}/${id}`. */
  basePath: `/admin/${string}`;
  entityFields: readonly FieldDef[];
  translationFields: readonly FieldDef[];
  /** Staff can create and delete entries (pages are a fixed set). */
  creatable: boolean;
  /** Public path (without the locale prefix) once published. */
  publicPath: (entry: { id: string; slug: string | null }) => string;
};

const seo: readonly FieldDef[] = [
  { name: "seo_title", kind: "text", max: 70 },
  { name: "seo_description", kind: "textarea", max: 170, rows: 2 },
];

export const CONTENT: Record<ContentType, ContentTypeDef> = {
  page: {
    type: "page",
    table: "pages",
    translationTable: "page_translations",
    parentColumn: "page_key",
    idColumn: "key",
    module: "pages",
    basePath: "/admin/pages",
    entityFields: [],
    // Section fields come from src/features/cms/pages.ts.
    translationFields: [{ name: "title", kind: "text", required: true, max: 160 }, ...seo],
    creatable: false,
    publicPath: ({ id }) => (id === "home" ? "/" : `/${id}`),
  },
  service: {
    type: "service",
    table: "services",
    translationTable: "service_translations",
    parentColumn: "service_id",
    idColumn: "id",
    module: "services",
    basePath: "/admin/services",
    entityFields: [
      { name: "slug", kind: "slug", required: true },
      { name: "sort_order", kind: "order" },
      { name: "image_id", kind: "image" },
    ],
    translationFields: [
      { name: "title", kind: "text", required: true, max: 160 },
      { name: "summary", kind: "textarea", max: 500, rows: 3 },
      { name: "body", kind: "markup", max: 20000, rows: 14 },
      ...seo,
    ],
    creatable: true,
    publicPath: ({ slug }) => `/services/${slug}`,
  },
  menu_category: {
    type: "menu_category",
    table: "menu_categories",
    translationTable: "menu_category_translations",
    parentColumn: "category_id",
    idColumn: "id",
    module: "menu",
    basePath: "/admin/menu/categories",
    entityFields: [
      { name: "slug", kind: "slug", required: true },
      { name: "sort_order", kind: "order" },
    ],
    translationFields: [
      { name: "name", kind: "text", required: true, max: 120 },
      { name: "description", kind: "textarea", max: 1000, rows: 3 },
    ],
    creatable: true,
    publicPath: () => "/menu",
  },
  menu_item: {
    type: "menu_item",
    table: "menu_items",
    translationTable: "menu_item_translations",
    parentColumn: "item_id",
    idColumn: "id",
    module: "menu",
    basePath: "/admin/menu",
    entityFields: [
      { name: "category_id", kind: "category", required: true },
      { name: "sort_order", kind: "order" },
      { name: "image_id", kind: "image" },
      { name: "dietary_tags", kind: "dietary" },
    ],
    translationFields: [
      { name: "name", kind: "text", required: true, max: 120 },
      { name: "description", kind: "textarea", max: 1000, rows: 3 },
    ],
    creatable: true,
    publicPath: () => "/menu",
  },
  gallery_item: {
    type: "gallery_item",
    table: "gallery_items",
    translationTable: "gallery_item_translations",
    parentColumn: "item_id",
    idColumn: "id",
    module: "gallery",
    basePath: "/admin/gallery",
    entityFields: [
      { name: "asset_id", kind: "image", required: true },
      { name: "sort_order", kind: "order" },
      { name: "event_type", kind: "eventType" },
    ],
    translationFields: [{ name: "caption", kind: "textarea", required: true, max: 300, rows: 3 }],
    creatable: true,
    publicPath: () => "/gallery",
  },
  journal_post: {
    type: "journal_post",
    table: "journal_posts",
    translationTable: "journal_post_translations",
    parentColumn: "post_id",
    idColumn: "id",
    module: "journal",
    basePath: "/admin/journal",
    entityFields: [
      { name: "slug", kind: "slug", required: true },
      { name: "cover_image_id", kind: "image" },
    ],
    translationFields: [
      { name: "title", kind: "text", required: true, max: 160 },
      { name: "excerpt", kind: "textarea", max: 500, rows: 3 },
      { name: "body", kind: "markup", max: 50000, rows: 18 },
      ...seo,
    ],
    creatable: true,
    publicPath: ({ slug }) => `/journal/${slug}`,
  },
};

/** The English field used to label an entry in lists. */
export function labelField(type: ContentType): string {
  return CONTENT[type].translationFields[0]!.name;
}

export type EntryImage = {
  id: string;
  title: string;
  status: "pending" | "ready";
  storage_path: string | null;
  version: number;
  width: number | null;
  height: number | null;
  alt: Partial<Record<"en" | "am", string>>;
};

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SLUG_MAX = 80;

export type EventTypeOption = EventType;
