"use client";

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Check,
  CheckCircle2,
  ChefHat,
  Copy,
  ExternalLink,
  Heart,
  LoaderCircle,
  Mail,
  MessageCircle,
  Minus,
  Phone,
  Plus,
  Presentation,
  Sparkles,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
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
import { Field, fieldAria, Input, Textarea } from "@/components/ui/form-controls";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import {
  businessToday,
  eventDateBounds,
  INQUIRY_FIELDS,
  INQUIRY_LIMITS,
  parseInquiry,
  type InquiryField,
  type InquiryFieldErrors,
} from "../inquiry-schema";
import { CONTACT_METHODS, EVENT_TYPES, type ContactMethod, type EventType } from "../status";
import type { InquiryFormState } from "../server/submission";
import { submitInquiryAction } from "../submit-action";
import { TurnstileWidget } from "./turnstile-widget";

/** Turnstile runs only when its optional keys are configured (server/config.ts). */
export type InquiryCaptcha = { mode: "turnstile"; siteKey: string } | { mode: "none" };

type ClientState = InquiryFormState | { status: "network_error" };

const IDLE: ClientState = { status: "idle" };

/** The three steps, and the fields each one owns: an error sends the visitor back to its step. */
const STEPS = [
  { title: "sectionEvent", fields: ["eventType", "eventDate", "guestCount", "venue"] },
  { title: "sectionNeeds", fields: ["requirements", "message"] },
  { title: "sectionYou", fields: ["fullName", "email", "contactMethod", "phone", "consent"] },
] as const satisfies readonly { title: string; fields: readonly InquiryField[] }[];

const LAST_STEP = STEPS.length - 1;

const EVENT_ICONS: Record<EventType, LucideIcon> = {
  wedding: Heart,
  corporate: Briefcase,
  summit: Presentation,
  private_dining: UtensilsCrossed,
  culinary_experience: ChefHat,
  other: Sparkles,
};

const CONTACT_ICONS: Record<ContactMethod, LucideIcon> = {
  email: Mail,
  phone: Phone,
  messaging_app: MessageCircle,
};

/** The −/+ buttons change the guest count in steps of ten. */
const GUEST_STEP = 10;

function stepOf(field: InquiryField): number {
  return STEPS.findIndex((step) => (step.fields as readonly InquiryField[]).includes(field));
}

/** Only the errors that belong to one step. */
function errorsIn(errors: InquiryFieldErrors, step: number): InquiryFieldErrors {
  const own: readonly InquiryField[] = STEPS[step]!.fields;
  return Object.fromEntries(Object.entries(errors).filter(([field]) => own.includes(field as InquiryField)));
}

// "Tomorrow" depends on the visitor's clock, not on when the page was
// prerendered, so it is read on the client only (null during SSR).
let boundsCache: { day: string; value: { min: string; max: string } } | null = null;
function clientDateBounds() {
  const day = businessToday();
  if (boundsCache?.day !== day) boundsCache = { day, value: eventDateBounds() };
  return boundsCache.value;
}
const subscribeNever = () => () => {};

/**
 * The event inquiry, in three short steps: the event, what is needed, and who is
 * asking (with a review of the first two before sending). All fields live in one
 * form, so going back never loses anything; each step is validated before the
 * next, and the server validates everything again.
 */
