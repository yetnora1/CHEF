import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/admin/access-denied";
import { ADMIN_MODULE_ICONS } from "@/features/admin/module-icons";
import { modulesFor } from "@/features/admin/modules";
import { authorizeAdmin } from "@/lib/auth/staff-session";

// Blocks on the session cookie by design: nothing renders before authorization.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Admin");
  return { title: t("overview.title") };
}

export default async function AdminOverviewPage() {
  const decision = await authorizeAdmin("admin.access");
  if (decision.kind === "forbidden") return <AccessDenied email={decision.session.user.email} />;

  const { session } = decision;
  const [t, tRoles] = await Promise.all([getTranslations("Admin"), getTranslations("Roles")]);
  const modules = modulesFor(session.permissions).filter((module) => module.status === "planned");

  return (
    <div className="mx-auto max-w-6xl">
      <p className="text-sm font-semibold text-accent-ink">{t("overview.welcome")}</p>
      <h1 className="mt-2 display-lg">{t("overview.title")}</h1>
      <p className="mt-4 max-w-3xl text-muted-foreground">{t("overview.intro")}</p>

      <section aria-labelledby="roles-heading" className="mt-10">
        <h2 id="roles-heading" className="text-sm font-semibold">
          {t("yourRoles")}
        </h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {session.roles.map((role) => (
            <li
              key={role}
              className="rounded-full border border-border-strong/60 bg-surface px-3 py-1 text-sm font-medium"
            >
              {tRoles(role)}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="modules-heading" className="mt-12">
        <h2 id="modules-heading" className="display-md">
          {t("overview.modulesHeading")}
        </h2>
        {modules.length === 0 ? (
          <p className="mt-4 text-muted-foreground">{t("overview.noModules")}</p>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {modules.map((module) => {
              const Icon = ADMIN_MODULE_ICONS[module.key];
              return (
                <li
                  key={module.key}
                  className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex size-10 items-center justify-center rounded-xl bg-surface-muted text-accent-ink">
                      <Icon aria-hidden className="size-5" />
                    </span>
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                      {t("plannedBadge")}
                    </span>
                  </div>
                  <h3 className="font-semibold">{t(`modules.${module.key}`)}</h3>
                  <p className="text-sm text-muted-foreground">
                    {module.key === "overview" ? null : t(`moduleDescriptions.${module.key}`)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
