"use client";

import { AlertCircle, CheckCircle2, ExternalLink, LoaderCircle, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type RefObject,
} from "react";
import { Button } from "@/components/ui/button";
import { Field, fieldAria, Input, Textarea } from "@/components/ui/form-controls";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import {
  CONTACT_FIELDS,
  CONTACT_LIMITS,
  parseContactMessage,
  type ContactField,
  type ContactFieldErrors,
} from "../message-schema";
import type { ContactFormState } from "../server/submission";
import { submitContactAction } from "../submit-action";

type ClientState = ContactFormState | { status: "network_error" };

const IDLE: ClientState = { status: "idle" };
const subscribeNever = () => () => {};
const ids = (field: ContactField) => `contact-${field}`;

/** Focuses the first field with a problem, in form order. */
function focusFirstError(errors: ContactFieldErrors) {
  const first = CONTACT_FIELDS.find((field) => errors[field]);
  if (first) document.getElementById(ids(first))?.focus();
}

/** The contact form; "Send another message" remounts it with a fresh state and key. */
export function ContactForm({ locale }: { locale: AppLocale }) {
  const [generation, setGeneration] = useState(0);
  return <MessageForm key={generation} locale={locale} onReset={() => setGeneration((n) => n + 1)} />;
}

function MessageForm({ locale, onReset }: { locale: AppLocale; onReset: () => void }) {
  const t = useTranslations("ContactForm");

  // Idempotency key: reused for retries of the same message, replaced after success.
  const submissionKey = useRef<string | null>(null);
  const [clientErrors, setClientErrors] = useState<ContactFieldErrors | null>(null);
  const [messageLength, setMessageLength] = useState(0);
  // Until React has hydrated, a native submit would bypass the action, so the
  // button stays disabled (and method="post" keeps fields out of the URL).
  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const [state, dispatch, pending] = useActionState(async (previous: ClientState, formData: FormData) => {
    try {
      const next = await submitContactAction(previous as ContactFormState, formData);
      if (next.status === "success") submissionKey.current = null;
      return next;
    } catch {
      return { status: "network_error" } as ClientState;
    }
  }, IDLE);

  // Move focus to the first problem or to the outcome, so keyboard and
  // screen-reader users hear it.
  useEffect(() => {
    if (state.status === "idle") return;
    if (state.status === "invalid") focusFirstError(state.fieldErrors);
    else resultRef.current?.focus();
  }, [state]);

  const fieldErrors: ContactFieldErrors =
    clientErrors ?? (state.status === "invalid" ? state.fieldErrors : {});

  function readForm(): Record<string, string> {
    const data = new FormData(formRef.current!);
    const out: Record<string, string> = {};
    for (const [key, value] of data.entries()) if (typeof value === "string") out[key] = value;
    return out;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const parsed = parseContactMessage(readForm());
    if (!parsed.success) {
      setClientErrors(parsed.fieldErrors);
      // After the render that attaches the error text to the field.
      requestAnimationFrame(() => focusFirstError(parsed.fieldErrors));
      return;
    }
    setClientErrors(null);

    const formData = new FormData(event.currentTarget);
    submissionKey.current ??= crypto.randomUUID();
    formData.set("submissionKey", submissionKey.current);
    formData.set("locale", locale);
    startTransition(() => dispatch(formData));
  }

  // After a failed submit, re-validate as the visitor corrects fields.
  function onChange() {
    if (clientErrors) {
      const parsed = parseContactMessage(readForm());
      setClientErrors(parsed.success ? {} : parsed.fieldErrors);
    }
  }

  if (state.status === "success") {
    return (
      <div
        ref={resultRef}
        tabIndex={-1}
        role="status"
        className="scroll-mt-28 rounded-2xl border border-border bg-surface p-6 outline-none sm:p-8"
      >
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-success/12 text-success">
          <CheckCircle2 aria-hidden className="size-6" />
        </span>
        <h2 className="mt-5 display-md">{t("successTitle")}</h2>
        <p className="mt-2 text-muted-foreground">{t("successBody")}</p>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5">
          <p className="text-sm text-muted-foreground">
            {t("referenceLabel")}:{" "}
            <span
              className="font-mono font-semibold tracking-wider text-foreground"
              data-testid="contact-reference"
            >
              {state.reference}
            </span>
          </p>
          <Button variant="outline" size="sm" onClick={onReset}>
            {t("newMessage")}
          </Button>
        </div>
      </div>
    );
  }

  const error = (field: ContactField) => (fieldErrors[field] ? t(`errors.${fieldErrors[field]}`) : undefined);

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
      <h2 className="display-md">{t("title")}</h2>
      <p className="mt-2 text-muted-foreground">{t("intro")}</p>

      <form
        ref={formRef}
        method="post"
        noValidate
        onSubmit={onSubmit}
        onChange={onChange}
        aria-label={t("title")}
        className="mt-8 space-y-6"
      >
        <ServerMessage state={state} resultRef={resultRef} />

        {/* Every field is required unless its label says "optional". */}
        <div className="grid gap-6 sm:grid-cols-2">
          <Field id={ids("fullName")} label={t("fullName")} error={error("fullName")}>
            <Input
              {...fieldAria(ids("fullName"), { error: error("fullName") })}
              name="fullName"
              autoComplete="name"
              maxLength={CONTACT_LIMITS.nameMax}
              required
            />
          </Field>
          <Field id={ids("email")} label={t("email")} error={error("email")}>
            <Input
              {...fieldAria(ids("email"), { error: error("email") })}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={CONTACT_LIMITS.emailMax}
              required
            />
          </Field>
          <Field id={ids("phone")} label={t("phone")} optionalLabel={t("optional")} error={error("phone")}>
            <Input
              {...fieldAria(ids("phone"), { error: error("phone") })}
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={CONTACT_LIMITS.phoneMax}
            />
          </Field>
          <Field
            id={ids("subject")}
            label={t("subject")}
            optionalLabel={t("optional")}
            error={error("subject")}
          >
            <Input
              {...fieldAria(ids("subject"), { error: error("subject") })}
              name="subject"
              autoComplete="off"
              maxLength={CONTACT_LIMITS.subjectMax}
            />
          </Field>
        </div>

        <Field id={ids("message")} label={t("message")} error={error("message")}>
          <div className="relative">
            <Textarea
              {...fieldAria(ids("message"), { error: error("message") })}
              name="message"
              rows={5}
              maxLength={CONTACT_LIMITS.messageMax}
              required
              onInput={(event) => setMessageLength(event.currentTarget.value.length)}
              className="pb-8"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute right-3 bottom-2.5 text-xs text-muted-foreground tabular-nums"
            >
              {messageLength}/{CONTACT_LIMITS.messageMax}
            </span>
          </div>
        </Field>

        {/* Honeypot: hidden from people and assistive technology; bots tend to fill it. */}
        <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
          <label>
            Website
            <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
          </label>
        </div>

        <div className="space-y-2">
          <label className="flex items-start gap-3 text-sm leading-relaxed" htmlFor={ids("consent")}>
            <input
              {...fieldAria(ids("consent"), { error: error("consent") })}
              type="checkbox"
              name="consent"
              required
              className="mt-1 size-5 shrink-0 accent-primary"
            />
            <span>
              {t.rich("consent", {
                link: (chunks) => (
                  <Link
                    href="/privacy"
                    className="font-semibold underline underline-offset-2"
                    target="_blank"
                  >
                    {chunks}
                    <ExternalLink aria-hidden className="ml-1 inline size-3.5 align-[-0.1em]" />
                    <span className="sr-only"> ({t("opensInNewTab")})</span>
                  </Link>
                ),
              })}
            </span>
          </label>
          {error("consent") && (
            <p id={`${ids("consent")}-error`} className="text-sm font-medium text-danger">
              {error("consent")}
            </p>
          )}
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={pending || !hydrated}
          aria-disabled={pending || !hydrated}
          className="w-full sm:w-auto"
        >
          {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <Send aria-hidden />}
          {pending ? t("submitting") : t("submit")}
        </Button>
      </form>
    </div>
  );
}

function ServerMessage({
  state,
  resultRef,
}: {
  state: ClientState;
  resultRef: RefObject<HTMLDivElement | null>;
}) {
  const t = useTranslations("ContactForm");
  let message: string | null = null;
  switch (state.status) {
    case "rate_limited":
      message = t("rateLimited", { minutes: state.retryAfterMinutes });
      break;
    case "conflict":
      message = t("conflict");
      break;
    case "unavailable":
      message = t("unavailableBody");
      break;
    case "error":
      message = t("error");
      break;
    case "network_error":
      message = t("networkError");
      break;
  }
  if (!message) return null;
  return (
    <div
      ref={resultRef}
      tabIndex={-1}
      role="alert"
      className="flex scroll-mt-28 items-start gap-2.5 rounded-xl border border-danger/40 bg-danger/8 p-4 text-sm text-danger outline-none"
    >
      <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
      {message}
    </div>
  );
}
