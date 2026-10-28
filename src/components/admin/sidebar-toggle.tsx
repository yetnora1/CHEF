"use client";

import { ChevronLeft } from "lucide-react";
import { useSyncExternalStore } from "react";
import { buttonVariants } from "@/components/ui/button";
import { SIDEBAR_COLLAPSED, SIDEBAR_STORAGE_KEY } from "@/lib/sidebar";
import { cn } from "@/lib/utils";

const CHANGE_EVENT = "chef-harena:sidebar-change";

/** Collapsed when SIDEBAR_INIT_SCRIPT or the toggle set data-sidebar on <html>. */
function readCollapsed(): boolean {
  return document.documentElement.getAttribute("data-sidebar") === SIDEBAR_COLLAPSED;
}

function setCollapsed(collapsed: boolean) {
  try {
    if (collapsed) localStorage.setItem(SIDEBAR_STORAGE_KEY, SIDEBAR_COLLAPSED);
    else localStorage.removeItem(SIDEBAR_STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode): the choice still applies to this page.
  }
  if (collapsed) document.documentElement.setAttribute("data-sidebar", SIDEBAR_COLLAPSED);
  else document.documentElement.removeAttribute("data-sidebar");
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

/** Whether the desktop sidebar is an icon rail; null while rendering on the server and hydrating. */
export function useSidebarCollapsed(): boolean | null {
  return useSyncExternalStore(subscribe, readCollapsed, () => null);
}

/**
 * The round button on the sidebar's edge: each click folds the sidebar to an
 * icon rail or opens it again (a toggle button, `aria-pressed` = collapsed),
 * remembered per browser.
 */
export function SidebarToggle({ label, className }: { label: string; className?: string }) {
  const collapsed = useSidebarCollapsed();

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={collapsed ?? undefined}
      onClick={() => setCollapsed(!readCollapsed())}
      className={cn(
        buttonVariants({ variant: "outline", size: "icon" }),
        // 28px to the eye; the ::after widens the hit area to 40px.
        "size-7 rounded-full after:absolute after:-inset-1.5",
        className,
      )}
    >
      {/* Points the way the sidebar will move; CSS flips it before hydration. */}
      <ChevronLeft aria-hidden className="sidebar-collapsed:rotate-180" />
    </button>
  );
}
