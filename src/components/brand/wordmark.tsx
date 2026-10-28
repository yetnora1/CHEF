import { cn } from "@/lib/utils";
import { Logo } from "./logo";

export function Wordmark({ tagline, className }: { tagline: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <Logo />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[1.2rem] font-bold" lang="en">
          CHEF SIS
        </span>
        <span className="mt-1 text-xs font-medium text-muted-foreground [&:lang(am)]:text-[0.78rem]">
          {tagline}
        </span>
      </span>
    </span>
  );
}
