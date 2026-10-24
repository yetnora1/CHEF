import type { ReactNode } from "react";
import { AccessDenied } from "@/components/admin/access-denied";
import { AdminShell } from "@/components/admin/admin-shell";
import { AuthShell } from "@/components/admin/auth-shell";
import { authorizeAdmin } from "@/lib/auth/staff-session";

// Blocks on the session cookie by design: nothing renders before authorization.
export const instant = false;

/*
 * Shell for every protected admin route. It renders nothing protected for
 * visitors without `admin.access`. Layouts are not re-run on every client
 * navigation, so each page below must ALSO call authorizeAdmin() for its own
 * permission; this check is the outer gate, not the only one.
 */
export default async function ProtectedAdminLayout({ children }: { children: ReactNode }) {
  const decision = await authorizeAdmin("admin.access");

  if (decision.kind === "forbidden") {
    return (
      <AuthShell>
        <AccessDenied email={decision.session.user.email} />
      </AuthShell>
    );
  }

  return <AdminShell session={decision.session}>{children}</AdminShell>;
}
