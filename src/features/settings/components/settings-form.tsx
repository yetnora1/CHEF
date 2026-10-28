"use client";

import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, fieldAria, Input } from "@/components/ui/form-controls";
import { useUnsavedGuard } from "@/features/cms/components/admin/use-unsaved-guard";
import { cn } from "@/lib/utils";
import { saveSettingsAction, type SettingsActionState } from "../actions";
import type { SiteSettings } from "../admin-data";
import { SETTINGS_LIMITS, SOCIAL_PLATFORMS, type SettingsTextField } from "../schema";

const IDLE: SettingsActionState = { status: "idle" };

type FieldSpec = {
  name: SettingsTextField;
  type?: "email" | "tel" | "url";
  maxLength: number;
  lang?: "am";
};

const CONTACT_FIELDS: FieldSpec[] = [
  { name: "contact_email", type: "email", maxLength: SETTINGS_LIMITS.email },
  { name: "contact_phone", type: "tel", maxLength: SETTINGS_LIMITS.phone },
  { name: "whatsapp_phone", type: "tel", maxLength: SETTINGS_LIMITS.phone },
  { name: "telegram_username", maxLength: 64 },
];

const SOCIAL_FIELDS: FieldSpec[] = SOCIAL_PLATFORMS.map((platform) => ({
  name: `${platform}_url`,
  type: "url",
  maxLength: SETTINGS_LIMITS.link,
}));

/**
 * The site settings form. Fields are uncontrolled (the saved values are their
 * defaults); the server validates and normalises everything again.
 */
