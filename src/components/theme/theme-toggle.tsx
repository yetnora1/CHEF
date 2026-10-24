"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isExplicitTheme, THEME_PREFERENCES, THEME_STORAGE_KEY, type ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";

const CHANGE_EVENT = "chief-harena:theme-change";

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isExplicitTheme(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

function applyToDocument(preference: ThemePreference) {
  const root = document.documentElement;
  if (preference === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", preference);
}

function setPreference(preference: ThemePreference) {
  try {
    if (preference === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage unavailable (private mode): the choice still applies to this page.
  }
  applyToDocument(preference);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    // Another tab changed the theme: mirror it here.
    applyToDocument(readPreference());
    onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations("Theme");
  // null during server rendering and hydration: the stored choice is unknown there.
  const preference = useSyncExternalStore(subscribe, readPreference, () => null);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("text-current", className)}
          aria-label={preference ? t("trigger", { theme: t(preference) }) : t("label")}
        >
          {/* The visible icon tracks the applied theme via CSS, so it is right before hydration. */}
          <Sun aria-hidden className="size-[1.15rem] dark:hidden" />
          <Moon aria-hidden className="hidden size-[1.15rem] dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("label")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={preference ?? undefined}
          onValueChange={(value) => {
            if ((THEME_PREFERENCES as readonly string[]).includes(value)) {
              setPreference(value as ThemePreference);
            }
          }}
        >
          <DropdownMenuRadioItem value="light">
            <Sun aria-hidden />
            {t("light")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon aria-hidden />
            {t("dark")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor aria-hidden />
            {t("system")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
