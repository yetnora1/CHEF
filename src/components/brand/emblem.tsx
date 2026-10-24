import { cn } from "@/lib/utils";

/**
 * Geometric brand mark: a ring with a woven-border dot rhythm around a gold
 * lozenge. Abstract by design; it does not reproduce any religious or civic
 * symbol. Decorative, so it is hidden from assistive technology.
 */
export function Emblem({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" className={cn("size-9", className)}>
      <circle cx="20" cy="20" r="18.75" stroke="currentColor" strokeWidth="1.5" />
      <circle
        cx="20"
        cy="20"
        r="14.5"
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="0.1 3.05"
        strokeLinecap="round"
      />
      <path d="M20 10.5 29.5 20 20 29.5 10.5 20Z" fill="var(--accent)" />
      <path d="M20 15.5 24.5 20 20 24.5 15.5 20Z" fill="var(--background)" />
      <circle cx="20" cy="20" r="1.6" fill="currentColor" />
    </svg>
  );
}
