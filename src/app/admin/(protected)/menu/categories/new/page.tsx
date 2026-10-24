import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/admin/access-denied";
import { ContentCreateScreen } from "@/features/cms/components/admin/screens";
import { hasPermission } from "@/lib/auth/access";
import { authorizeAdmin } from "@/lib/auth/staff-session";

// Blocks on the session cookie by design: nothing renders before authorization.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AdminCms");
  return { title: t("types.menu_category.new") };
}

export default async function NewMenuCategoriesPage() {
  // A new entry is created together with its English version.
  const decision = await authorizeAdmin("content.write");
  if (decision.kind === "forbidden" || !hasPermission(decision.session, "translations.write")) {
    return <AccessDenied email={decision.session.user.email} />;
  }
  return <ContentCreateScreen type="menu_category" />;
}
