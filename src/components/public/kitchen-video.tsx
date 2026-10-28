"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { buttonVariants } from "@/components/ui/button";
import type { KitchenVideo as KitchenClip } from "@/features/content/sample-videos";
import { cn } from "@/lib/utils";

type KitchenVideoProps = {
  clip: KitchenClip;
  labels: { video: string; pause: string; play: string };
};

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
// Where the wide crop takes over from the phone crop (Tailwind's `sm`).
const WIDE = "(min-width: 40rem)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * A real kitchen under the homepage header: a short, silent loop of a cook at
 * work, cropped 4:3 for phones and 3:1 from `sm` up, each crop its own small
 * file (`<source media>`). Its first frame is painted at once as an image, and
 * the video fades in over it once it actually plays. Nothing downloads until
 * the loop is allowed to play: visitors who ask for reduced motion see the
 * still frame, and can still press play. It plays only while on screen, and
 * its button pauses it (moving content needs a way to stop it).
 */
export function KitchenVideo({ clip, labels }: KitchenVideoProps) {
  const video = useRef<HTMLVideoElement>(null);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
  // The visitor's own choice wins over the motion preference.
  const [choice, setChoice] = useState<"playing" | "paused" | null>(null);
  const [started, setStarted] = useState(false);
  const playing = choice ? choice === "playing" : !reducedMotion;

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    // Read the preference itself: during hydration `reducedMotion` still holds the server's guess.
    const allowed = choice ? choice === "playing" : !window.matchMedia(REDUCED_MOTION).matches;
    if (!allowed) {
      element.pause();
      return;
    }
    // Raising preload starts the download (not load(): it would cancel a play() under way).
    element.preload = "auto";
    const visible = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) element.play().catch(() => {});
        else element.pause();
      },
      { threshold: 0.2 },
    );
    visible.observe(element);
    return () => visible.disconnect();
  }, [choice, reducedMotion]);

  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-border bg-surface-muted shadow-glass sm:aspect-[3/1]">
      <picture>
        <source media={WIDE} srcSet={clip.wide.poster} />
        <img
          src={clip.narrow.poster}
          alt=""
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </picture>
      <video
        ref={video}
        muted
        loop
        playsInline
        preload="none"
        aria-label={labels.video}
        onPlaying={() => setStarted(true)}
        className={cn(
          "absolute inset-0 h-full w-full object-cover transition-opacity duration-700",
          started ? "opacity-100" : "opacity-0",
        )}
      >
        <source media={WIDE} src={clip.wide.src} type="video/mp4" />
        <source src={clip.narrow.src} type="video/mp4" />
      </video>
      {/* A soft vignette and a line of light on the rim, like the other glass panels. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-3xl bg-[radial-gradient(ellipse_at_center,transparent_55%,color-mix(in_oklab,var(--stage)_28%,transparent))] inset-shadow-glass"
      />
      <button
        type="button"
        onClick={() => setChoice(playing ? "paused" : "playing")}
        aria-label={playing ? labels.pause : labels.play}
        className={cn(
          buttonVariants({ variant: "outline", size: "icon" }),
          "absolute right-3 bottom-3 size-9 border-stage-foreground/25 bg-stage/45 text-stage-foreground hover:bg-stage/60",
        )}
      >
        {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
      </button>
    </div>
  );
}
