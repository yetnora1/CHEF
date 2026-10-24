import { cn } from "@/lib/utils";
import type { BookingStatus } from "../status";

const TONE: Record<BookingStatus, string> = {
  new: "bg-accent/18 text-accent-ink",
  in_review: "bg-surface-muted text-foreground",
  contacted: "bg-surface-muted text-foreground",
  quoted: "bg-surface-muted text-foreground",
  confirmed: "bg-success/14 text-success",
  completed: "bg-surface-muted text-muted-foreground",
  declined: "bg-danger/10 text-danger",
  cancelled: "bg-danger/10 text-danger",
};

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: BookingStatus;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        TONE[status],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