export function SettingsForm({
  settings,
  reviewedOn,
  lastSaved,
}: {
  settings: SiteSettings;
  /** When the Amharic location was reviewed, formatted on the server. */
  reviewedOn: string | null;
  /** "Last saved" line, formatted on the server. */
  lastSaved: string | null;
}) {
  const t = useTranslations("AdminSettings");
  const [state, dispatch, pending] = useActionState(saveSettingsAction, IDLE);
  const formRef = useRef<HTMLFormElement>(null);
  const resultRef = useRef<HTMLParagraphElement>(null);
  const [dirty, setDirty] = useState(false);
  const [seen, setSeen] = useState(state);
  const [review, setReview] = useState(settings.location_am_reviewed_at !== null);
  const [amharicEmpty, setAmharicEmpty] = useState(!settings.location_am);
  const [open, setOpen] = useState(settings.inquiries_open);
  const [confirmPause, setConfirmPause] = useState(false);
  useUnsavedGuard(dirty, t("unsavedChanges"));

  if (state !== seen) {
    setSeen(state);
    if (state.status === "success") setDirty(false);
  }

  // Move focus to the outcome so it is announced, and the first invalid field after it.
  useEffect(() => {
    if (state.status === "idle") return;
    requestAnimationFrame(() => {
      if (state.status === "error" && state.fieldErrors) {
        const first = Object.keys(state.fieldErrors)[0];
        const field = first ? formRef.current?.elements.namedItem(first) : null;
        if (field instanceof HTMLElement) {
          field.focus();
          return;
        }
      }
      resultRef.current?.focus();
    });
  }, [state]);

  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const version = state.status === "success" ? state.version : settings.version;

  function submit() {
    setConfirmPause(false);
    const form = formRef.current;
    if (form) startTransition(() => dispatch(new FormData(form)));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    // Pausing inquiries changes the public site at once, so it is confirmed first.
    if (settings.inquiries_open && !open) setConfirmPause(true);
    else submit();
  }

  function onInput(event: FormEvent<HTMLFormElement>) {
    setDirty(true);
    const target = event.target as HTMLInputElement;
    if (target.name === "location_am") {
      // Changed Amharic text is no longer the reviewed text.
      setReview(false);
      setAmharicEmpty(target.value.trim() === "");
    }
  }

  const text = (spec: FieldSpec) => {
    const id = `settings-${spec.name}`;
    const error = fieldErrors?.[spec.name];
    const hint = t.has(`hints.${spec.name}`) ? t(`hints.${spec.name}`) : undefined;
    const errorText = error ? t(`fieldErrors.${error}`) : undefined;
    return (
      <Field key={spec.name} id={id} label={t(`labels.${spec.name}`)} hint={hint} error={errorText}>
        <Input
          {...fieldAria(id, { hint, error: errorText })}
          name={spec.name}
          type={spec.type ?? "text"}
          inputMode={spec.type === "tel" ? "tel" : undefined}
          autoComplete="off"
          spellCheck={spec.type ? false : undefined}
          lang={spec.lang}
          maxLength={spec.maxLength}
          defaultValue={settings[spec.name] ?? ""}
        />
      </Field>
    );
  };

  return (
    <form ref={formRef} noValidate onSubmit={onSubmit} onInput={onInput} className="space-y-6">
      <input type="hidden" name="version" value={version} />

      <Section id="inquiries" title={t("sections.inquiries")} intro={t("intros.inquiries")}>
        <label className="flex cursor-pointer items-start justify-between gap-6 rounded-xl border border-border bg-glass-raised p-4">
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{t("labels.inquiries_open")}</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              {open ? t("inquiriesOpenHint") : t("inquiriesPausedHint")}
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            name="inquiries_open"
            checked={open}
            onChange={(event) => setOpen(event.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full border border-border-strong bg-surface-muted transition-colors peer-checked:border-transparent peer-checked:bg-action-bottom peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring after:absolute after:top-0.5 after:left-0.5 after:size-4.5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-5 motion-reduce:transition-none motion-reduce:after:transition-none"
          />
        </label>
      </Section>

      <Section id="contact" title={t("sections.contact")} intro={t("intros.contact")}>
        <div className="grid gap-5 sm:grid-cols-2">{CONTACT_FIELDS.map(text)}</div>
      </Section>

      <Section id="location" title={t("sections.location")} intro={t("intros.location")}>
        <div className="grid gap-5 sm:grid-cols-2">
          {text({ name: "location_en", maxLength: SETTINGS_LIMITS.location })}
          {text({ name: "location_am", maxLength: SETTINGS_LIMITS.location, lang: "am" })}
        </div>
        <div className="mt-5 rounded-xl border border-accent/50 bg-glass-raised p-4">
          <label className={cn("flex items-start gap-3 text-sm", amharicEmpty && "opacity-65")}>
            <input
              type="checkbox"
              name="location_am_reviewed"
              checked={review && !amharicEmpty}
              disabled={amharicEmpty}
              onChange={(event) => setReview(event.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-action-bottom"
            />
            <span>
              <span className="block font-semibold">{t("review.label")}</span>
              <span className="mt-1 block text-muted-foreground">{t("review.help")}</span>
            </span>
          </label>
          {settings.location_am_reviewed_at && review && reviewedOn && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("review.reviewedOn", { date: reviewedOn })}
            </p>
          )}
          {settings.location_am_reviewed_at && !review && !amharicEmpty && (
            <p className="mt-2 text-xs font-semibold text-terracotta">{t("review.cleared")}</p>
          )}
        </div>
      </Section>

      <Section id="social" title={t("sections.social")} intro={t("intros.social")}>
        <div className="grid gap-5 sm:grid-cols-2">{SOCIAL_FIELDS.map(text)}</div>
      </Section>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border glass-thick p-4">
        <Button type="submit" variant="action" disabled={pending}>
          {pending && <LoaderCircle aria-hidden className="animate-spin" />}
          {pending ? t("saving") : t("save")}
        </Button>
        {dirty && state.status !== "error" && (
          <span className="text-sm text-muted-foreground">{t("unsaved")}</span>
        )}
        <Outcome state={state} resultRef={resultRef} />
        {lastSaved && !dirty && state.status === "idle" && (
          <span className="text-sm text-muted-foreground">{lastSaved}</span>
        )}
      </div>

      <AlertDialog open={confirmPause} onOpenChange={setConfirmPause}>
        <AlertDialogContent
          title={t("confirmPause.title")}
          description={t("confirmPause.body")}
          cancelLabel={t("cancel")}
          confirmLabel={t("confirmPause.confirm")}
          onConfirm={submit}
        />
      </AlertDialog>
    </form>
  );
}

function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`settings-${id}-heading`}
      className="rounded-2xl border border-border glass p-5 sm:p-6"
    >
      <h2 id={`settings-${id}-heading`} className="font-semibold">
        {title}
      </h2>
      <p className="mt-1 mb-5 max-w-2xl text-sm text-muted-foreground">{intro}</p>
      {children}
    </section>
  );
}

function Outcome({
  state,
  resultRef,
}: {
  state: SettingsActionState;
  resultRef: RefObject<HTMLParagraphElement | null>;
}) {
  const t = useTranslations("AdminSettings");
  if (state.status === "idle") return null;
  const ok = state.status === "success";
  return (
    <p
      ref={resultRef}
      tabIndex={-1}
      role={ok ? "status" : "alert"}
      className={cn(
        "flex items-center gap-2 text-sm font-medium outline-none",
        ok ? "text-success" : "text-danger",
      )}
    >
      {ok ? <CheckCircle2 aria-hidden className="size-4" /> : <AlertCircle aria-hidden className="size-4" />}
      {ok ? t("saved") : t(`errors.${state.error}`)}
    </p>
  );
}
