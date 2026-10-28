"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_MODULE_ICONS } from "@/features/admin/module-icons";
import { isModuleActive, type AdminModuleKey } from "@/features/admin/modules";
import { cn } from "@/lib/utils";
import { useSidebarCollapsed } from "./sidebar-toggle";

export type AdminNavItem = {
  key: AdminModuleKey;
  href: string;
  label: string;
  status: "available" | "planned";
};

export type AdminNavProps = {
  label: string;
  sections: { heading: string; items: AdminNavItem[] }[];
  plannedLabel: string;
  onNavigate?: () => void;
  /** In the desktop sidebar: labels give way to icons while it is collapsed. */
  collapsible?: boolean;
};

/** A sidebar row (icon and label). The current one is raised glass with a light rim. */
export function sidebarItemClassName({ active = false, collapsible = false } = {}) {
  return cn(
    "flex h-10 w-full items-center gap-3 rounded-xl border px-3 text-sm font-medium transition-[background-color,border-color,color,box-shadow] duration-200 disabled:opacity-55",
    active
      ? "border-border bg-glass-raised text-foreground shadow-xs inset-shadow-glass"
      : "border-transparent text-foreground/80 hover:bg-surface-muted hover:text-foreground",
    collapsible && "sidebar-collapsed:justify-center sidebar-collapsed:px-0",
  );
}

export function AdminNav({ label, sections, plannedLabel, onNavigate, collapsible = false }: AdminNavProps) {
  const pathname = usePathname();
  // Collapsed, only icons show: name each row in a tooltip; screen readers keep the label.
  const rail = useSidebarCollapsed() === true && collapsible;
  const railHidden = collapsible ? "sidebar-collapsed:sr-only" : undefined;

  return (
    <nav aria-label={label} className="flex flex-col gap-5">
      {sections
        .filter((section) => section.items.length > 0)
        .map((section) => (
          <div key={section.heading} className="[&+&]:border-t [&+&]:border-border [&+&]:pt-5">
            <p
              className={cn(
                "px-3 text-[0.7rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase [&:lang(am)]:text-xs [&:lang(am)]:tracking-normal",
                railHidden,
              )}
            >
              {section.heading}
            </p>
            <ul className={cn("mt-2 space-y-1", collapsible && "sidebar-collapsed:mt-0")}>
              {section.items.map((item) => {
                const Icon = ADMIN_MODULE_ICONS[item.key];

                if (item.status === "planned") {
                  return (
                    <li key={item.key}>
                      <span
                        aria-disabled="true"
                        title={rail ? `${item.label} (${plannedLabel})` : undefined}
                        className={cn(
                          sidebarItemClassName({ collapsible }),
                          "text-muted-foreground/80 hover:bg-transparent hover:text-muted-foreground/80",
                        )}
                      >
                        <Icon aria-hidden className="size-4 shrink-0" />
                        <span className={cn("flex-1 truncate", railHidden)}>{item.label}</span>
                        <span
                          className={cn(
                            "rounded-full border border-border px-1.5 py-0.5 text-[0.65rem] font-semibold",
                            railHidden,
                          )}
                        >
                          {plannedLabel}
                        </span>
                      </span>
                    </li>
                  );
                }

                // "page" on the module's own list; "true" (current section) on pages below it.
                const current =
                  pathname === item.href ? "page" : isModuleActive(pathname, item.href) ? "true" : undefined;
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={current}
                      title={rail ? item.label : undefined}
                      className={sidebarItemClassName({ active: current !== undefined, collapsible })}
                    >
                      <Icon aria-hidden className="size-4 shrink-0" />
                      <span className={cn("truncate", railHidden)}>{item.label}</span>
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
