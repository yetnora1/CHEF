import type { SitePhoto } from "@/features/content/site-photo";
import type { ResolvedText } from "@/lib/localization/translations";
import { FEATURE_MEDIA, FeatureRow } from "./feature-row";
import { PhotoSlot } from "./photo-slot";

const STORY_IMAGE_SIZES = "(min-width: 48rem) 40vw, 92vw";

type StorySectionProps = {
  id: string;
  eyebrow: ResolvedText;
  /** The eyebrow chip's colour: a `hue-*` utility. */
  hue: string;
  title: ResolvedText;
  body: ResolvedText;
  photo: SitePhoto;
  /** Image on the right from md up (rows alternate down the page). */
  imageRight?: boolean;
};

/** An image-and-text card in the style of "Meet CHEF SIS"; phones stack image first. */
export function StorySection({ id, eyebrow, hue, title, body, photo, imageRight }: StorySectionProps) {
  return (
    <FeatureRow
      headingId={`${id}-heading`}
      eyebrow={eyebrow}
      hue={hue}
      title={title}
      mediaRight={imageRight}
      media={<PhotoSlot subject={title} photo={photo} sizes={STORY_IMAGE_SIZES} className={FEATURE_MEDIA} />}
    >
      <p className="mt-5 text-lg text-muted-foreground" lang={body.lang}>
        {body.text}
      </p>
    </FeatureRow>
  );
}
