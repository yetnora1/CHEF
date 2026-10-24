"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_MODULE_ICONS } from "@/features/admin/module-icons";
import type { AdminModuleKey } from "@/features/admin/modules";
import { cn } from "@/lib/utils";

export type AdminNavItem = {
  key: AdminModuleKey;
  href: string;
  label: string;
  status: "available" | "planned";
};

type AdminNavProps = {
  label: string;
  sections: { heading: string; items: AdminNavItem[] }[];
  plannedLabel: string;
  onNavigate?: () => void;
};

export function AdminNav({ label, sections, plannedLabel, onNavigate }: AdminNavProps) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="flex flex-col gap-7">
      {sections
        .filter((section) => section.items.length > 0)
        .map((section) => (
          <div key={section.heading}>
            <p className="px-3 text-[0.7rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase [&:lang(am)]:text-xs [&:lang(am)]:tracking-normal">
              {section.heading}
            </p>
            <ul className="mt-2 space-y-0.5">
              {section.items.map((item) => {
                const Icon = ADMIN_MODULE_ICONS[item.key];
                const base = "flex items-center gap-3 rounded-lg px-3 py-2 text-sm";

                if (item.status === "planned") {
                  return (
                    <li key={item.key}>
                      <span aria-disabled="true" className={cn(base, "text-muted-foreground/80")}>
                        <Icon aria-hidden className="size-4 shrink-0" />
                        <span className="flex-1 truncate">{item.label}</span>
                        <span className="rounded-full border border-border px-1.5 py-0.5 text-[0.65rem] font-semibold">
                          {plannedLabel}
                        </span>
                      </span>
                    </li>
                  );
                }

                const active = pathname === item.href;
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        base,
                        "font-medium transition-colors",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground hover:bg-surface-muted",
                      )}
                    >
                      <Icon aria-hidden className="size-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
    </nav>
  );
}
