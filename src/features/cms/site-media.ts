import type { StaticImageData } from "next/image";
import { chefMediaKey, sampleMediaKey, videoMediaKey } from "@/features/content/bundled-media";
import {
  chefPhotos,
  GALLERY_PHOTOS,
  galleryPhotos,
  HOME_PHOTOS,
  SLOTS,
  type ChefPhoto,
  type ChefPhotoKey,
  type GalleryPhoto,
} from "@/features/content/chef-photos";
import { samplePhotos, type SamplePhoto } from "@/features/content/sample-photos";
import { sampleVideos } from "@/features/content/sample-videos";
import type { SitePhoto } from "@/features/content/site-photo";
import type { AppLocale } from "@/i18n/routing";
import type { Localized } from "@/lib/localization/translations";
import { publicImageUrl } from "./media-urls";
import type { PublicSiteMediaRow } from "./public-data";

export type SiteClip = {
  key: string;
  src: string;
  preview: string;
  /** Bundled clips have one; an uploaded video shows its first frame once it loads. */
  poster: string | null;
  description: Localized;
};

/** An uploaded file with a credit recorded for it, for the credits page. */
export type UploadedCredit = {
  key: string;
  kind: "image" | "video";
  thumbnail: StaticImageData | null;
  description: Localized;
  credit: string;
};

/**
 * The website's own photographs and videos as they stand: the bundled files with
 * what staff changed in the media library applied. A deleted file is null, and a
 * replaced one points at its upload. With no rows (no database, or a failed read)
 * everything is as bundled, so the site never loses its pictures; a file deleted in
 * the library therefore comes back for as long as the database cannot be read.
 */
export function siteMedia(rows: PublicSiteMediaRow[] | null) {
  const byKey = new Map(rows?.flatMap((row) => (row.key ? [[row.key, row] as const] : [])));

  function resolve<T extends SitePhoto>(key: string, bundled: T): T | null {
    const row = byKey.get(key);
    if (!row) return bundled;
    if (row.removed) return null;
    if (!row.file) return { ...bundled, alt: { ...bundled.alt, ...row.alt } };
    return {
      ...bundled,
      src: { src: publicImageUrl(row.file.path), width: row.file.width, height: row.file.height },
      alt: row.alt,
    };
  }

  const chef = (key: ChefPhotoKey): ChefPhoto | null => resolve(chefMediaKey(key), chefPhotos[key]);
  const sample = (key: keyof typeof samplePhotos): SamplePhoto | null =>
    resolve(sampleMediaKey(key), samplePhotos[key]);

  return {
    chef,
    sample,

    /**
     * The photo for a page slot or a service slug: null once it was deleted, and
     * undefined if there has never been one (the slot then shows its placeholder).
     */
    slot(name: string): SitePhoto | null | undefined {
      if (Object.hasOwn(SLOTS, name)) return chef(SLOTS[name]!);
      if (Object.hasOwn(samplePhotos, name)) return sample(name as keyof typeof samplePhotos);
      return undefined;
    },

    gallery: (locale: AppLocale): GalleryPhoto[] => galleryPhotos(GALLERY_PHOTOS, locale, chef),

    /** The homepage's tiles; a deleted photo gives way to one the page does not show yet. */
    mosaic(locale: AppLocale): GalleryPhoto[] {
      const reserves = GALLERY_PHOTOS.filter(
        (key) => !HOME_PHOTOS.includes(key) && key !== SLOTS.hero && key !== SLOTS.about,
      );
      return galleryPhotos([...HOME_PHOTOS, ...reserves], locale, chef).slice(0, HOME_PHOTOS.length);
    },

    /** Uploaded videos first, newest first, then the bundled clips in their order. */
    videos(): SiteClip[] {
      const uploaded = (rows ?? []).flatMap((row): SiteClip[] => {
        if (row.key || row.kind !== "video" || !row.file) return [];
        const url = publicImageUrl(row.file.path);
        return [{ key: row.id, src: url, preview: url, poster: null, description: row.alt }];
      });
      const bundled = sampleVideos.flatMap((video): SiteClip[] => {
        const row = byKey.get(videoMediaKey(video.key));
        if (row?.removed) return [];
        if (row?.file) {
          const url = publicImageUrl(row.file.path);
          return [{ key: video.key, src: url, preview: url, poster: null, description: row.alt }];
        }
        const { key, src, preview, poster, description } = video;
        return [{ key, src, preview, poster, description: { ...description, ...row?.alt } }];
      });
      return [...uploaded, ...bundled];
    },

    /** Whether the bundled file itself is on the site: its credit is listed only while it is. */
    bundledInUse(key: string): boolean {
      const row = byKey.get(key);
      return !row || (!row.removed && !row.file);
    },

    uploadedCredits(): UploadedCredit[] {
      return (rows ?? []).flatMap((row): UploadedCredit[] => {
        if (row.removed || !row.file || !row.credit) return [];
        const { path, width, height } = row.file;
        return [
          {
            key: row.id,
            kind: row.kind,
            thumbnail: row.kind === "image" ? { src: publicImageUrl(path), width, height } : null,
            description: row.alt,
            credit: row.credit,
          },
        ];
      });
    },
  };
}

export type SiteMedia = ReturnType<typeof siteMedia>;
