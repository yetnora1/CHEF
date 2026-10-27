import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccessDenied } from "@/components/admin/access-denied";
import { listMessages, messageCounts, parseMessageFilters } from "@/features/contact/admin-data";
import { MessageList, MessageSearch, MessageTabs } from "@/features/contact/components/admin/message-inbox";
import { hasPermission } from "@/lib/auth/access";
import { authorizeAdmin } from "@/lib/auth/staff-session";

// Blocks on the session cookie by design: nothing renders before authorization.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AdminMessages");
  return { title: t("title") };
}

export default async function AdminMessagesPage({ searchParams }: PageProps<"/admin/messages">) {
  const decision = await authorizeAdmin("messages.read");
  if (decision.kind === "forbidden") return <AccessDenied email={decision.session.user.email} />;

  const canWrite = hasPermission(decision.session, "messages.write");
  const filters = parseMessageFilters(await searchParams);
  const [t, list, counts] = await Promise.all([
    getTranslations("AdminMessages"),
    listMessages(filters),
    messageCounts(),
  ]);

  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <h1 className="admin-title">{t("title")}</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">{t("intro")}</p>
      </header>
      <MessageTabs counts={counts} filters={filters} />
      <MessageSearch filters={filters} />
      <MessageList rows={list.rows} total={list.total} filters={filters} canWrite={canWrite} />
    </div>
  );
}
