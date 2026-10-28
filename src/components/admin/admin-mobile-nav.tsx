"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AdminSidebar, type AdminSidebarProps } from "./admin-sidebar";

type AdminMobileNavProps = Omit<AdminSidebarProps, "onNavigate" | "collapsible"> & {
  openLabel: string;
  closeLabel: string;
  title: string;
};

/** Below lg the sidebar opens as a glass sheet from the menu button. */
export function AdminMobileNav({ openLabel, closeLabel, title, ...sidebarProps }: AdminMobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="tint" size="icon" className="hue-amber lg:hidden" aria-label={openLabel}>
          <Menu aria-hidden className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        closeLabel={closeLabel}
        aria-describedby={undefined}
        className="gap-5 px-0 pb-0"
      >
        <SheetTitle className="px-6 pt-2 text-sm font-semibold">{title}</SheetTitle>
        <AdminSidebar {...sidebarProps} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
