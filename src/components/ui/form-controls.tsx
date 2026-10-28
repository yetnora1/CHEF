import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * Form primitives. Native elements keep mobile keyboards, date pickers and
 * screen-reader behaviour intact; styling comes from the semantic tokens.
 */

const controlBase =
  "block w-full rounded-xl border border-border-strong bg-field px-4 text-base text-foreground transition-colors placeholder:text-muted-foreground hover:border-foreground/60 focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(controlBase, "h-12", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(controlBase, "min-h-28 py-3 leading-relaxed", className)} {...props} />;
}

export function NativeSelect({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        controlBase,
        "h-12 appearance-none bg-[length:1.1rem] bg-[right_0.9rem_center] bg-no-repeat pr-10",
        "bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2024%2024%22%20fill=%22none%22%20stroke=%22%238c7f69%22%20stroke-width=%222%22%3E%3Cpath%20d=%22m6%209%206%206%206-6%22/%3E%3C/svg%3E')]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function fieldIds(id: string) {
  return { hint: `${id}-hint`, error: `${id}-error` };
}

/** aria-describedby/aria-invalid wiring for a control rendered inside <Field>. */
export function fieldAria(id: string, { hint, error }: { hint?: ReactNode; error?: ReactNode }) {
  const ids = fieldIds(id);
  const describedBy = [error ? ids.error : null, hint ? ids.hint : null].filter(Boolean).join(" ");
  return {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy || undefined,
  } as const;
}

type FieldProps = {
  id: string;
  label: ReactNode;
  required?: boolean;
  optionalLabel?: string;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function Field({ id, label, required, optionalLabel, hint, error, className, children }: FieldProps) {
  const ids = fieldIds(id);
  return (
    <div className={cn("space-y-2", className)}>
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
        {required ? (
          <span aria-hidden className="ml-0.5 text-terracotta">
            *
          </span>
        ) : optionalLabel ? (
          <>
            {" "}
            <span className="ml-1 text-xs font-normal text-muted-foreground">({optionalLabel})</span>
          </>
        ) : null}
      </label>
      {children}
      {hint && (
        <p id={ids.hint} className="text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={ids.error} className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
