"use client";

import { Maximize2 } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import type { ChefPhotoKind, GalleryPhoto } from "@/features/content/chef-photos";
import { cn } from "@/lib/utils";
import { PhotoViewer, type PhotoViewerLabels } from "./photo-viewer";

export type PhotoTileLabels = PhotoViewerLabels & {
  /** Prefixes each photo's description on its tile: "View larger: …". */
  open: string;
};

type TileProps = {
  photo: GalleryPhoto;
  label: string;
  sizes: string;
  /** Fill a tile of fixed shape (the mosaic) rather than keep the photo's own shape (the gallery). */
  fill?: boolean;
  onOpen: () => void;
};

/** A photo as a button that opens the viewer; it zooms slightly and shows an expand mark on hover. */
function Tile({ photo, label, sizes, fill, onOpen }: TileProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group/photo relative block w-full cursor-pointer overflow-hidden rounded-2xl bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring",
        fill && "h-full",
      )}
    >
      <span className="sr-only">{label}: </span>
      <Image
        src={photo.src}
        alt={photo.alt}
        lang={photo.lang}
        sizes={sizes}
        placeholder="blur"
        fill={fill}
        className={cn(
          "transition-transform duration-500 ease-out motion-safe:group-hover/photo:scale-[1.04]",
          fill ? "object-cover" : "block h-auto w-full",
        )}
      />
      <span
        aria-hidden
        className="absolute right-2.5 bottom-2.5 flex size-8 items-center justify-center rounded-full border border-stage-foreground/25 bg-stage/40 text-stage-foreground opacity-0 backdrop-blur-md transition-opacity duration-200 group-hover/photo:opacity-100 group-focus-visible/photo:opacity-100 [@media(hover:none)]:opacity-100"
      >
        <Maximize2 className="size-4" />
      </span>
    </button>
  );
}

// Mosaic tiles by position: a large one, a tall one, then single cells. With
// grid-flow-dense the eight photos fill whole rows at two, three and four columns.
const MOSAIC_TILES = ["col-span-2 row-span-2", "row-span-2"];
const MOSAIC_SIZES = [
  "(min-width: 80rem) 38rem, (min-width: 48rem) 64vw, 92vw",
  "(min-width: 80rem) 19rem, (min-width: 48rem) 32vw, 46vw",
];

/** The homepage's photos as a mosaic of tiles; any tile opens the viewer. */
export function PhotoMosaic({ photos, labels }: { photos: GalleryPhoto[]; labels: PhotoTileLabels }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <>
      <ul className="mt-10 grid grid-flow-dense auto-rows-[8.5rem] grid-cols-2 gap-3 sm:auto-rows-[11rem] sm:gap-4 md:grid-cols-3 lg:auto-rows-[12.5rem] lg:grid-cols-4">
        {photos.map((photo, index) => (
          <li key={photo.key} className={MOSAIC_TILES[index]}>
            <Tile
              photo={photo}
              label={labels.open}
              sizes={MOSAIC_SIZES[index === 0 ? 0 : 1]}
              fill
              onOpen={() => setOpen(index)}
            />
          </li>
        ))}
      </ul>
      <PhotoViewer photos={photos} index={open} onIndexChange={setOpen} labels={labels} />
    </>
  );
}

type Filter = "all" | ChefPhotoKind;

type PhotoGalleryProps = {
  photos: GalleryPhoto[];
  labels: PhotoTileLabels & {
    filter: string;
    all: string;
    event: string;
    dish: string;
    /** The pre-formatted "n photos shown" text for n = 0…count. */
    showing: string[];
  };
};

/**
 * Every photo in masonry columns, each in its own shape, with an events /
 * dishes filter (toggle buttons, like the dishes section's). The viewer steps
 * through the photos shown.
 */
export function PhotoGallery({ photos, labels }: PhotoGalleryProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<number | null>(null);
  const shown = filter === "all" ? photos : photos.filter((photo) => photo.kind === filter);
  const options: { value: Filter; label: string }[] = [
    { value: "all", label: labels.all },
    { value: "event", label: labels.event },
    { value: "dish", label: labels.dish },
  ];

  return (
    <div className="mt-10">
      <div role="group" aria-label={labels.filter} className="flex gap-2 sm:inline-flex">
        {options.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={cn(
              buttonVariants({ variant: filter === value ? "neutral" : "outline", size: "sm" }),
              "flex-1 sm:flex-none",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <p role="status" className="sr-only">
        {labels.showing[shown.length]}
      </p>

      <ul className="mt-6 columns-2 gap-3 sm:gap-4 md:columns-3 lg:columns-4">
        {shown.map((photo, index) => (
          <li key={photo.key} className="mb-3 break-inside-avoid sm:mb-4">
            <Tile
              photo={photo}
              label={labels.open}
              sizes="(min-width: 80rem) 19rem, (min-width: 64rem) 24vw, (min-width: 48rem) 32vw, 48vw"
              onOpen={() => setOpen(index)}
            />
          </li>
        ))}
      </ul>
      <PhotoViewer photos={shown} index={open} onIndexChange={setOpen} labels={labels} />
    </div>
  );
}
