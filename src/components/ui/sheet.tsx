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

/** A modal side panel built on Radix Dialog (focus trap, Escape, scroll lock). */
export function SheetContent({
  className,
  children,
  side = "right",
  closeLabel,
  ...props
}: SheetContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-coffee-charcoal/55 data-[state=open]:animate-fade-in" />
      <DialogPrimitive.Content
        className={cn(
          "fixed inset-y-0 z-50 flex w-[min(22rem,88vw)] flex-col gap-6 overflow-y-auto bg-background p-6 text-foreground shadow-2xl outline-none",
          side === "right"
            ? "right-0 border-l border-border data-[state=open]:animate-slide-in-right"
            : "left-0 border-r border-border data-[state=open]:animate-slide-in-left",
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
