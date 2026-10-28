"use client";

import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;

type SheetContentProps = ComponentProps<typeof DialogPrimitive.Content> & {
  side?: "left" | "right";
  closeLabel: string;
};

/** A modal glass side panel floating in from an edge, built on Radix Dialog (focus trap, Escape, scroll lock). */
export function SheetContent({
  className,
  children,
  side = "right",
  closeLabel,
  ...props
}: SheetContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-coffee-charcoal/40 backdrop-blur-sm data-[state=open]:animate-fade-in" />
      <DialogPrimitive.Content
        className={cn(
          "fixed inset-y-3 z-50 flex w-[min(22rem,calc(100vw-1.5rem))] flex-col gap-6 overflow-y-auto rounded-2xl border border-border glass-thick p-6 text-foreground shadow-2xl outline-none",
          side === "right"
            ? "right-3 data-[state=open]:animate-slide-in-right"
            : "left-3 data-[state=open]:animate-slide-in-left",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon" }),
            "absolute top-5 right-5 text-muted-foreground hover:text-foreground",
          )}
          aria-label={closeLabel}
        >
          <X aria-hidden className="size-5" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
