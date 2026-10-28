"use client";

import Image, { type StaticImageData } from "next/image";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import type { DishKind } from "@/features/content/dishes";
import { cn } from "@/lib/utils";

export type DishCard = {
  key: string;
  kind: DishKind;
  name: { text: string; lang?: string };
  /** The name in the other language, shown smaller (e.g. ሽሮ beside Shiro). */
  otherName: { text: string; lang: string } | null;
  description: { text: string; lang?: string };
  image: { src: StaticImageData; alt: string; lang?: string };
};

type Filter = "all" | DishKind;

type DishGridProps = {
  dishes: DishCard[];
  labels: { filter: string; all: string; fasting: string; nonFasting: string; showing: string[] };
};

const IMAGE_SIZES = "(min-width: 64rem) 18rem, (min-width: 40rem) 45vw, 92vw";

/**
 * The dishes as photo cards, with a fasting / non-fasting filter. The filter is
 * a group of toggle buttons; the number of dishes shown is announced politely.
 * `labels.showing` holds the pre-formatted "n dishes shown" text for n = 0…count.
 */
export function DishGrid({ dishes, labels }: DishGridProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = filter === "all" ? dishes : dishes.filter((dish) => dish.kind === filter);
  const options: { value: Filter; label: string }[] = [
    { value: "all", label: labels.all },
    { value: "fasting", label: labels.fasting },
    { value: "non-fasting", label: labels.nonFasting },
  ];

  return (
    <div className="mt-8">
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

      <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {shown.map((dish) => (
          <li
            key={dish.key}
            className="group flex flex-col overflow-hidden rounded-2xl border border-border glass"
          >
            <div className="relative aspect-[4/3] overflow-hidden bg-surface-muted">
              <Image
                src={dish.image.src}
                alt={dish.image.alt}
                lang={dish.image.lang}
                fill
                sizes={IMAGE_SIZES}
                className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04] motion-reduce:transition-none"
              />
              <span
                className={cn(
                  "absolute top-3 left-3 rounded-full tint-chip px-2.5 py-0.5 text-xs font-semibold shadow-xs",
                  dish.kind === "fasting" ? "hue-green" : "hue-amber",
                )}
              >
                {dish.kind === "fasting" ? labels.fasting : labels.nonFasting}
              </span>
            </div>
            <div className="flex flex-1 flex-col p-5">
              <h3 className="flex flex-wrap items-baseline gap-x-2 text-lg font-semibold">
                <span lang={dish.name.lang}>{dish.name.text}</span>
                {dish.otherName && (
                  <span lang={dish.otherName.lang} className="text-sm font-normal text-muted-foreground">
                    {dish.otherName.text}
                  </span>
                )}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground" lang={dish.description.lang}>
                {dish.description.text}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
