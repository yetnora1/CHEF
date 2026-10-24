import { cn } from "@/lib/utils";
import { Emblem } from "./emblem";

export function Wordmark({ tagline, className }: { tagline: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <Emblem />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[1.35rem] font-medium tracking-[-0.01em]" lang="en">
          Chief Harena
        </span>
        <span className="mt-1 text-[0.68rem] font-semibold tracking-[0.18em] text-muted-foreground uppercase [&:lang(am)]:text-[0.78rem] [&:lang(am)]:tracking-normal">
          {tagline}
        </span>
      </span>
    </span>
  );
}
