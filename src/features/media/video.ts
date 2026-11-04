/*
 * What the media library accepts as a video, for the upload form and the server.
 * Videos are not re-encoded (images are, in process-image.ts): the server checks
 * the file's signature and size once it is in Storage, and only ever serves it
 * under its own type. Storage's bucket limit is the same 50 MB.
 */

export const VIDEO_TYPES = { "video/mp4": "mp4", "video/webm": "webm" } as const;

export type VideoType = keyof typeof VIDEO_TYPES;

export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;

export const isVideoType = (type: string): type is VideoType => Object.hasOwn(VIDEO_TYPES, type);

/** The video format from the file's leading bytes, never from its name or declared type. */
export function sniffVideoType(bytes: Uint8Array): VideoType | null {
  // MP4 starts with a box of type "ftyp" (its 4-byte length comes first).
  if ([0x66, 0x74, 0x79, 0x70].every((byte, i) => bytes[4 + i] === byte)) return "video/mp4";
  // WebM starts with the EBML header.
  if ([0x1a, 0x45, 0xdf, 0xa3].every((byte, i) => bytes[i] === byte)) return "video/webm";
  return null;
}
