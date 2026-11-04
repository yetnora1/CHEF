"use client";

import { Mail } from "lucide-react";
import { usePathname } from "next/navigation";
import { IntentLink } from "@/components/ui/intent-link";

/**
 * While an email change waits for its link, every admin page still shows the old
 * address, which looks like the change failed. This says why, except on the account
 * page, which explains it in place.
 */
export function EmailChangeNotice({ message, linkLabel }: { message: string; linkLabel: string }) {
  const pathname = usePathname();
  if (pathname === "/admin/account") return null;
  return (
    <p
      role="status"
      className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-warning/60 glass p-3 text-sm"
    >
      <Mail aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">{message}</span>
      <IntentLink href="/admin/account" className="font-semibold underline underline-offset-2">
        {linkLabel}
      </IntentLink>
    </p>
  );
}
