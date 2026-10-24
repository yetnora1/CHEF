import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Emblem } from "@/components/brand/emblem";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { AdminLocaleSwitcher } from "./admin-locale-switcher";

/** Centered single-card layout for sign-in, access-denied and setup notices. */
export async function AuthShell({ children }: { children: ReactNode }) {
  const t = await getTranslations("Admin");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <span className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <Emblem className="size-8" />
          <span>
            <span lang="en">Chief Harena</span>
            <span className="text-muted-foreground"> · {t("appName")}</span>
          </span>
        </span>
        <div className="flex items-center gap-2">
          <AdminLocaleSwitcher />
          <ThemeToggle />
        </div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="flex flex-1 items-start justify-center px-4 pt-8 pb-16 outline-none sm:items-center sm:pt-0"
      >
        <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-7 shadow-sm sm:p-9">
          {children}
        </div>
      </main>
      <span aria-hidden className="tilet-band text-accent/50" />
    </div>
  );
}
