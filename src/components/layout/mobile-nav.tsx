"use client";

import { Menu } from "lucide-react";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./locale-switcher";

export type NavLink = { key: string; href: ComponentProps<typeof Link>["href"]; label: string };

type MobileNavProps = {
  links: NavLink[];
  labels: { open: string; close: string; title: string };
};

export function MobileNav({ links, labels }: MobileNavProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label={labels.open}>
          <Menu aria-hidden className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent closeLabel={labels.close} aria-describedby={undefined}>
        <SheetTitle className="pt-2 eyebrow text-muted-foreground">{labels.title}</SheetTitle>
        <nav aria-label={labels.title}>
          <ul className="flex flex-col">
            {links.map((link) => (
              <li key={link.key} className="border-b border-border">
                <SheetClose asChild>
                  <Link
                    href={link.href}
                    className="block py-4 display-md transition-colors hover:text-accent-ink"
                  >
                    {link.label}
                  </Link>
                </SheetClose>
              </li>
            ))}
          </ul>
        </nav>
        <LocaleSwitcher className="self-start" />
      </SheetContent>
    </Sheet>
  );
}
