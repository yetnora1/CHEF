"use client";

import { AlertCircle, CheckCircle2, Info, LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Button } from "@/components/ui/button";
import { Field, fieldAria, Input, NativeSelect, Textarea } from "@/components/ui/form-controls";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import {
  businessToday,
  eventDateBounds,
  INQUIRY_FIELDS,
  INQUIRY_LIMITS,
  parseInquiry,
  type InquiryField,
  type InquiryFieldErrors,
} from "../inquiry-schema";
import { CONTACT_METHODS, EVENT_TYPES } from "../status";
import type { InquiryFormState } from "../server/submission";
import { submitInquiryAction } from "../submit-action";
import { TurnstileWidget } from "./turnstile-widget";

export type InquiryCaptcha = { mode: "turnstile"; siteKey: string } | { mode: "local-bypass" };

type ClientState = InquiryFormState | { status: "network_error" };

const IDLE: ClientState = { status: "idle" };

// "Tomorrow" depends on the visitor's clock, not on when the page was
// prerendered, so it is read on the client only (null during SSR).
let boundsCache: { day: string; value: { min: string; max: string } } | null = null;
function clientDateBounds() {
  const day = businessToday();
  if (boundsCache?.day !== day) boundsCache = { day, value: eventDateBounds() };
  return boundsCache.value;
}
const subscribeNever = () => () => {};

