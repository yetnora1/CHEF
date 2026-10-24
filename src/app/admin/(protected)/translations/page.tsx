import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/admin/access-denied";
import { parseCmsFilters } from "@/features/cms/admin-data";
import { TranslationsScreen } from "@/features/cms/components/admin/screens";
import { isContentType } from "@/features/cms/content-types";
import { authorizeAdmin } from "@/lib/auth/staff-session";

// Blocks on the session cookie by design: nothing renders before authorization.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AdminCms");
  return { title: t("translations.title") };
}

export default async function AdminTranslationsPage({ searchParams }: PageProps<"/admin/translations">) {
  const decision = await authorizeAdmin("translations.write");
  if (decision.kind === "forbidden") return <AccessDenied email={decision.session.user.email} />;
  const params = await searchParams;
  const type = Array.isArray(params.type) ? params.type[0] : params.type;
  return <TranslationsScreen filters={parseCmsFilters(params)} type={isContentType(type) ? type : null} />;
}
