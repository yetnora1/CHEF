import { cn } from "@/lib/utils";
import { Emblem } from "./emblem";

export function Wordmark({ tagline, className }: { tagline: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <Emblem />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[1.2rem] font-bold tracking-[-0.02em]" lang="en">
          Chief Harena
        </span>
        <span className="mt-1 text-xs font-medium text-muted-foreground [&:lang(am)]:text-[0.78rem]">
          {tagline}
        </span>
      </span>
    </span>
  );
}
