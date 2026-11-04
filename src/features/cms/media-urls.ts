/** Media URLs, shared by Server and Client Components. */

/** Any file, including drafts, for signed-in staff (authenticated route, never cached). */
export const adminImageUrl = (id: string, version: number) => `/admin/media/${id}/file?v=${version}`;

/** A public file (served only while the website uses it). */
export const publicImageUrl = (storagePath: string) => `/media/${storagePath}`;
