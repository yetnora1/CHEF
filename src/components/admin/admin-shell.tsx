import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { modulesFor } from "@/features/admin/modules";
import type { SignedInStaffSession } from "@/lib/auth/access";
import { AdminLocaleSwitcher } from "./admin-locale-switcher";
import { AdminMobileNav } from "./admin-mobile-nav";
import { AdminNav, type AdminNavItem } from "./admin-nav";
import { UserMenu } from "./user-menu";

export async function AdminShell({
  session,
  children,
}: {
  session: SignedInStaffSession;
  children: ReactNode;
}) {
  const t = await getTranslations("Admin");
  const tAuth = await getTranslations("Auth");
  const tRoles = await getTranslations("Roles");

  const items: AdminNavItem[] = modulesFor(session.permissions).map((module) => ({
    key: module.key,
    href: module.href,
    label: t(`modules.${module.key}`),
    status: module.status,
  }));

  const navProps = {
    label: t("navigationLabel"),
    plannedLabel: t("plannedBadge"),
    sections: [
      { heading: t("mainMenu"), items: items.filter((item) => item.status === "available") },
      { heading: t("plannedModules"), items: items.filter((item) => item.status === "planned") },
    ],
  };

  const brand = (
    <span className="inline-flex items-center gap-2.5 text-sm font-semibold">
      <Logo className="size-8" />
      <span>
        <span lang="en">Chef Harena</span>
        <span className="block text-xs font-medium text-muted-foreground">{t("appName")}</span>
      </span>
    </span>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-8 overflow-y-auto border-r border-border bg-surface px-4 py-6 lg:flex">
        <div className="px-3">{brand}</div>
        <AdminNav {...navProps} />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-background/95 px-4 sm:px-6 lg:px-10">
          <AdminMobileNav
            {...navProps}
            openLabel={t("openNavigation")}
            closeLabel={t("closeNavigation")}
            title={t("navigationLabel")}
          />
          <div className="lg:hidden">{brand}</div>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <AdminLocaleSwitcher className="hidden sm:inline-flex" />
            <ThemeToggle />
            <UserMenu
              email={session.user.email}
              roleLabels={session.roles.map((role) => tRoles(role))}
              labels={{
                menu: t("userMenu"),
                signedInAs: t("signedInAs"),
                yourRoles: t("yourRoles"),
                noRoles: t("noRoles"),
                viewSite: t("viewSite"),
                opensInNewTab: t("opensInNewTab"),
                signOut: tAuth("signOut"),
              }}
            />
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 px-4 py-8 outline-none sm:px-6 lg:px-10 lg:py-12"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
