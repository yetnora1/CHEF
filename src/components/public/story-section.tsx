import type { SamplePhoto } from "@/features/content/sample-photos";
import type { ResolvedText } from "@/lib/localization/translations";
import { cn } from "@/lib/utils";
import { PhotoSlot } from "./photo-slot";

const STORY_IMAGE_SIZES = "(min-width: 48rem) 40vw, 24rem";

type StorySectionProps = {
  id: string;
  eyebrow: ResolvedText;
  title: ResolvedText;
  body: ResolvedText;
  photo: SamplePhoto;
  /** Image on the right from md up (rows alternate down the page). */
  imageRight?: boolean;
};

/** An image-and-text row in the style of "Meet Chef Harena"; phones stack image first. */
export function StorySection({ id, eyebrow, title, body, photo, imageRight }: StorySectionProps) {
  return (
    <section aria-labelledby={`${id}-heading`} className="py-14 md:py-20">
      <div
        className={cn(
          "page-container grid items-center gap-12 lg:gap-20",
          imageRight ? "md:grid-cols-[1fr_0.8fr]" : "md:grid-cols-[0.8fr_1fr]",
        )}
      >
        <PhotoSlot
          subject={title}
          sample={photo}
          sizes={STORY_IMAGE_SIZES}
          className={cn("aspect-[4/5] w-full max-w-sm md:max-w-none", imageRight && "md:order-2")}
        />
        <div className={cn("max-w-xl", imageRight && "md:order-1 md:justify-self-end")}>
          <p className="eyebrow text-accent-ink" lang={eyebrow.lang}>
            {eyebrow.text}
          </p>
          <h2 id={`${id}-heading`} className="mt-5 display-lg" lang={title.lang}>
            {title.text}
          </h2>
          <p className="mt-7 text-lg text-muted-foreground" lang={body.lang}>
            {body.text}
          </p>
        </div>
      </div>
    </section>
  );
}
