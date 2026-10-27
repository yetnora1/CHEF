import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/*
 * Every button is shaded the same way: a soft top-to-bottom gradient (tokens in
 * globals.css) with a hairline of light on its top edge. On hover it brightens,
 * rises a pixel and its shadow deepens; pressed, it flattens and settles.
 *
 * Solid colours follow the button's role, so a colour always means the same thing:
 *   primary  – book or contact, the visitor's main action (spice orange)
 *   action   – save, create, upload, sign in (royal blue)
 *   positive – publish or mark done (saffron gold)
 *   danger   – a confirmed delete, archive or decline (berbere red)
 *   neutral  – utilities such as Apply or Search, and the default (black / white)
 * Secondary choices are `outline`; header controls (icon toggles, menus) are `soft`;
 * quiet ones (Clear, close) are `ghost`.
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
          "bg-cta-bottom from-cta-top to-cta-bottom text-cta-foreground hover:from-cta-hover-top hover:to-cta-hover-bottom active:from-cta-bottom",
          shine,
          lift,
        ),
        action: cn(
          "bg-action-bottom from-action-top to-action-bottom text-action-foreground hover:from-action-hover-top hover:to-action-hover-bottom active:from-action-bottom",
          shine,
          lift,
        ),
        positive: cn(
          "bg-positive-bottom from-positive-top to-positive-bottom text-positive-foreground hover:from-positive-hover-top hover:to-positive-hover-bottom active:from-positive-bottom",
          shine,
          lift,
        ),
        danger: cn(
          "bg-destructive-bottom from-destructive-top to-destructive-bottom text-destructive-foreground hover:from-destructive-hover-top hover:to-destructive-hover-bottom active:from-destructive-bottom",
          shine,
          lift,
        ),
        neutral: cn(
          "bg-primary from-primary-top to-primary-bottom text-primary-foreground hover:from-primary-hover-top hover:to-primary-hover-bottom active:from-primary-bottom",
          shine,
          lift,
        ),
        outline: cn(
          "border border-border-strong bg-surface from-control-top to-control-bottom text-foreground hover:border-foreground active:from-control-bottom",
          shine,
          lift,
        ),
        // A lighter outline for header controls (icon toggles, menus): shaded face, soft border.
        soft: cn(
          "border border-border bg-surface from-control-top to-control-bottom text-foreground hover:border-border-strong active:from-control-bottom",
          shine,
          lift,
        ),
        // Flat until hovered, then it takes the outline button's face.
        ghost:
          "from-transparent to-transparent text-foreground hover:from-control-top hover:to-control-bottom hover:shadow-xs hover:ring-1 hover:ring-border active:from-control-bottom active:shadow-none",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-6 text-sm",
        lg: "h-13 px-7 text-base",
        icon: "size-10",
      },
    },
    defaultVariants: {
      // Unassigned buttons stay neutral; a colour is chosen for its role.
      variant: "neutral",
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
