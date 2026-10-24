"use client";

import { AlertCircle, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent, type InputHTMLAttributes } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const credentialsSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(256),
});

type FieldErrors = Partial<Record<"email" | "password", string>>;

/**
 * Signs in directly against Supabase Auth from the browser, so Auth's per-IP
 * rate limits apply to the visitor rather than to this server's IP. Errors are
 * deliberately generic: the form never reveals whether an email has an account.
 */
export function LoginForm({ next }: { next: string }) {
  const t = useTranslations("Auth");
  const router = useRouter();
  const ids = { email: useId(), password: useId(), error: useId() };
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = credentialsSchema.safeParse({
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    });

    if (!parsed.success) {
      const issues = new Set(parsed.error.issues.map((issue) => issue.path[0]));
      setFieldErrors({
        email: issues.has("email") ? t("emailInvalid") : undefined,
        password: issues.has("password") ? t("passwordRequired") : undefined,
      });
      setFormError(null);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setPending(true);

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setFormError(t("configRequiredTitle"));
      setPending(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) {
      setFormError(
        error.code === "invalid_credentials"
          ? t("invalidCredentials")
          : error.status === 429 || error.code === "over_request_rate_limit"
            ? t("rateLimited")
            : t("genericError"),
      );
      setPending(false);
      return;
    }

    // The server re-checks the session and permissions on the next request.
    router.replace(next);
    router.refresh();
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      aria-describedby={formError ? ids.error : undefined}
      className="space-y-5"
    >
      {formError && (
        <p
          id={ids.error}
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-danger/40 bg-danger/8 p-3.5 text-sm text-danger"
        >
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          {formError}
        </p>
      )}

      <Field
        id={ids.email}
        label={t("email")}
        error={fieldErrors.email}
        input={{ name: "email", type: "email", autoComplete: "username", inputMode: "email", required: true }}
      />
      <Field
        id={ids.password}
        label={t("password")}
        error={fieldErrors.password}
        input={{ name: "password", type: "password", autoComplete: "current-password", required: true }}
      />

      <Button type="submit" size="lg" className="w-full" disabled={pending} aria-disabled={pending}>
        {pending && <LoaderCircle aria-hidden className="animate-spin" />}
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  input,
}: {
  id: string;
  label: string;
  error?: string;
  input: InputHTMLAttributes<HTMLInputElement>;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        {...input}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="block h-12 w-full rounded-xl border border-border-strong bg-surface px-4 text-base text-foreground transition-colors placeholder:text-muted-foreground hover:border-foreground/60 focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring aria-invalid:border-danger"
      />
      {error && (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
