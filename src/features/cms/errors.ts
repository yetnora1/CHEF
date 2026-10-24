/*
 * Database errors → stable message codes the admin translates. Nothing from the
 * database (constraint names, SQL) is shown to staff as-is.
 */

export const CMS_ERRORS = [
  "forbidden",
  "notFound",
  "conflict",
  "slugTaken",
  "translationExists",
  "reviewRequired",
  "inUse",
  "unpublishFirst",
  "invalid",
  "uploadMissing",
  "notConfigured",
  "generic",
] as const;

export type CmsError = (typeof CMS_ERRORS)[number];

type DbError = { code?: string | null; hint?: string | null; message?: string | null };

export function cmsError(error: DbError, operation: "save" | "delete" = "save"): CmsError {
  const message = error.message ?? "";
  switch (error.code) {
    case "42501":
      return "forbidden";
    case "23505":
      if (/_slug_unique/.test(message)) return "slugTaken";
      if (/_pkey/.test(message)) return "translationExists";
      return "conflict";
    // ON DELETE RESTRICT: PostgreSQL 17 reports 23503, PostgreSQL 18 23001.
    case "23503":
    case "23001":
      return operation === "delete" ? "inUse" : "invalid";
    case "23514":
    case "22023":
    case "22P02":
    case "23502":
      return error.hint === "upload_missing" ? "uploadMissing" : "invalid";
    case "P0001":
      return error.hint === "review_required" ? "reviewRequired" : "generic";
    default:
      return "generic";
  }
}
