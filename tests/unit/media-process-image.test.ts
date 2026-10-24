import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MEDIA_LIMITS, processImage, sniffFormat } from "@/features/media/process-image";

/* Real images generated with sharp: no fixtures, nothing mocked. */

const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 180, g: 90, b: 40 } } });

async function jpegWithMetadata() {
  // Orientation 6 = rotate 90° clockwise to display (libvips keeps it apart from
  // the other EXIF fields), plus identifying camera, owner and GPS fields.
  return solid(400, 200)
    .withMetadata({ orientation: 6 })
    .withExifMerge({
      IFD0: { Make: "PhoneMaker", Model: "Pocket Camera", Artist: "Private Person" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "9/1 1/1 0/1",
        GPSLongitudeRef: "E",
        GPSLongitude: "38/1 45/1 0/1",
      },
    })
    .jpeg()
    .toBuffer();
}

const run = (bytes: Uint8Array, fileName: string, declaredType: string) =>
  processImage({ bytes, fileName, declaredType });

describe("image upload processing", () => {
  it("applies the camera orientation, then strips EXIF and GPS data", async () => {
    const input = await jpegWithMetadata();
    const before = await sharp(input).metadata();
    expect(before.exif).toBeDefined();
    expect(before.orientation).toBe(6);

    const result = await run(input, "Wedding table.JPG", "image/jpeg");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const out = await sharp(result.image.buffer).metadata();
    expect(out.exif).toBeUndefined();
    expect(out.xmp).toBeUndefined();
    expect(out.orientation).toBeUndefined();
    // 400×200 rotated by the orientation tag becomes 200×400.
    expect([result.image.width, result.image.height]).toEqual([200, 400]);
    expect(result.image.buffer.includes(Buffer.from("Private Person"))).toBe(false);
    expect(result.image).toMatchObject({ format: "jpeg", mime: "image/jpeg", ext: "jpg" });
  });

  it("re-encodes PNG and WebP in their own format and caps the long edge", async () => {
    const png = await run(await solid(3000, 1000).png().toBuffer(), "logo.png", "image/png");
    expect(png).toMatchObject({ ok: true, image: { format: "png", width: MEDIA_LIMITS.outputMaxEdge } });
    const webp = await run(await solid(320, 240).webp().toBuffer(), "dish.webp", "image/webp");
    expect(webp).toMatchObject({ ok: true, image: { format: "webp", width: 320, height: 240 } });
  });

  it("identifies formats by signature only", async () => {
    expect(sniffFormat(await solid(4, 4).png().toBuffer())).toBe("png");
    expect(sniffFormat(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(sniffFormat(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBeNull(); // GIF
  });

  it.each([
    [
      "an SVG (scriptable)",
      new TextEncoder().encode('<svg onload="alert(1)"/>'),
      "x.svg",
      "image/svg+xml",
      "unsupportedType",
    ],
    [
      "a text file renamed .jpg",
      new TextEncoder().encode("hello, not an image"),
      "photo.jpg",
      "image/jpeg",
      "unsupportedType",
    ],
    [
      "an HTML file declared as an image",
      new TextEncoder().encode("<html><script>x</script>"),
      "a.png",
      "image/png",
      "unsupportedType",
    ],
    ["an empty file", new Uint8Array(), "empty.png", "image/png", "empty"],
  ])("rejects %s", async (_label, bytes, name, type, reason) => {
    expect(await run(bytes, name, type)).toEqual({ ok: false, reason });
  });

  it("rejects a mismatch between content, declared type and extension", async () => {
    const png = await solid(10, 10).png().toBuffer();
    expect(await run(png, "photo.jpg", "image/jpeg")).toEqual({ ok: false, reason: "typeMismatch" });
    expect(await run(png, "photo.png", "image/jpeg")).toEqual({ ok: false, reason: "typeMismatch" });
    expect(await run(png, "photo.svg", "image/png")).toEqual({ ok: false, reason: "typeMismatch" });
    expect(await run(png, "photo", "image/png")).toEqual({ ok: false, reason: "typeMismatch" });
  });

  it("rejects a truncated or corrupt image", async () => {
    const jpeg = await solid(200, 200).jpeg().toBuffer();
    expect(await run(jpeg.subarray(0, 200), "cut.jpg", "image/jpeg")).toEqual({
      ok: false,
      reason: "unreadable",
    });
  });

  it("rejects files over the size limit before decoding", async () => {
    const huge = new Uint8Array(MEDIA_LIMITS.maxBytes + 1);
    huge.set([0xff, 0xd8, 0xff]);
    expect(await run(huge, "big.jpg", "image/jpeg")).toEqual({ ok: false, reason: "tooLarge" });
  });

  it("rejects images with too many pixels (decompression bombs)", async () => {
    // A tiny, highly compressible PNG that would decode to 81 megapixels.
    const bomb = await sharp({ create: { width: 9000, height: 9000, channels: 3, background: "#000" } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(bomb.byteLength).toBeLessThan(MEDIA_LIMITS.maxBytes);
    expect(await run(bomb, "bomb.png", "image/png")).toEqual({ ok: false, reason: "tooManyPixels" });
  });
});
