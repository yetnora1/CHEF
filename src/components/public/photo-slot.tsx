import { Camera } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ResolvedText } from "@/lib/localization/translations";
import { cn } from "@/lib/utils";

type PhotoSlotProps = {
  /** Describes the photograph this slot is waiting for. */
  subject: ResolvedText;
  shape?: "arch" | "rounded";
  className?: string;
};

/**
 * A clearly labelled stand-in for photography that has not been supplied yet.
 * It never shows stock imagery that could be mistaken for Chief Harena's work.
 * The media library stage replaces this with next/image and real assets.
 */
export async function PhotoSlot({ subject, shape = "rounded", className }: PhotoSlotProps) {
  const t = await getTranslations("Common");
  const radius = shape === "arch" ? "rounded-t-[999px] rounded-b-[1.75rem]" : "rounded-[1.75rem]";

  return (
    <figure
      role="img"
      aria-label={`${t("photoPlaceholder")}: ${subject.text}`}
      className={cn(
        "relative isolate flex overflow-hidden bg-surface-muted text-muted-foreground",
        radius,
        className,
      )}
    >
      <span aria-hidden className="absolute inset-0 -z-10 dot-texture" />
      <span
        aria-hidden
        className={cn("absolute inset-3 border border-dashed border-border-strong/45", radius)}
      />
      <span className="m-auto flex max-w-[15rem] flex-col items-center gap-2.5 px-6 py-10 text-center">
        <Camera aria-hidden className="size-5 text-accent-ink" strokeWidth={1.75} />
        <span className="eyebrow text-[0.62rem] text-foreground/75">{t("photoPlaceholder")}</span>
        <span className="text-sm leading-snug">
          {t("photoPlaceholderIntended", { subject: subject.text })}
        </span>
      </span>
    </figure>
  );
}
