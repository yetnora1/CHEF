import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/admin/access-denied";
import { parseMediaFilters } from "@/features/cms/admin-data";
import { MediaLibraryScreen } from "@/features/cms/components/admin/media-screens";
import { authorizeAdmin } from "@/lib/auth/staff-session";

// Blocks on the session cookie by design: nothing renders before authorization.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AdminCms");
  return { title: t("media.title") };
}

export default async function AdminMediaPage({ searchParams }: PageProps<"/admin/media">) {
  const decision = await authorizeAdmin("media.write");
  if (decision.kind === "forbidden") return <AccessDenied email={decision.session.user.email} />;
  return <MediaLibraryScreen filters={parseMediaFilters(await searchParams)} />;
}
