import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/admin/access-denied";
import { parseCmsFilters } from "@/features/cms/admin-data";
import { ContentListScreen } from "@/features/cms/components/admin/screens";
import { authorizeAdmin } from "@/lib/auth/staff-session";

// Blocks on the session cookie by design: nothing renders before authorization.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AdminCms");
  return { title: t("types.menu_category.plural") };
}

export default async function AdminMenuCategoriesPage({ searchParams }: PageProps<"/admin/menu/categories">) {
  const decision = await authorizeAdmin("content.read");
  if (decision.kind === "forbidden") return <AccessDenied email={decision.session.user.email} />;
  return (
    <ContentListScreen
      type="menu_category"
      session={decision.session}
      filters={parseCmsFilters(await searchParams)}
    />
  );
}
