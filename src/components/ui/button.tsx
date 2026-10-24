import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-colors duration-200 select-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-55 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
        outline:
          "border border-border-strong bg-transparent text-foreground hover:border-foreground hover:bg-surface-muted",
        ghost: "text-foreground hover:bg-surface-muted",
        // For use on the deep brand band.
        band: "bg-band-accent text-coffee-charcoal hover:bg-[color-mix(in_oklab,var(--band-accent)_85%,white)]",
        "band-outline":
          "border border-band-muted/60 text-band-foreground hover:border-band-foreground hover:bg-white/8",
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
