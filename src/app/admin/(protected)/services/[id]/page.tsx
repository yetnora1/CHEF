import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/admin/access-denied";
import { ContentEditScreen } from "@/features/cms/components/admin/screens";
import { authorizeAdmin } from "@/lib/auth/staff-session";

// Blocks on the session cookie by design: nothing renders before authorization.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AdminCms");
  return { title: t("types.service.edit") };
}

export default async function EditServicesPage({ params, searchParams }: PageProps<"/admin/services/[id]">) {
  const decision = await authorizeAdmin("content.read");
  if (decision.kind === "forbidden") return <AccessDenied email={decision.session.user.email} />;
  const [{ id }, { lang }] = await Promise.all([params, searchParams]);
  return (
    <ContentEditScreen
      type="service"
      id={id}
      session={decision.session}
      initialLocale={typeof lang === "string" ? lang : undefined}
    />
  );
}