export function InquiryForm({ locale, captcha }: { locale: AppLocale; captcha: InquiryCaptcha }) {
  const t = useTranslations("Booking");
  const tEvent = useTranslations("EventType");
  const tContact = useTranslations("ContactMethod");

  // Idempotency key: reused for retries of the same inquiry, replaced after success.
  const submissionKey = useRef<string | null>(null);
  const [step, setStep] = useState(0);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaGeneration, setCaptchaGeneration] = useState(0);
  const [clientErrors, setClientErrors] = useState<InquiryFieldErrors | null>(null);
  const [captchaMissing, setCaptchaMissing] = useState(false);
  const [contactMethod, setContactMethod] = useState<string>("email");
  const [guests, setGuests] = useState("");
  // What the visitor entered in the first two steps, shown for review in the last.
  const [review, setReview] = useState<Record<string, string>>({});
  const dateBounds = useSyncExternalStore(subscribeNever, clientDateBounds, () => null);
  // Until React has hydrated, a native submit would bypass the action, so the
  // buttons stay disabled (and method="post" keeps fields out of the URL).
  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const stepChanged = useRef(false);

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
    // The server found a problem: show the first step that has one.
    if (next.status === "invalid") {
      const first = INQUIRY_FIELDS.find((field) => next.status === "invalid" && next.fieldErrors[field]);
      if (first) {
        stepChanged.current = false;
        setStep(stepOf(first));
      }
    }
    // A new idempotency key only once this inquiry is safely stored.
    if (next.status === "success") submissionKey.current = null;
    return next;
  }, IDLE);

  // Each new step is announced by moving focus to its heading.
  useEffect(() => {
    if (stepChanged.current) headingRef.current?.focus();
  }, [step]);

  // Move focus to the outcome so keyboard and screen-reader users hear it.
  useEffect(() => {
    if (state.status === "idle") return;
    if (state.status === "invalid") summaryRef.current?.focus();
    else resultRef.current?.focus();
  }, [state]);

  const shownErrors: InquiryFieldErrors =
    clientErrors ?? (state.status === "invalid" ? errorsIn(state.fieldErrors, step) : {});
  const errorList = INQUIRY_FIELDS.filter((field) => shownErrors[field]);

  function readForm(overrides: Record<string, string> = {}): Record<string, string> {
    const data = new FormData(formRef.current!);
    const out: Record<string, string> = {};
    for (const [key, value] of data.entries()) if (typeof value === "string") out[key] = value;
    return { ...out, ...overrides };
  }

  function validate(index: number, overrides?: Record<string, string>): InquiryFieldErrors {
    const parsed = parseInquiry(readForm(overrides));
    return parsed.success ? {} : errorsIn(parsed.fieldErrors, index);
  }

  function showErrors(errors: InquiryFieldErrors) {
    setClientErrors(errors);
    requestAnimationFrame(() => summaryRef.current?.focus());
  }

  /** Shows another step; `announce` moves focus to its heading (not when errors take focus instead). */
  function goTo(index: number, announce = true) {
    if (index === LAST_STEP) setReview(readForm());
    stepChanged.current = announce;
    setClientErrors(null);
    setStep(index);
  }

  function next() {
    const errors = validate(step);
    if (Object.keys(errors).length > 0) return showErrors(errors);
    goTo(step + 1);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    // Enter in an earlier step moves on rather than sending.
    if (step < LAST_STEP) return next();

    const parsed = parseInquiry(readForm());
    if (!parsed.success) {
      const first = INQUIRY_FIELDS.find((field) => parsed.fieldErrors[field])!;
      const index = stepOf(first);
      if (index !== step) goTo(index, false);
      return showErrors(errorsIn(parsed.fieldErrors, index));
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

  // After a failed attempt, re-validate as the visitor corrects fields.
  function onChange() {
    if (clientErrors) setClientErrors(validate(step));
  }

  function changeGuests(delta: number) {
    const current = Number.parseInt(guests, 10);
    const base = Number.isFinite(current) ? current : 0;
    const value = Math.min(INQUIRY_LIMITS.guestsMax, Math.max(INQUIRY_LIMITS.guestsMin, base + delta));
    setGuests(String(value));
    if (clientErrors) setClientErrors(validate(step, { guestCount: String(value) }));
  }

  if (state.status === "success") {
    return (
      <div
        ref={resultRef}
        tabIndex={-1}
        role="status"
        className="scroll-mt-28 space-y-5 rounded-3xl border border-border glass p-7 outline-none sm:p-10"
      >
        <span className="flex size-12 items-center justify-center rounded-full bg-success/12 text-success">
          <CheckCircle2 aria-hidden className="size-7" />
        </span>
        <h2 className="display-md">{t("successTitle")}</h2>
        <p className="text-muted-foreground">{t("successBody")}</p>
        <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl bg-surface-muted p-5">
          <div>
            <p className="text-sm font-semibold">{t("referenceLabel")}</p>
            <p
              className="mt-1 font-mono text-2xl font-semibold tracking-wider"
              data-testid="inquiry-reference"
            >
              {state.reference}
            </p>
          </div>
          <CopyButton value={state.reference} labels={{ copy: t("copyReference"), copied: t("copied") }} />
          <p className="w-full text-sm text-muted-foreground">{t("referenceHint")}</p>
        </div>
        <Button variant="outline" onClick={() => window.location.reload()}>
          {t("newInquiry")}
        </Button>
      </div>
    );
  }

  const error = (field: InquiryField) => (shownErrors[field] ? t(`errors.${shownErrors[field]}`) : undefined);
  const ids = (field: InquiryField) => `inquiry-${field}`;
  const phoneRequired = contactMethod !== "email";
  const disabled = pending || !hydrated;

  return (
    <form
      ref={formRef}
      method="post"
      noValidate
      onSubmit={onSubmit}
      onChange={onChange}
      className="rounded-3xl border border-border glass p-5 sm:p-8"
    >
      <Progress
        step={step}
        onSelect={(index) => goTo(index)}
        label={t("stepsLabel")}
        titles={STEPS.map((s) => t(s.title))}
      />

      <div className="mt-8 space-y-6">
        <div>
          <p className="text-sm font-semibold text-accent-ink">
            {t("stepCounter", { current: step + 1, total: STEPS.length })}
          </p>
          <h2 ref={headingRef} tabIndex={-1} className="mt-1 display-md outline-none">
            {t(STEPS[step]!.title)}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("requiredHint")}</p>
        </div>

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

        {/* Step 1: the event. Steps stay in the form while hidden, so nothing is lost going back. */}
        <div hidden={step !== 0} className="space-y-6">
          <ChoiceGroup
            id={ids("eventType")}
            name="eventType"
            legend={t("eventType")}
            required
            error={error("eventType")}
            columns="grid-cols-2 sm:grid-cols-3"
            options={EVENT_TYPES.map((type) => ({
              value: type,
              label: tEvent(type),
              Icon: EVENT_ICONS[type],
            }))}
          />
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
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-12 rounded-xl"
                  aria-label={t("guestsFewer")}
                  onClick={() => changeGuests(-GUEST_STEP)}
                >
                  <Minus aria-hidden />
                </Button>
                <Input
                  {...fieldAria(ids("guestCount"), { error: error("guestCount") })}
                  name="guestCount"
                  type="number"
                  inputMode="numeric"
                  min={INQUIRY_LIMITS.guestsMin}
                  max={INQUIRY_LIMITS.guestsMax}
                  step={1}
                  required
                  value={guests}
                  onChange={(event) => setGuests(event.target.value)}
                  className="h-12 min-w-0 text-center tabular-nums"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-12 rounded-xl"
                  aria-label={t("guestsMore")}
                  onClick={() => changeGuests(GUEST_STEP)}
                >
                  <Plus aria-hidden />
                </Button>
              </div>
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
        </div>

        {/* Step 2: what is needed. */}
        <div hidden={step !== 1} className="space-y-6">
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
              rows={6}
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
        </div>

        {/* Step 3: who is asking, a review, consent and send. */}
        <div hidden={step !== LAST_STEP} className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
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
          </div>
          <ChoiceGroup
            id={ids("contactMethod")}
            name="contactMethod"
            legend={t("contactMethod")}
            error={error("contactMethod")}
            columns="sm:grid-cols-3"
            compact
            defaultValue="email"
            onValueChange={setContactMethod}
            options={CONTACT_METHODS.map((method) => ({
              value: method,
              label: tContact(method),
              Icon: CONTACT_ICONS[method],
            }))}
          />
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

          <Review
            values={review}
            locale={locale}
            onEdit={(index) => goTo(index)}
            labels={{
              title: t("reviewTitle"),
              edit: t("edit"),
              notGiven: t("notGiven"),
              event: t("sectionEvent"),
              needs: t("sectionNeeds"),
              eventType: t("eventType"),
              eventDate: t("eventDate"),
              guestCount: t("guestCount"),
              venue: t("venue"),
              requirements: t("requirements"),
              message: t("message"),
            }}
            eventTypeLabel={(type) => tEvent(type)}
          />

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
        </div>

        {/* Honeypot: hidden from people and assistive technology; bots tend to fill it. */}
        <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
          <label>
            Website
            <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
          {step > 0 ? (
            <Button type="button" variant="outline" onClick={() => goTo(step - 1)} disabled={pending}>
              <ArrowLeft aria-hidden className="motion-safe:group-hover/button:-translate-x-0.5" />
              {t("back")}
            </Button>
          ) : (
            <span />
          )}
          {step < LAST_STEP ? (
            <Button type="button" variant="primary" size="lg" onClick={next} disabled={disabled}>
              {t("next")}
              <ArrowRight aria-hidden className="motion-safe:group-hover/button:translate-x-0.5" />
            </Button>
          ) : (
            <Button type="submit" variant="primary" size="lg" disabled={disabled} aria-disabled={disabled}>
              {pending && <LoaderCircle aria-hidden className="animate-spin" />}
              {pending ? t("submitting") : t("submit")}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

/** The step indicator: a bar per step that fills as the visitor moves on; done steps can be revisited. */
function Progress({
  step,
  onSelect,
  label,
  titles,
}: {
  step: number;
  onSelect: (index: number) => void;
  label: string;
  titles: string[];
}) {
  return (
    <ol aria-label={label} className="grid grid-cols-3 gap-2 sm:gap-3">
      {titles.map((title, index) => {
        const done = index < step;
        const current = index === step;
        const content = (
          <>
            <span
              className={cn(
                "block h-1.5 rounded-full transition-colors duration-260",
                done || current ? "bg-linear-to-r from-cta-top to-cta-bottom" : "bg-surface-muted",
              )}
            />
            <span className="mt-2.5 flex items-center gap-2 text-left">
              <span
                aria-hidden
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                  done || current
                    ? "bg-cta-bottom text-cta-foreground"
                    : "border border-border-strong text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3.5" /> : index + 1}
              </span>
              <span
                className={cn(
                  "truncate text-xs font-semibold sm:text-sm",
                  current ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {title}
              </span>
            </span>
          </>
        );
        return (
          <li key={title} aria-current={current ? "step" : undefined} className="min-w-0">
            {done ? (
              <button
                type="button"
                onClick={() => onSelect(index)}
                className="block w-full cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
              >
                {content}
              </button>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ol>
  );
}

type Choice = { value: string; label: string; Icon: LucideIcon };

/**
 * A radio group drawn as cards. Each card's radio button covers the whole card
 * (transparent), so a click or tap anywhere selects it and the arrow keys move
 * between cards as in any radio group.
 */
function ChoiceGroup({
  id,
  name,
  legend,
  required,
  error,
  columns,
  options,
  compact = false,
  defaultValue,
  onValueChange,
}: {
  id: string;
  name: string;
  legend: string;
  required?: boolean;
  error?: string;
  columns: string;
  options: Choice[];
  /** One line per card (icon beside the label) for short, secondary choices. */
  compact?: boolean;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}) {
  const errorId = `${id}-error`;
  return (
    <fieldset
      role="radiogroup"
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
      className="space-y-3"
    >
      <legend className="text-sm font-semibold">
        {legend}
        {required && (
          <span aria-hidden className="ml-0.5 text-terracotta">
            *
          </span>
        )}
      </legend>
      <div className={cn("grid gap-3", columns)}>
        {options.map(({ value, label, Icon }, index) => (
          <label
            key={value}
            className={cn(
              "group/choice relative flex rounded-2xl border border-border bg-glass-raised text-sm leading-snug font-semibold shadow-xs inset-shadow-glass transition-[border-color,box-shadow,background-color] duration-200 hover:border-border-strong has-checked:border-cta-bottom has-checked:bg-glass-raised-hover has-checked:shadow-md has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
              compact
                ? "min-h-14 items-center gap-3 py-3 pr-10 pl-4"
                : "min-h-24 flex-col justify-between gap-3 p-4",
            )}
          >
            <input
              id={index === 0 ? id : undefined}
              type="radio"
              name={name}
              value={value}
              defaultChecked={value === defaultValue}
              required={required}
              onChange={(event) => onValueChange?.(event.target.value)}
              className="absolute inset-0 cursor-pointer appearance-none rounded-2xl opacity-0"
            />
            <Icon
              aria-hidden
              className={cn(
                "shrink-0 text-accent-ink group-has-checked/choice:text-cta-bottom",
                compact ? "size-5" : "size-6",
              )}
            />
            <span>{label}</span>
            <CheckCircle2
              aria-hidden
              className={cn(
                "absolute right-3 size-5 text-cta-bottom opacity-0 transition-opacity group-has-checked/choice:opacity-100",
                compact ? "inset-y-0 my-auto" : "top-3",
              )}
            />
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}

type ReviewLabels = {
  title: string;
  edit: string;
  notGiven: string;
  event: string;
  needs: string;
  eventType: string;
  eventDate: string;
  guestCount: string;
  venue: string;
  requirements: string;
  message: string;
};

/** The first two steps at a glance before sending, each with a way back to change it. */
function Review({
  values,
  locale,
  onEdit,
  labels,
  eventTypeLabel,
}: {
  values: Record<string, string>;
  locale: AppLocale;
  onEdit: (step: number) => void;
  labels: ReviewLabels;
  eventTypeLabel: (type: EventType) => string;
}) {
  const type = (EVENT_TYPES as readonly string[]).includes(values.eventType ?? "")
    ? eventTypeLabel(values.eventType as EventType)
    : "";
  const date = values.eventDate
    ? new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(
        new Date(`${values.eventDate}T00:00:00Z`),
      )
    : "";
  const sections: { title: string; step: number; rows: [string, string | undefined][] }[] = [
    {
      title: labels.event,
      step: 0,
      rows: [
        [labels.eventType, type],
        [labels.eventDate, date],
        [labels.guestCount, values.guestCount],
        [labels.venue, values.venue],
      ],
    },
    {
      title: labels.needs,
      step: 1,
      rows: [
        [labels.requirements, values.requirements],
        [labels.message, values.message],
      ],
    },
  ];

  return (
    <section
      aria-label={labels.title}
      className="rounded-2xl border border-border bg-surface-muted p-4 sm:p-5"
    >
      <h3 className="text-sm font-semibold">{labels.title}</h3>
      <div className="mt-3 divide-y divide-border">
        {sections.map((section) => (
          <div key={section.title} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-muted-foreground">{section.title}</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2.5"
                aria-label={`${labels.edit}: ${section.title}`}
                onClick={() => onEdit(section.step)}
              >
                {labels.edit}
              </Button>
            </div>
            <dl className="mt-1 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[minmax(0,12rem)_1fr]">
              {section.rows.map(([term, value]) => (
                <ReviewRow key={term} term={term} value={value} notGiven={labels.notGiven} />
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReviewRow({ term, value, notGiven }: { term: string; value?: string; notGiven: string }) {
  const text = value?.trim();
  return (
    <>
      <dt className="text-muted-foreground">{term}</dt>
      <dd className={cn("min-w-0 break-words whitespace-pre-line", !text && "text-muted-foreground")}>
        {text ? <span className="line-clamp-3">{text}</span> : notGiven}
      </dd>
    </>
  );
}

function CopyButton({ value, labels }: { value: string; labels: { copy: string; copied: string } }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard refused (permissions): the reference stays on screen to copy by hand.
        }
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      <span aria-live="polite">{copied ? labels.copied : labels.copy}</span>
    </Button>
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

function ServerMessage({
  state,
  resultRef,
}: {
  state: ClientState;
  resultRef: RefObject<HTMLDivElement | null>;
}): ReactNode {
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
    case "paused":
      message = t("pausedBody");
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
