"use client";

import { ChevronLeft, ChevronRight, Minimize2, Pause, Play } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import type { ResolvedText } from "@/lib/localization/translations";
import { cn } from "@/lib/utils";

export type ReelClip = {
  key: string;
  /** 960x600, played here. */
  src: string;
  /** 640x400, played in the reel's tiles. */
  preview: string;
  poster: string;
  description: ResolvedText;
};

export type VideoViewerLabels = {
  exit: string;
  previous: string;
  next: string;
  pause: string;
  play: string;
};

type VideoViewerProps = {
  clips: ReelClip[];
  /** The clip on screen; null while the viewer is closed. */
  index: number | null;
  onIndexChange: (index: number | null) => void;
  labels: VideoViewerLabels;
};

const control = cn(
  buttonVariants({ variant: "outline", size: "icon" }),
  "size-11 rounded-full [&_svg]:size-5",
);
// A horizontal swipe of at least this many pixels moves to the next or previous clip.
const SWIPE = 50;

/**
 * Plays one clip at a time on a black stage that fills the screen: the browser's
 * full screen where it allows it, otherwise the whole window (iPhone). Previous and
 * next buttons, the arrow keys and a swipe move between clips; minimize, or Escape,
 * leaves full screen and closes it. Radix Dialog traps focus and returns it to the
 * tile. The stage is dark whatever the theme.
 */
export function VideoViewer({ clips, index, onIndexChange, labels }: VideoViewerProps) {
  const clip = index === null ? null : clips[index];
  // Stable, so the stage's full-screen effect runs once per opening, not on every clip change.
  const close = useCallback(() => onIndexChange(null), [onIndexChange]);
  // The tile that opened the viewer gets focus back (Radix would look for a Dialog.Trigger).
  const opener = useRef<HTMLElement | null>(null);

  return (
    <DialogPrimitive.Root open={clip !== null} onOpenChange={(open) => !open && close()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-stage data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={() => {
            opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
          }}
          data-theme="dark"
          className="fixed inset-0 z-50 text-foreground [color-scheme:dark] outline-none"
        >
          {clip && index !== null && (
            <Stage
              clip={clip}
              position={`${index + 1} / ${clips.length}`}
              onStep={(step) => onIndexChange((index + step + clips.length) % clips.length)}
              onClose={close}
              labels={labels}
            />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

type StageProps = {
  clip: ReelClip;
  position: string;
  onStep: (step: 1 | -1) => void;
  onClose: () => void;
  labels: VideoViewerLabels;
};

/** Mounted while the viewer is open, so each opening starts in full screen and playing. */
function Stage({ clip, position, onStep, onClose, labels }: StageProps) {
  const stage = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const swipeFrom = useRef<{ x: number; y: number } | null>(null);
  const [playing, setPlaying] = useState(true);

  // Full screen, requested while the click that opened the viewer still counts as user activation.
  useEffect(() => {
    const element = stage.current;
    if (element?.requestFullscreen && !document.fullscreenElement) {
      element.requestFullscreen().catch(() => {
        // Refused (an iPhone, or no activation left): the viewer still fills the window.
      });
    }
    // Leaving full screen by any route (Escape, minimize, the browser's own control) closes the viewer.
    const onChange = () => {
      if (!document.fullscreenElement) onClose();
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [onClose]);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (playing) element.play().catch(() => {});
    else element.pause();
  }, [playing, clip.key]);

  const step = (direction: 1 | -1) => {
    onStep(direction);
    setPlaying(true);
  };
  const exit = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else onClose();
  };

  return (
    <div
      ref={stage}
      className="relative flex h-full w-full items-center justify-center bg-stage"
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") step(1);
        if (event.key === "ArrowLeft") step(-1);
      }}
      onPointerDown={(event) => {
        swipeFrom.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        const from = swipeFrom.current;
        swipeFrom.current = null;
        if (!from) return;
        const dx = event.clientX - from.x;
        if (Math.abs(dx) >= SWIPE && Math.abs(dx) > Math.abs(event.clientY - from.y)) step(dx < 0 ? 1 : -1);
      }}
    >
      <DialogPrimitive.Title className="sr-only" lang={clip.description.lang}>
        {clip.description.text}
      </DialogPrimitive.Title>

      <video
        ref={video}
        key={clip.key}
        src={clip.src}
        poster={clip.poster}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden
        className="max-h-full w-full object-contain"
      />

      {/* Top bar: position and minimize, over a soft shade so they read on any frame. */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-linear-to-b from-stage/70 to-transparent p-4 sm:p-6">
        <p aria-live="polite" className="text-sm font-semibold text-stage-foreground tabular-nums">
          {position}
        </p>
        <button type="button" onClick={exit} aria-label={labels.exit} className={control}>
          <Minimize2 aria-hidden />
        </button>
      </div>

      <button
        type="button"
        onClick={() => step(-1)}
        aria-label={labels.previous}
        className={cn(control, "absolute inset-y-0 left-3 my-auto sm:left-6")}
      >
        <ChevronLeft aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => step(1)}
        aria-label={labels.next}
        className={cn(control, "absolute inset-y-0 right-3 my-auto sm:right-6")}
      >
        <ChevronRight aria-hidden />
      </button>

      <button
        type="button"
        onClick={() => setPlaying((value) => !value)}
        aria-label={playing ? labels.pause : labels.play}
        className={cn(control, "absolute inset-x-0 bottom-6 mx-auto sm:bottom-8")}
      >
        {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
      </button>
    </div>
  );
}
