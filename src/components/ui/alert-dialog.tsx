"use client";

import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

type ContentProps = ComponentProps<typeof AlertDialogPrimitive.Content> & {
  title: ReactNode;
  description: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  onConfirm: () => void;
  tone?: "default" | "danger";
};

/** Confirmation dialog for consequential actions (focus-trapped; Escape cancels). */
export function AlertDialogContent({
  title,
  description,
  cancelLabel,
  confirmLabel,
  onConfirm,
  tone = "default",
  className,
  ...props
}: ContentProps) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-coffee-charcoal/55 data-[state=open]:animate-fade-in" />
      <AlertDialogPrimitive.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-2xl border border-border bg-surface p-6 text-surface-foreground shadow-2xl data-[state=open]:animate-fade-in",
          className,
        )}
        {...props}
      >
        <AlertDialogPrimitive.Title className="display-md">{title}</AlertDialogPrimitive.Title>
        <AlertDialogPrimitive.Description className="text-sm text-muted-foreground">
          {description}
        </AlertDialogPrimitive.Description>
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <AlertDialogPrimitive.Cancel className={buttonVariants({ variant: "outline" })}>
            {cancelLabel}
          </AlertDialogPrimitive.Cancel>
          <AlertDialogPrimitive.Action
            onClick={onConfirm}
            className={buttonVariants({ variant: tone === "danger" ? "danger" : "action" })}
          >
            {confirmLabel}
          </AlertDialogPrimitive.Action>
        </div>
      </AlertDialogPrimitive.Content>
    </AlertDialogPrimitive.Portal>
  );
}
