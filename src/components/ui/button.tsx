import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// Solid and outlined buttons rise a pixel and gain a shadow on hover, and settle when pressed.
const lift =
  "shadow-xs hover:shadow-md active:shadow-xs motion-safe:hover:-translate-y-px motion-safe:active:translate-y-0";

export const buttonVariants = cva(
  // `group/button` lets an icon inside react to hover, e.g. an arrow that nudges forward.
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap transition-[color,background-color,border-color,box-shadow,translate] duration-200 ease-out select-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-55 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:transition-transform [&_svg]:duration-200",
  {
    variants: {
      variant: {
        primary: cn("bg-primary text-primary-foreground hover:bg-primary-hover", lift),
        outline: cn(
          "border border-border-strong bg-surface text-foreground hover:border-foreground hover:bg-surface-muted",
          lift,
        ),
        ghost: "text-foreground hover:bg-surface-muted active:bg-border/60",
        // For use on the deep brand band.
        band: cn(
          "bg-band-accent text-coffee-charcoal hover:bg-[color-mix(in_oklab,var(--band-accent)_85%,white)]",
          lift,
        ),
        "band-outline": cn(
          "border border-band-muted/60 text-band-foreground hover:border-band-foreground hover:bg-white/8",
          lift,
        ),
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-6 text-sm",
        lg: "h-13 px-7 text-base",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot.Root : "button";
  return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
