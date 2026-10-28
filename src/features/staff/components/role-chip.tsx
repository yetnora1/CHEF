import { ShieldCheck } from "lucide-react";
import type { AppRole } from "@/lib/permissions/matrix";
import { cn } from "@/lib/utils";
import { ROLE_HUES } from "../role-hues";
import { isPrivilegedRole } from "../roles";

/** A role's badge in its own colour; owner and administrator carry a shield. */
export function RoleChip({ role, label }: { role: AppRole; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full tint-chip px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        ROLE_HUES[role],
      )}
    >
      {isPrivilegedRole(role) && <ShieldCheck aria-hidden className="size-3.5" />}
      {label}
    </span>
  );
}
