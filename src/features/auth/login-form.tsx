"use client";

import { AlertCircle, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent, type InputHTMLAttributes } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { isValidUsername, normaliseUsername } from "@/features/account/rules";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { signInWithUsernameAction } from "./actions";

const email = z.email().max(254);
const password = z.string().min(1).max(256);

type FieldErrors = Partial<Record<"identifier" | "password", string>>;

/**
 * With an email address, signs in directly against Supabase Auth from the browser,
 * so Auth's per-IP rate limits apply to the visitor rather than to this server's IP.
 * With a username, the server does it (actions.ts), because only the server may turn
 * a username into an email address. Errors are deliberately generic: the form never
 * reveals whether an email or username has an account.
 */
export function LoginForm({ next }: { next: string }) {
  const t = useTranslations("Auth");
  const router = useRouter();
  const ids = { identifier: useId(), password: useId(), error: useId() };
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const identifier = String(form.get("identifier") ?? "").trim();
    const secret = password.safeParse(String(form.get("password") ?? ""));
    const isEmail = identifier.includes("@");
    const identifierOk = isEmail ? email.safeParse(identifier).success : identifier.length > 0;

    if (!identifierOk || !secret.success) {
      setFieldErrors({
        identifier: identifierOk ? undefined : t("identifierInvalid"),
        password: secret.success ? undefined : t("passwordRequired"),
      });
      setFormError(null);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setPending(true);

    const failure = isEmail
      ? await signInWithEmail(identifier, secret.data)
      : await signInWithUsername(identifier, secret.data);
    if (failure) {
      setFormError(failure);
      setPending(false);
      return;
    }

    // The server re-checks the session and permissions on the next request.
    router.replace(next);
    router.refresh();
  }

  /** Returns what to tell the visitor if it failed. */
  async function signInWithEmail(address: string, secret: string): Promise<string | null> {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return t("configRequiredTitle");
    const { error } = await supabase.auth.signInWithPassword({ email: address, password: secret });
    if (!error) return null;
    return error.code === "invalid_credentials"
      ? t("invalidCredentials")
      : error.status === 429 || error.code === "over_request_rate_limit"
        ? t("rateLimited")
        : t("genericError");
  }

  async function signInWithUsername(username: string, secret: string): Promise<string | null> {
    const name = normaliseUsername(username);
    // A name that could not exist gets the same answer as one that does not.
    if (!isValidUsername(name)) return t("invalidCredentials");
    const { status } = await signInWithUsernameAction({ username: name, password: secret }).catch(() => ({
      status: "error" as const,
    }));
    if (status === "ok") return null;
    return status === "invalid"
      ? t("invalidCredentials")
      : status === "rateLimited"
        ? t("rateLimited")
        : t("genericError");
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
        id={ids.identifier}
        label={t("identifier")}
        error={fieldErrors.identifier}
        input={{
          name: "identifier",
          type: "text",
          autoComplete: "username",
          autoCapitalize: "none",
          spellCheck: false,
          required: true,
        }}
      />
      <Field
        id={ids.password}
        label={t("password")}
        error={fieldErrors.password}
        reveal={{ show: t("showPassword"), hide: t("hidePassword") }}
        input={{ name: "password", autoComplete: "current-password", required: true }}
      />

      <Button
        type="submit"
        variant="action"
        size="lg"
        className="w-full"
        disabled={pending}
        aria-disabled={pending}
      >
        {pending && <LoaderCircle aria-hidden className="animate-spin" />}
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}

const INPUT =
  "block h-12 w-full rounded-xl border border-border-strong bg-field px-4 text-base text-foreground transition-colors placeholder:text-muted-foreground hover:border-foreground/60 focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring aria-invalid:border-danger";

function Field({
  id,
  label,
  error,
  input,
  reveal,
}: {
  id: string;
  label: string;
  error?: string;
  input: InputHTMLAttributes<HTMLInputElement>;
  /** A password field: labels for the button that shows its text. */
  reveal?: { show: string; hide: string };
}) {
  const errorId = `${id}-error`;
  const shared = {
    id,
    ...input,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? errorId : undefined,
    className: INPUT,
  } as const;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      {reveal ? (
        <PasswordInput {...shared} showLabel={reveal.show} hideLabel={reveal.hide} />
      ) : (
        <input {...shared} />
      )}
      {error && (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
