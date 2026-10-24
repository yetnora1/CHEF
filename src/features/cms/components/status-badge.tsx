import type { PublicationStatus } from "../content-types";
import { cn } from "@/lib/utils";

const TONES: Record<PublicationStatus | "missing", string> = {
  draft: "border-border-strong/60 bg-surface-muted text-muted-foreground",
  in_review: "border-accent/60 bg-surface text-accent-ink",
  published: "border-success/50 bg-surface text-success",
  archived: "border-border bg-surface text-muted-foreground line-through decoration-1",
  missing: "border-dashed border-border-strong/70 bg-transparent text-muted-foreground",
};

/** A publication state as text (never colour alone). */
export function PublicationBadge({
  status,
  label,
  className,
}: {
  status: PublicationStatus | "missing";
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        TONES[status],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
