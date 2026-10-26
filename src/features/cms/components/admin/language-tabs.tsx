"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * Tabs for the language versions of an entry (WAI-ARIA tabs pattern: arrow
 * keys, Home/End). Every panel stays mounted, so switching languages never
 * loses unsaved input.
 */
export function LanguageTabs({
  label,
  tabs,
  initial,
}: {
  label: string;
  tabs: { key: string; label: ReactNode; panel: ReactNode }[];
  initial?: string;
}) {
  const [active, setActive] = useState(tabs.some((tab) => tab.key === initial) ? initial! : tabs[0]!.key);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const last = tabs.length - 1;
    const next =
      event.key === "ArrowRight"
        ? index === last
          ? 0
          : index + 1
        : event.key === "ArrowLeft"
          ? index === 0
            ? last
            : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    setActive(tabs[next]!.key);
    refs.current[next]?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label={label} className="flex gap-1 border-b border-border">
        {tabs.map((tab, index) => {
          const selected = tab.key === active;
          return (
            <button
              key={tab.key}
              ref={(element) => {
                refs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`tab-${tab.key}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.key}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(tab.key)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "-mb-px inline-flex items-center gap-2 rounded-t-lg border border-b-0 px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                selected
                  ? "border-border bg-surface text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-surface-muted hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.key}
          role="tabpanel"
          id={`panel-${tab.key}`}
          aria-labelledby={`tab-${tab.key}`}
          hidden={tab.key !== active}
          tabIndex={0}
          className="rounded-b-2xl border border-t-0 border-border bg-surface p-4 focus-visible:outline-2 focus-visible:outline-ring sm:p-6"
        >
          {tab.panel}
        </div>
      ))}
    </div>
  );
}
