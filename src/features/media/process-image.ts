import "server-only";
import sharp from "sharp";

/*
 * Upload validation and sanitisation. Every image is decoded and re-encoded on
 * the server, so what reaches Storage is a clean image of a known type:
 *   * only JPEG, PNG and WebP; the file signature, the declared type, the
 *     extension and the decoded format must all agree
 *   * bounded file size and pixel count (no decompression bombs)
 *   * EXIF orientation applied, then ALL metadata removed (camera data, GPS
 *     location, comments), colours converted to sRGB
 *   * resized to at most 2560 px on the long edge (the website never needs more)
 * Animated images keep their first frame.
 */

export const MEDIA_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  maxInputPixels: 40_000_000,
  maxInputEdge: 8000,
  outputMaxEdge: 2560,
} as const;

export const MEDIA_FORMATS = {
  jpeg: { mime: "image/jpeg", ext: "jpg", extensions: ["jpg", "jpeg"] },
  png: { mime: "image/png", ext: "png", extensions: ["png"] },
  webp: { mime: "image/webp", ext: "webp", extensions: ["webp"] },
} as const;

export type MediaFormat = keyof typeof MEDIA_FORMATS;

export type ImageRejection =
  "empty" | "tooLarge" | "unsupportedType" | "typeMismatch" | "unreadable" | "tooManyPixels";

export type ProcessedImage = {
  buffer: Buffer;
  format: MediaFormat;
  mime: (typeof MEDIA_FORMATS)[MediaFormat]["mime"];
  ext: (typeof MEDIA_FORMATS)[MediaFormat]["ext"];
  width: number;
  height: number;
  byteSize: number;
};

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  signature.every((byte, i) => bytes[offset + i] === byte);

/** The image format from the file's leading bytes, never from its name or declared type. */
export function sniffFormat(bytes: Uint8Array): MediaFormat | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  // "RIFF" <size> "WEBP"
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8))
    return "webp";
  return null;
}

function extensionOf(fileName: string): string {
  const match = /\.([a-z0-9]{1,8})$/i.exec(fileName.trim());
  return match ? match[1]!.toLowerCase() : "";
}

export async function processImage(input: {
  bytes: Uint8Array;
  declaredType: string;
  fileName: string;
}): Promise<{ ok: true; image: ProcessedImage } | { ok: false; reason: ImageRejection }> {
  const { bytes } = input;
  if (bytes.byteLength === 0) return { ok: false, reason: "empty" };
  if (bytes.byteLength > MEDIA_LIMITS.maxBytes) return { ok: false, reason: "tooLarge" };

  const format = sniffFormat(bytes);
  if (!format) return { ok: false, reason: "unsupportedType" };
  const spec = MEDIA_FORMATS[format];
  const declared = input.declaredType.trim().toLowerCase().replace("image/jpg", "image/jpeg");
  if (
    (declared && declared !== spec.mime) ||
    !(spec.extensions as readonly string[]).includes(extensionOf(input.fileName))
  ) {
    return { ok: false, reason: "typeMismatch" };
  }

  const options = { limitInputPixels: MEDIA_LIMITS.maxInputPixels, failOn: "warning" } as const;
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    metadata = await sharp(bytes, options).metadata();
  } catch (error) {
    return { ok: false, reason: /pixel limit/i.test(String(error)) ? "tooManyPixels" : "unreadable" };
  }
  if (metadata.format !== format) return { ok: false, reason: "typeMismatch" };
  if (!metadata.width || !metadata.height) return { ok: false, reason: "unreadable" };
  if (metadata.width > MEDIA_LIMITS.maxInputEdge || metadata.height > MEDIA_LIMITS.maxInputEdge) {
    return { ok: false, reason: "tooManyPixels" };
  }

  try {
    const pipeline = sharp(bytes, options)
      .rotate()
      .resize({
        width: MEDIA_LIMITS.outputMaxEdge,
        height: MEDIA_LIMITS.outputMaxEdge,
        fit: "inside",
        withoutEnlargement: true,
      })
      .withIccProfile("srgb");
    const encoded =
      format === "jpeg"
        ? pipeline.jpeg({ quality: 82, mozjpeg: true })
        : format === "png"
          ? pipeline.png({ compressionLevel: 9, adaptiveFiltering: true })
          : pipeline.webp({ quality: 82 });
    const { data, info } = await encoded.toBuffer({ resolveWithObject: true });
    if (data.byteLength > MEDIA_LIMITS.maxBytes) return { ok: false, reason: "tooLarge" };
    return {
      ok: true,
      image: {
        buffer: data,
        format,
        mime: spec.mime,
        ext: spec.ext,
        width: info.width,
        height: info.height,
        byteSize: data.byteLength,
      },
    };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}
