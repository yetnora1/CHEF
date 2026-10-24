/**
 * Cache tag of every public CMS read (src/features/cms/public-data.ts). Any
 * content or media change invalidates it: the site is small, and one tag
 * cannot miss a dependency (e.g. alt text shown on several pages).
 */
export const CMS_CACHE_TAG = "cms";
