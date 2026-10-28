"use client";

import { Maximize2, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VideoViewer, type ReelClip, type VideoViewerLabels } from "./video-viewer";

type FoodReelProps = {
  clips: ReelClip[];
  labels: VideoViewerLabels & { region: string; pauseAll: string; playAll: string; open: string };
};

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
// Clips start buffering this far before they scroll into view, so they are ready when seen.
const PRELOAD_MARGIN = "400px 0px";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * A grid of short, silent food loops without captions. The tiles play light 640px
 * copies: nothing downloads until the reel is near the viewport (preload="none"
 * until then), and clips play only while visible. They stay paused for visitors
 * who ask for reduced motion, and one button pauses or plays them all (moving
 * content needs a way to stop it). Clicking a tile opens it full screen in the
 * VideoViewer at full quality; the tiles pause meanwhile.
 */
export function FoodReel({ clips, labels }: FoodReelProps) {
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
  // The visitor's own choice wins over the motion preference.
  const [choice, setChoice] = useState<"playing" | "paused" | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const playing = choice ? choice === "playing" : !reducedMotion;

  useEffect(() => {
    const elements = videos.current.filter((video): video is HTMLVideoElement => video !== null);
    if (!playing || viewing !== null) {
      for (const video of elements) video.pause();
      return;
    }
    const nearby = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const video = entry.target as HTMLVideoElement;
          if (!entry.isIntersecting || video.preload === "auto") continue;
          video.preload = "auto";
          // Start fetching now; a media element left at preload="none" may wait for play().
          if (video.readyState === HTMLMediaElement.HAVE_NOTHING) video.load();
          nearby.unobserve(video);
        }
      },
      { rootMargin: PRELOAD_MARGIN },
    );
    const visible = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const video = entry.target as HTMLVideoElement;
          if (entry.isIntersecting) video.play().catch(() => {});
          else video.pause();
        }
      },
      { threshold: 0.25 },
    );
    for (const video of elements) {
      nearby.observe(video);
      visible.observe(video);
    }
    return () => {
      nearby.disconnect();
      visible.disconnect();
    };
  }, [playing, viewing]);

  return (
    <section aria-label={labels.region} className="page-container pb-14 md:pb-20">
      {/* Two columns on phones (a long single column of loops would dwarf the page), three from sm. */}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {clips.map((clip, index) => (
          <li key={clip.key}>
            <button
              type="button"
              onClick={() => setViewing(index)}
              className="group/clip relative block aspect-[16/10] w-full cursor-pointer overflow-hidden rounded-2xl bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring"
            >
              <video
                ref={(element) => {
                  videos.current[index] = element;
                }}
                src={clip.preview}
                poster={clip.poster}
                muted
                loop
                playsInline
                preload="none"
                aria-hidden
                className="pointer-events-none h-full w-full object-cover transition-transform duration-260 ease-out motion-safe:group-hover/clip:scale-[1.03]"
              />
              {/* Full-screen hint: on hover or focus, always on touch screens (no hover there). */}
              <span
                aria-hidden
                className="absolute right-2 bottom-2 flex size-8 items-center justify-center rounded-full border border-stage-foreground/25 bg-stage/40 text-stage-foreground opacity-0 backdrop-blur-md transition-opacity duration-200 group-hover/clip:opacity-100 group-focus-visible/clip:opacity-100 [@media(hover:none)]:opacity-100"
              >
                <Maximize2 className="size-4" />
              </span>
              <span className="sr-only">
                {labels.open}: <span lang={clip.description.lang}>{clip.description.text}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => setChoice(playing ? "paused" : "playing")}
          aria-label={playing ? labels.pauseAll : labels.playAll}
          className={cn(buttonVariants({ variant: "outline", size: "icon" }), "size-9")}
        >
          {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
        </button>
      </div>

      <VideoViewer clips={clips} index={viewing} onIndexChange={setViewing} labels={labels} />
    </section>
  );
}
