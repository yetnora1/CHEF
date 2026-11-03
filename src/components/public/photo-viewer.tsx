"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Image from "next/image";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useRef } from "react";
import { buttonVariants } from "@/components/ui/button";
import type { GalleryPhoto } from "@/features/content/chef-photos";
import { cn } from "@/lib/utils";

export type PhotoViewerLabels = {
  close: string;
  previous: string;
  next: string;
};

type PhotoViewerProps = {
  photos: GalleryPhoto[];
  /** The photo on screen; null while the viewer is closed. */
  index: number | null;
  onIndexChange: (index: number | null) => void;
  labels: PhotoViewerLabels;
};

const control = cn(
  buttonVariants({ variant: "outline", size: "icon" }),
  "size-11 rounded-full [&_svg]:size-5",
);
// A horizontal swipe of at least this many pixels moves to the next or previous photo.
const SWIPE = 50;
// The photos are phone pictures (≤1280px): shown at up to 1.5 times their size, so a
// small one is not blown up to fill a large screen, and always clear of the controls.
const MAX_SCALE = 1.5;
const RESERVED_HEIGHT = "9rem";

/**
 * One photo at a time on a dark stage that fills the window. Previous and next
 * buttons, the arrow keys and a swipe move between photos; the close button or
 * Escape closes it. Radix Dialog traps focus and returns it to the tile. The
 * stage is dark whatever the theme, like the video viewer's.
 */
export function PhotoViewer({ photos, index, onIndexChange, labels }: PhotoViewerProps) {
  const photo = index === null ? null : photos[index];
  // The tile that opened the viewer gets focus back (Radix would look for a Dialog.Trigger).
  const opener = useRef<HTMLElement | null>(null);
  const swipeFrom = useRef<{ x: number; y: number } | null>(null);

  const step = (direction: 1 | -1) => {
    if (index !== null) onIndexChange((index + direction + photos.length) % photos.length);
  };

  return (
    <DialogPrimitive.Root open={photo !== null} onOpenChange={(open) => !open && onIndexChange(null)}>
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
            if (Math.abs(dx) >= SWIPE && Math.abs(dx) > Math.abs(event.clientY - from.y))
              step(dx < 0 ? 1 : -1);
          }}
          data-theme="dark"
          className="fixed inset-0 z-50 flex items-center justify-center text-foreground [color-scheme:dark] outline-none"
        >
          {photo && index !== null && (
            <>
              <DialogPrimitive.Title className="sr-only" lang={photo.lang}>
                {photo.alt}
              </DialogPrimitive.Title>

              <Image
                key={photo.key}
                src={photo.src}
                alt=""
                sizes="100vw"
                draggable={false}
                // As wide as fits: the size cap, the window width, or the height left by the controls.
                style={{
                  width: `min(${Math.round(photo.src.width * MAX_SCALE)}px, calc(100vw - 2rem), calc((100dvh - ${RESERVED_HEIGHT}) * ${photo.src.width / photo.src.height}))`,
                }}
                className="h-auto rounded-2xl shadow-2xl ring-1 ring-stage-foreground/10 select-none motion-safe:animate-fade-in"
              />

              {/* Top bar: position and close, over a soft shade so they read on any photo. */}
              <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-linear-to-b from-stage/70 to-transparent p-4 sm:p-6">
                <p aria-live="polite" className="text-sm font-semibold text-stage-foreground tabular-nums">
                  {`${index + 1} / ${photos.length}`}
                </p>
                <DialogPrimitive.Close aria-label={labels.close} className={control}>
                  <X aria-hidden />
                </DialogPrimitive.Close>
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
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
