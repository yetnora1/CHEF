"use client";

import { CircleUser, ExternalLink, LogOut } from "lucide-react";
import { useTransition } from "react";
import { IntentLink } from "@/components/ui/intent-link";
import { signOut } from "@/features/auth/actions";
import { cn } from "@/lib/utils";
import { AdminNav, sidebarItemClassName, type AdminNavProps } from "./admin-nav";
import { useSidebarCollapsed } from "./sidebar-toggle";

export type AdminSidebarProps = Omit<AdminNavProps, "collapsible"> & {
  email: string | null;
  roleLabels: string[];
  labels: {
    signedInAs: string;
    noRoles: string;
    account: string;
    viewSite: string;
    opensInNewTab: string;
    signOut: string;
  };
  /** The desktop sidebar folds to an icon rail; the phone menu sheet never does. */
  collapsible?: boolean;
};

/**
 * The sidebar's contents, shared by the desktop glass panel and the phone menu
 * sheet: who is signed in (a link to their account), the module navigation, then
 * the public site and sign-out at the foot.
 */
export function AdminSidebar({
  email,
  roleLabels,
  labels,
  collapsible = false,
  ...navProps
}: AdminSidebarProps) {
  const [pending, startTransition] = useTransition();
  const rail = useSidebarCollapsed() === true && collapsible;
  const railHidden = collapsible ? "sidebar-collapsed:sr-only" : undefined;
  const roles = roleLabels.length > 0 ? roleLabels.join(", ") : labels.noRoles;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <IntentLink
        href="/admin/account"
        onClick={navProps.onNavigate}
        title={rail ? [labels.account, email, roles].filter(Boolean).join(" · ") : labels.account}
        className={cn(
          "mx-3 flex items-center gap-3 rounded-xl border border-border bg-glass-raised p-2 inset-shadow-glass transition-[background-color,border-color] duration-200 hover:border-border-strong hover:bg-glass-raised-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          collapsible &&
            "sidebar-collapsed:justify-center sidebar-collapsed:border-transparent sidebar-collapsed:bg-transparent sidebar-collapsed:p-0 sidebar-collapsed:inset-shadow-none",
        )}
      >
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-linear-to-b from-action-top to-action-bottom text-sm font-bold text-action-foreground uppercase inset-shadow-sheen"
        >
          {email ? email[0] : <CircleUser className="size-5" />}
        </span>
        <span className={cn("min-w-0 leading-tight", railHidden)}>
          <span className="sr-only">
            {labels.account}. {labels.signedInAs}{" "}
          </span>
          <span className="block truncate text-sm font-semibold">{email}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{roles}</span>
        </span>
      </IntentLink>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-5">
        <AdminNav {...navProps} collapsible={collapsible} />
      </div>

      <ul className="space-y-1 border-t border-border p-3">
        <li>
          <a
            href="/"
            target="_blank"
            rel="noopener"
            title={rail ? labels.viewSite : undefined}
            className={sidebarItemClassName({ collapsible })}
          >
            <ExternalLink aria-hidden className="size-4 shrink-0" />
            <span className={cn("truncate", railHidden)}>{labels.viewSite}</span>
            <span className="sr-only"> ({labels.opensInNewTab})</span>
          </a>
        </li>
        <li>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => signOut())}
            title={rail ? labels.signOut : undefined}
            className={sidebarItemClassName({ collapsible })}
          >
            <LogOut aria-hidden className="size-4 shrink-0" />
            <span className={cn("truncate", railHidden)}>{labels.signOut}</span>
          </button>
        </li>
      </ul>
    </div>
  );
}
