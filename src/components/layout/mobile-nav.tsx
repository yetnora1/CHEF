"use client";

import { ChevronRight, Menu } from "lucide-react";
import type { ComponentProps } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { LocaleSwitcher } from "./locale-switcher";
import { NavLink } from "./nav-link";

export type NavItem = { key: string; href: ComponentProps<typeof Link>["href"]; label: string };

type MobileNavProps = {
  links: NavItem[];
  labels: { open: string; close: string; title: string };
};

export function MobileNav({ links, labels }: MobileNavProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="tint" size="icon" className="hue-dark-green lg:hidden" aria-label={labels.open}>
          <Menu aria-hidden className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent closeLabel={labels.close} aria-describedby={undefined}>
        <SheetTitle className="pt-2 eyebrow text-muted-foreground">{labels.title}</SheetTitle>
        <nav aria-label={labels.title}>
          {/* Each link is a clear glass button that fills in on hover; the current page is filled and ringed. */}
          <ul className="flex flex-col gap-2">
            {links.map((link) => (
              <li key={link.key}>
                <SheetClose asChild>
                  <NavLink
                    href={link.href}
                    className={cn(
                      buttonVariants({ variant: "outline", size: "lg" }),
                      "w-full justify-between rounded-xl bg-glass px-5 text-lg hover:bg-glass-raised",
                      "aria-[current]:border-border-strong aria-[current]:bg-glass-raised aria-[current]:ring-2 aria-[current]:ring-foreground/10",
                    )}
                  >
                    {link.label}
                    <ChevronRight
                      aria-hidden
                      className="text-muted-foreground group-hover/button:translate-x-0.5 group-hover/button:text-foreground"
                    />
                  </NavLink>
                </SheetClose>
              </li>
            ))}
          </ul>
        </nav>
        {/* The header shows these only from lg, where this menu is hidden. */}
        <div className="flex items-center gap-2">
          <LocaleSwitcher hue="hue-dark-green" />
          <ThemeToggle hue="hue-dark-green" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
