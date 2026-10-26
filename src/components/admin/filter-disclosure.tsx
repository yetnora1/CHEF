"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * On phones, list filters sit behind a toggle so the results come first; it
 * starts open while any filter is active. From the `sm` breakpoint up the
 * filters are always shown and the toggle is hidden.
 */
export function FilterDisclosure({
  label,
  activeLabel,
  activeCount,
  children,
}: {
  label: string;
  /** Formatted "n active" text, shown only when filters are active. */
  activeLabel: string;
  activeCount: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(activeCount > 0);
  const id = useId();

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="sm:hidden"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        <SlidersHorizontal aria-hidden />
        {label}
        {activeCount > 0 && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
            {activeLabel}
          </span>
        )}
        <ChevronDown aria-hidden className={cn("transition-transform", open && "rotate-180")} />
      </Button>
      <div id={id} className={cn(!open && "max-sm:hidden")}>
        {children}
      </div>
    </div>
  );
}
