import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/admin/access-denied";
import { CmsMessages } from "@/features/cms/components/admin/cms-messages";
import { PreviewScreen } from "@/features/cms/components/admin/preview";
import { isContentType } from "@/features/cms/content-types";
import { authorizeAdmin } from "@/lib/auth/staff-session";

// Blocks on the session cookie by design: nothing renders before authorization.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AdminCms");
  return { title: t("previewTitle") };
}

export default async function PreviewPage({ params, searchParams }: PageProps<"/admin/preview/[type]/[id]">) {
  // Drafts are visible to staff who can read unpublished content, nobody else.
  const decision = await authorizeAdmin("content.read");
  if (decision.kind === "forbidden") return <AccessDenied email={decision.session.user.email} />;
  const [{ type, id }, { locale }] = await Promise.all([params, searchParams]);
  if (!isContentType(type)) notFound();
  return (
    <CmsMessages>
      <PreviewScreen type={type} id={id} locale={locale === "am" ? "am" : "en"} />
    </CmsMessages>
  );
}
