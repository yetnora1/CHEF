"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { isTheme, THEME_STORAGE_KEY, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const CHANGE_EVENT = "chief-harena:theme-change";

/** The applied theme: whatever ThemeScript set before paint, else light. */
function readTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function setTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage unavailable (private mode): the choice still applies to this page.
  }
  document.documentElement.setAttribute("data-theme", theme);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    // Another tab switched the theme: mirror it here.
    document.documentElement.setAttribute("data-theme", isTheme(event.newValue) ? event.newValue : "light");
    onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** One button: each click switches between the light and dark theme. */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations("Theme");
  // null during server rendering and hydration: the applied theme is unknown there.
  const theme = useSyncExternalStore(subscribe, readTheme, () => null);

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("text-current", className)}
      aria-label={t("dark")}
      aria-pressed={theme ? theme === "dark" : undefined}
      onClick={() => setTheme(readTheme() === "dark" ? "light" : "dark")}
    >
      {/* The visible icon tracks the applied theme via CSS, so it is right before hydration. */}
      <Sun aria-hidden className="size-[1.15rem] dark:hidden" />
      <Moon aria-hidden className="hidden size-[1.15rem] dark:block" />
    </Button>
  );
}
