import type { StaticImageData } from "next/image";
import type { Localized } from "@/lib/localization/translations";

/** A photograph bundled with the site, for a photo slot (see components/public/photo-slot). */
export type SitePhoto = {
  src: StaticImageData;
  /** What the photograph shows, for the image's alt text. */
  alt: Localized;
};
