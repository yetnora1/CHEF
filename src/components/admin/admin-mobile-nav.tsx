"use client";

import { Menu } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AdminNav } from "./admin-nav";

type AdminMobileNavProps = Omit<ComponentProps<typeof AdminNav>, "onNavigate"> & {
  openLabel: string;
  closeLabel: string;
  title: string;
};

export function AdminMobileNav({ openLabel, closeLabel, title, ...navProps }: AdminMobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label={openLabel}>
          <Menu aria-hidden className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" closeLabel={closeLabel} aria-describedby={undefined} className="bg-surface">
        <SheetTitle className="pt-2 text-sm font-semibold">{title}</SheetTitle>
        <AdminNav {...navProps} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
