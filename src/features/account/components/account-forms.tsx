"use client";

import { CheckCircle2, LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { startTransition, useActionState, useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, fieldAria } from "@/components/ui/form-controls";
import { PasswordInput } from "@/components/ui/password-input";
import {
  changeEmailAction,
  changePasswordAction,
  saveUsernameAction,
  type AccountActionState,
} from "../actions";

/* The forms on a staff member's account page; the server checks everything again. */

const IDLE: AccountActionState = { status: "idle" };

function useAccountForm(
  action: (previous: AccountActionState, data: FormData) => Promise<AccountActionState>,
) {
  const [state, dispatch, pending] = useActionState(action, IDLE);
  const form = useRef<HTMLFormElement>(null);
  return { state, pending, form, dispatch };
}

function Status({ state, success }: { state: AccountActionState; success: ReactNode }) {
  const t = useTranslations("AdminAccount.errors");
  if (state.status === "idle") return null;
  if (state.status === "error") {
    return (
      <p role="alert" className="text-sm font-medium text-danger">
        {t(state.error)}
      </p>
    );
  }
  return (
    <p role="status" className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
      <CheckCircle2 aria-hidden className="size-4 shrink-0" />
      {success}
    </p>
  );
}

function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <Button type="submit" variant="action" disabled={pending}>
      {pending && <LoaderCircle aria-hidden className="animate-spin" />}
      {children}
    </Button>
  );
}

function CurrentPassword({ id }: { id: string }) {
  const t = useTranslations("AdminAccount");
  return (
    <Field id={id} label={t("currentPassword")} required>
      <PasswordInput
        id={id}
        name="current_password"
        autoComplete="current-password"
        required
        showLabel={t("showPassword")}
        hideLabel={t("hidePassword")}
      />
    </Field>
  );
}

export function UsernameForm({ username }: { username: string | null }) {
  const t = useTranslations("AdminAccount.username");
  const { state, pending, form, dispatch } = useAccountForm(saveUsernameAction);
  return (
    <form
      ref={form}
      method="post"
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(() => dispatch(new FormData(event.currentTarget)));
      }}
    >
      <Field id="account-username" label={t("label")} hint={t("hint")}>
        <Input
          {...fieldAria("account-username", { hint: true })}
          name="username"
          defaultValue={username ?? ""}
          maxLength={32}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending}>{username ? t("change") : t("create")}</SubmitButton>
        <Status state={state} success={state.status === "removed" ? t("removed") : t("saved")} />
      </div>
    </form>
  );
}

export function EmailForm({ email, pendingEmail }: { email: string | null; pendingEmail: string | null }) {
  const t = useTranslations("AdminAccount.email");
  const { state, pending, form, dispatch } = useAccountForm(changeEmailAction);

  useEffect(() => {
    if (state.status === "emailSent" || state.status === "emailChanged") form.current?.reset();
  }, [state, form]);

  return (
    <form
      ref={form}
      method="post"
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(() => dispatch(new FormData(event.currentTarget)));
      }}
    >
      <dl className="space-y-1 text-sm">
        <dt className="text-muted-foreground">{t("current")}</dt>
        <dd className="font-semibold break-all">{email}</dd>
        {pendingEmail && pendingEmail !== email && (
          <dd className="text-muted-foreground">{t("waiting", { email: pendingEmail })}</dd>
        )}
      </dl>
      <Field id="account-email" label={t("new")} required hint={t("hint")}>
        <Input
          {...fieldAria("account-email", { hint: true })}
          name="email"
          type="email"
          inputMode="email"
          maxLength={254}
          autoComplete="email"
          required
        />
      </Field>
      <CurrentPassword id="account-email-password" />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending}>{t("submit")}</SubmitButton>
        <Status
          state={state}
          success={
            state.status === "emailSent"
              ? t("sent", { email: state.email })
              : state.status === "emailChanged"
                ? t("changed", { email: state.email })
                : null
          }
        />
      </div>
    </form>
  );
}

export function PasswordForm() {
  const t = useTranslations("AdminAccount");
  const { state, pending, form, dispatch } = useAccountForm(changePasswordAction);

  useEffect(() => {
    if (state.status === "passwordChanged") form.current?.reset();
  }, [state, form]);

  return (
    <form
      ref={form}
      method="post"
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(() => dispatch(new FormData(event.currentTarget)));
      }}
    >
      <CurrentPassword id="account-password-current" />
      <Field id="account-password-new" label={t("password.new")} required hint={t("password.hint")}>
        <PasswordInput
          {...fieldAria("account-password-new", { hint: true })}
          name="new_password"
          autoComplete="new-password"
          required
          showLabel={t("showPassword")}
          hideLabel={t("hidePassword")}
        />
      </Field>
      <Field id="account-password-repeat" label={t("password.repeat")} required>
        <PasswordInput
          id="account-password-repeat"
          name="repeat_password"
          autoComplete="new-password"
          required
          showLabel={t("showPassword")}
          hideLabel={t("hidePassword")}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending}>{t("password.submit")}</SubmitButton>
        <Status state={state} success={t("password.changed")} />
      </div>
    </form>
  );
}
