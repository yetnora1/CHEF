"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Clip = { key: string; src: string; poster: string };

type FoodReelProps = {
  clips: Clip[];
  labels: { region: string; pause: string; play: string };
};

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * A row of short, silent food loops without captions. Nothing is downloaded until
 * the row scrolls into view (preload="none"); clips play only while visible. They
 * stay paused for visitors who ask for reduced motion, and one button pauses or
 * plays them all (moving content needs a way to stop it). Decorative, so hidden
 * from assistive technology; the credits page describes each clip.
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
  const playing = choice ? choice === "playing" : !reducedMotion;

  useEffect(() => {
    const elements = videos.current.filter((video): video is HTMLVideoElement => video !== null);
    if (!playing) {
      for (const video of elements) video.pause();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const video = entry.target as HTMLVideoElement;
          if (entry.isIntersecting) video.play().catch(() => {});
          else video.pause();
        }
      },
      { threshold: 0.25 },
    );
    for (const video of elements) observer.observe(video);
    return () => observer.disconnect();
  }, [playing]);

  return (
    <section aria-label={labels.region} className="page-container pb-14 md:pb-20">
      <div className="grid gap-4 sm:grid-cols-3">
        {clips.map((clip, index) => (
          <div key={clip.key} className="aspect-[16/10] overflow-hidden rounded-2xl bg-surface-muted">
            <video
              ref={(element) => {
                videos.current[index] = element;
              }}
              src={clip.src}
              poster={clip.poster}
              muted
              loop
              playsInline
              preload="none"
              aria-hidden
              tabIndex={-1}
              className="h-full w-full object-cover"
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => setChoice(playing ? "paused" : "playing")}
          aria-label={playing ? labels.pause : labels.play}
          className={cn(buttonVariants({ variant: "outline", size: "icon" }), "size-9")}
        >
          {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
        </button>
      </div>
    </section>
  );
}
