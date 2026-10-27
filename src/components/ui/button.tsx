import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/*
 * Every button is shaded the same way: a soft top-to-bottom gradient (tokens in
 * globals.css) with a hairline of light on its top edge. On hover it brightens,
 * rises a pixel and its shadow deepens; pressed, it flattens and settles.
 */
const lift =
  "shadow-xs hover:shadow-md active:shadow-xs motion-safe:hover:-translate-y-px motion-safe:active:translate-y-0";
const shine = "inset-shadow-2xs inset-shadow-shine/12";

export const buttonVariants = cva(
  // `group/button` lets an icon inside react to hover, e.g. an arrow that nudges forward.
  // The gradient stops are animatable custom properties, so shading changes fade too.
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-linear-to-b font-semibold whitespace-nowrap transition-[color,background-color,border-color,box-shadow,translate,--tw-gradient-from,--tw-gradient-to] duration-200 ease-out select-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-55 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:transition-transform [&_svg]:duration-200",
  {
    variants: {
      variant: {
        primary: cn(
          "bg-primary from-primary-top to-primary-bottom text-primary-foreground hover:from-primary-hover-top hover:to-primary-hover-bottom active:from-primary-bottom",
          shine,
          lift,
        ),
        outline: cn(
          "border border-border-strong bg-surface from-control-top to-control-bottom text-foreground hover:border-foreground active:from-control-bottom",
          shine,
          lift,
        ),
        // Flat until hovered, then it takes the outline button's face.
        ghost:
          "from-transparent to-transparent text-foreground hover:from-control-top hover:to-control-bottom hover:shadow-xs hover:ring-1 hover:ring-border active:from-control-bottom active:shadow-none",
        // For use on the dark band.
        band: cn(
          "bg-band-accent from-shine to-band-accent text-coffee-charcoal hover:to-shine active:from-band-accent",
          lift,
        ),
        "band-outline": cn(
          "border border-band-muted/60 from-shine/8 to-transparent text-band-foreground hover:border-band-foreground hover:from-shine/16 hover:to-shine/4",
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