export function InquiryForm({ locale, captcha }: { locale: AppLocale; captcha: InquiryCaptcha }) {
  const t = useTranslations("Booking");
  const tEvent = useTranslations("EventType");
  const tContact = useTranslations("ContactMethod");

  // Idempotency key: reused for retries of the same inquiry, replaced after success.
  const submissionKey = useRef<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaGeneration, setCaptchaGeneration] = useState(0);
  const [clientErrors, setClientErrors] = useState<InquiryFieldErrors | null>(null);
  const [captchaMissing, setCaptchaMissing] = useState(false);
  const [contactMethod, setContactMethod] = useState<string>("email");
  const dateBounds = useSyncExternalStore(subscribeNever, clientDateBounds, () => null);
  // Until React has hydrated, a native submit would bypass the action, so the
  // button stays disabled (and method="post" keeps fields out of the URL).
  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const [state, dispatch, pending] = useActionState(async (previous: ClientState, formData: FormData) => {
    let next: ClientState;
    try {
      next = await submitInquiryAction(previous as InquiryFormState, formData);
    } catch {
      next = { status: "network_error" };
    }
    // CAPTCHA tokens are single-use: request a fresh one after every attempt.
    setCaptchaToken(null);
    setCaptchaGeneration((n) => n + 1);
    // A new idempotency key only once this inquiry is safely stored.
    if (next.status === "success") submissionKey.current = null;
    return next;
  }, IDLE);

  // Move focus to the outcome so keyboard and screen-reader users hear it.
  useEffect(() => {
    if (state.status === "idle") return;
    if (state.status === "invalid") summaryRef.current?.focus();
    else resultRef.current?.focus();
  }, [state]);

  const fieldErrors: InquiryFieldErrors =
    clientErrors ?? (state.status === "invalid" ? state.fieldErrors : {});
  const errorList = INQUIRY_FIELDS.filter((field) => fieldErrors[field]);

  function readForm(): Record<string, string> {
    const data = new FormData(formRef.current!);
    const out: Record<string, string> = {};
    for (const [key, value] of data.entries()) if (typeof value === "string") out[key] = value;
    return out;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const parsed = parseInquiry(readForm());
    if (!parsed.success) {
      setClientErrors(parsed.fieldErrors);
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setClientErrors(null);

    if (captcha.mode === "turnstile" && !captchaToken) {
      setCaptchaMissing(true);
      return;
    }
    setCaptchaMissing(false);

    const formData = new FormData(event.currentTarget);
    submissionKey.current ??= crypto.randomUUID();
    formData.set("submissionKey", submissionKey.current);
    formData.set("locale", locale);
    if (captchaToken) formData.set("cf-turnstile-response", captchaToken);
    startTransition(() => dispatch(formData));
  }

  // After a failed submit, re-validate as the visitor corrects fields.
  function onChange() {
    if (clientErrors) {
      const parsed = parseInquiry(readForm());
      setClientErrors(parsed.success ? {} : parsed.fieldErrors);
    }
  }

  if (state.status === "success") {
    return (
      <div
        ref={resultRef}
        tabIndex={-1}
        role="status"
        className="scroll-mt-28 space-y-5 rounded-3xl border border-border bg-surface p-7 outline-none sm:p-10"
      >
        <CheckCircle2 aria-hidden className="size-8 text-success" />
        <h2 className="display-md">{t("successTitle")}</h2>
        <p className="text-muted-foreground">{t("successBody")}</p>
        <div className="rounded-2xl bg-surface-muted p-5">
          <p className="text-sm font-semibold">{t("referenceLabel")}</p>
          <p className="mt-1 font-mono text-2xl font-semibold tracking-wider" data-testid="inquiry-reference">
            {state.reference}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{t("referenceHint")}</p>
        </div>
        <Button variant="outline" onClick={() => window.location.reload()}>
          {t("newInquiry")}
        </Button>
      </div>
    );
  }

  const error = (field: InquiryField) => (fieldErrors[field] ? t(`errors.${fieldErrors[field]}`) : undefined);
  const ids = (field: InquiryField) => `inquiry-${field}`;
  const phoneRequired = contactMethod !== "email";

  return (
    <form
      ref={formRef}
      method="post"
      noValidate
      onSubmit={onSubmit}
      onChange={onChange}
      className="space-y-10"
    >
      {captcha.mode === "local-bypass" && (
        <p className="flex items-start gap-2.5 rounded-xl border border-dashed border-warning/60 p-3.5 text-sm text-warning">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t("localBypassNotice")}
        </p>
      )}

      {errorList.length > 0 && (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="scroll-mt-28 rounded-2xl border border-danger/40 bg-danger/8 p-5 outline-none"
        >
          <p className="flex items-center gap-2 font-semibold text-danger">
            <AlertCircle aria-hidden className="size-4" />
            {t("errorSummaryTitle", { count: errorList.length })}
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-6 text-sm">
            {errorList.map((field) => (
              <li key={field}>
                <a href={`#${ids(field)}`} className="underline underline-offset-2 hover:text-danger">
                  {field === "consent" ? t("errors.consentRequired") : fieldLabel(t, field)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ServerMessage state={state} resultRef={resultRef} />

      <p className="text-sm text-muted-foreground">{t("requiredHint")}</p>

      <Section title={t("sectionYou")}>
        <Field id={ids("fullName")} label={t("fullName")} required error={error("fullName")}>
          <Input
            {...fieldAria(ids("fullName"), { error: error("fullName") })}
            name="fullName"
            autoComplete="name"
            maxLength={INQUIRY_LIMITS.nameMax}
            required
          />
        </Field>
        <Field id={ids("email")} label={t("email")} required error={error("email")}>
          <Input
            {...fieldAria(ids("email"), { error: error("email") })}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={INQUIRY_LIMITS.emailMax}
            required
          />
        </Field>
        <Field id={ids("contactMethod")} label={t("contactMethod")} error={error("contactMethod")}>
          <NativeSelect
            {...fieldAria(ids("contactMethod"), { error: error("contactMethod") })}
            name="contactMethod"
            value={contactMethod}
            onChange={(event) => setContactMethod(event.target.value)}
          >
            {CONTACT_METHODS.map((method) => (
              <option key={method} value={method}>
                {tContact(method)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          id={ids("phone")}
          label={t("phone")}
          required={phoneRequired}
          optionalLabel={t("optional")}
          hint={t("phoneHint")}
          error={error("phone")}
        >
          <Input
            {...fieldAria(ids("phone"), { hint: true, error: error("phone") })}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={INQUIRY_LIMITS.phoneMax}
            required={phoneRequired}
          />
        </Field>
      </Section>

      <Section title={t("sectionEvent")}>
        <Field id={ids("eventType")} label={t("eventType")} required error={error("eventType")}>
          <NativeSelect
            {...fieldAria(ids("eventType"), { error: error("eventType") })}
            name="eventType"
            defaultValue=""
            required
          >
            <option value="" disabled>
              {t("eventTypePlaceholder")}
            </option>
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {tEvent(type)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            id={ids("eventDate")}
            label={t("eventDate")}
            optionalLabel={t("optional")}
            hint={t("eventDateHint")}
            error={error("eventDate")}
          >
            <Input
              {...fieldAria(ids("eventDate"), { hint: true, error: error("eventDate") })}
              name="eventDate"
              type="date"
              min={dateBounds?.min}
              max={dateBounds?.max}
            />
          </Field>
          <Field id={ids("guestCount")} label={t("guestCount")} required error={error("guestCount")}>
            <Input
              {...fieldAria(ids("guestCount"), { error: error("guestCount") })}
              name="guestCount"
              type="number"
              inputMode="numeric"
              min={INQUIRY_LIMITS.guestsMin}
              max={INQUIRY_LIMITS.guestsMax}
              step={1}
              required
            />
          </Field>
        </div>
        <Field
          id={ids("venue")}
          label={t("venue")}
          optionalLabel={t("optional")}
          hint={t("venueHint")}
          error={error("venue")}
        >
          <Input
            {...fieldAria(ids("venue"), { hint: true, error: error("venue") })}
            name="venue"
            autoComplete="off"
            maxLength={INQUIRY_LIMITS.venueMax}
          />
        </Field>
      </Section>

      <Section title={t("sectionNeeds")}>
        <Field
          id={ids("requirements")}
          label={t("requirements")}
          required
          hint={t("requirementsHint")}
          error={error("requirements")}
        >
          <Textarea
            {...fieldAria(ids("requirements"), { hint: true, error: error("requirements") })}
            name="requirements"
            rows={5}
            maxLength={INQUIRY_LIMITS.requirementsMax}
            required
          />
        </Field>
        <Field
          id={ids("message")}
          label={t("message")}
          optionalLabel={t("optional")}
          error={error("message")}
        >
          <Textarea
            {...fieldAria(ids("message"), { error: error("message") })}
            name="message"
            rows={4}
            maxLength={INQUIRY_LIMITS.messageMax}
          />
        </Field>
      </Section>

      {/* Honeypot: hidden from people and assistive technology; bots tend to fill it. */}
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <div className="space-y-6 border-t border-border pt-8">
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
                  </Link>
                ),
              })}
              <span aria-hidden className="ml-0.5 text-terracotta">
                *
              </span>
            </span>
          </label>
          {error("consent") && (
            <p id={`${ids("consent")}-error`} className="text-sm font-medium text-danger">
              {error("consent")}
            </p>
          )}
        </div>

        {captcha.mode === "turnstile" && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">{t("captchaLabel")}</p>
            <TurnstileWidget
              key={captchaGeneration}
              siteKey={captcha.siteKey}
              action="inquiry"
              onToken={(token) => {
                setCaptchaToken(token);
                if (token) setCaptchaMissing(false);
              }}
            />
            {captchaMissing && (
              <p role="alert" className="text-sm font-medium text-danger">
                {t("captchaFailed")}
              </p>
            )}
          </div>
        )}

        <Button
          type="submit"
          size="lg"
          disabled={pending || !hydrated}
          aria-disabled={pending || !hydrated}
          className="w-full sm:w-auto"
        >
          {pending && <LoaderCircle aria-hidden className="animate-spin" />}
          {pending ? t("submitting") : t("submit")}
        </Button>
      </div>
    </form>
  );
}

function fieldLabel(t: ReturnType<typeof useTranslations<"Booking">>, field: InquiryField): string {
  switch (field) {
    case "fullName":
      return t("fullName");
    case "email":
      return t("email");
    case "phone":
      return t("phone");
    case "contactMethod":
      return t("contactMethod");
    case "eventType":
      return t("eventType");
    case "eventDate":
      return t("eventDate");
    case "guestCount":
      return t("guestCount");
    case "venue":
      return t("venue");
    case "requirements":
      return t("requirements");
    case "message":
      return t("message");
    case "consent":
      return t("errors.consentRequired");
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-6">
      <legend className="mb-6 display-md">{title}</legend>
      {children}
    </fieldset>
  );
}

function ServerMessage({
  state,
  resultRef,
}: {
  state: ClientState;
  resultRef: RefObject<HTMLDivElement | null>;
}) {
  const t = useTranslations("Booking");
  let message: string | null = null;
  switch (state.status) {
    case "rate_limited":
      message = t("rateLimited", { minutes: state.retryAfterMinutes });
      break;
    case "captcha_failed":
      message = t("captchaFailed");
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
      className="flex scroll-mt-28 items-start gap-2.5 rounded-2xl border border-danger/40 bg-danger/8 p-5 text-sm text-danger outline-none"
    >
      <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
      {message}
    </div>
  );
}
