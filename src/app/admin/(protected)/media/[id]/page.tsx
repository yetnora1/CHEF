import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/admin/access-denied";
import { MediaDetailScreen } from "@/features/cms/components/admin/media-screens";
import { authorizeAdmin } from "@/lib/auth/staff-session";

// Blocks on the session cookie by design: nothing renders before authorization.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AdminCms");
  return { title: t("media.detailTitle") };
}

export default async function AdminMediaDetailPage({ params }: PageProps<"/admin/media/[id]">) {
  const decision = await authorizeAdmin("media.write");
  if (decision.kind === "forbidden") return <AccessDenied email={decision.session.user.email} />;
  const { id } = await params;
  return <MediaDetailScreen id={id} />;
}
