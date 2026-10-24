import type { useTranslations } from "next-intl";
import type { PageKey } from "./pages";

/*
 * AdminCms message keys built from the content registry: field, section and
 * image slot names in content-types.ts and pages.ts. next-intl only checks keys
 * it can see as literals, so these are asserted here, in one place, and
 * tests/unit/cms-registry.test.ts checks that every key the registry can
 * produce exists in the catalogues.
 */
type AdminCmsKey = Parameters<ReturnType<typeof useTranslations<"AdminCms">>>[0];

export const fieldLabelKey = (field: string) => `fields.${field}.label` as AdminCmsKey;

/** Not every field has a hint: check with `t.has()` first. */
export const fieldHintKey = (field: string) => `fields.${field}.hint` as AdminCmsKey;

export const sectionTitleKey = (page: PageKey, section: string) =>
  `pageSections.${page}.${section}.title` as AdminCmsKey;

export const sectionFieldKey = (page: PageKey, section: string, field: string) =>
  `pageSections.${page}.${section}.${field}` as AdminCmsKey;

export const imageSlotKey = (page: PageKey, slot: string) =>
  `pageSections.${page}.images.${slot}` as AdminCmsKey;
