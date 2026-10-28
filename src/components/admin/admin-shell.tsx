import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { modulesFor } from "@/features/admin/modules";
import type { SignedInStaffSession } from "@/lib/auth/access";
import { AdminLocaleSwitcher } from "./admin-locale-switcher";
import { AdminMobileNav } from "./admin-mobile-nav";
import type { AdminNavItem } from "./admin-nav";
import { AdminSidebar, type AdminSidebarProps } from "./admin-sidebar";
import { SidebarToggle } from "./sidebar-toggle";
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
  const roleLabels = session.roles.map((role) => tRoles(role));

  const sidebarProps: AdminSidebarProps = {
    label: t("navigationLabel"),
    plannedLabel: t("plannedBadge"),
    sections: [
      { heading: t("mainMenu"), items: items.filter((item) => item.status === "available") },
      { heading: t("plannedModules"), items: items.filter((item) => item.status === "planned") },
    ],
    email: session.user.email,
    roleLabels,
    labels: {
      signedInAs: t("signedInAs"),
      noRoles: t("noRoles"),
      viewSite: t("viewSite"),
      opensInNewTab: t("opensInNewTab"),
      signOut: tAuth("signOut"),
    },
  };

  // In the sidebar the name gives way to the logo alone while it is collapsed.
  const brand = (railHidden?: string) => (
    <span className="inline-flex items-center gap-2.5 text-sm font-semibold whitespace-nowrap">
      <Logo className="size-8 shrink-0" />
      <span className={railHidden}>
        <span lang="en">Chef Harena</span>
        <span className="block text-xs font-medium text-muted-foreground">{t("appName")}</span>
      </span>
    </span>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:transition-[grid-template-columns] lg:duration-260 lg:ease-out sidebar-collapsed:lg:grid-cols-[5.5rem_minmax(0,1fr)]">
      {/* A floating glass panel; the round button on its edge folds it to an icon rail. */}
      <aside className="sticky top-0 hidden h-dvh p-3 lg:block">
        <div className="relative flex h-full flex-col rounded-2xl border border-border glass">
          <div className="flex h-16 shrink-0 items-center overflow-hidden px-5 sidebar-collapsed:justify-center sidebar-collapsed:px-0">
            {brand("sidebar-collapsed:sr-only")}
          </div>
          <SidebarToggle label={t("collapseSidebar")} className="absolute top-[1.15rem] -right-3.5 z-10" />
          <AdminSidebar {...sidebarProps} collapsible />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col px-3 sm:px-4 lg:pr-3 lg:pl-0">
        <header className="sticky top-0 z-30 pt-3">
          <div className="flex h-14 items-center gap-2 rounded-2xl border border-border glass-thick px-2.5 sm:px-3">
            <AdminMobileNav
              {...sidebarProps}
              openLabel={t("openNavigation")}
              closeLabel={t("closeNavigation")}
              title={t("navigationLabel")}
            />
            <div className="lg:hidden">{brand()}</div>
            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              <AdminLocaleSwitcher className="hidden sm:inline-flex" />
              <ThemeToggle />
              <UserMenu
                email={session.user.email}
                roleLabels={roleLabels}
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
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="flex-1 px-1 py-8 outline-none lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
