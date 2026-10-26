export function SkipLink({ label }: { label: string }) {
  return (
    <a
      href="#main-content"
      className="sr-only z-[60] rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
    >
      {label}
    </a>
  );
}
