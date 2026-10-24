/** Image URLs, shared by Server and Client Components. */

/** Any image, including drafts, for signed-in staff (authenticated route, never cached). */
export const adminImageUrl = (id: string, version: number) => `/admin/media/${id}/file?v=${version}`;

/** A public image (served only while published content uses it). */
export const publicImageUrl = (storagePath: string) => `/media/${storagePath}`;
