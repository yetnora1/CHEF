"use client";

import { CheckCircle2, LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { startTransition, useActionState, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  changeStatusAction,
  createEntryAction,
  deleteEntryAction,
  saveEntityAction,
  saveTranslationAction,
  setPageImageAction,
  type CmsActionState,
} from "../../actions";
import {
  CONTENT,
  STATUS_ACTIONS,
  needsPublishPermission,
  type ContentType,
  type EntryImage,
  type PublicationStatus,
} from "../../content-types";
import {
  fieldHintKey,
  fieldLabelKey,
  imageSlotKey,
  sectionFieldKey,
  sectionTitleKey,
} from "../../message-keys";
import { isPageKey, PAGES, type PageKey } from "../../pages";
import { sectionFieldName } from "../../schemas";
import { adminImageUrl } from "../../media-urls";
import { FieldControl, FieldGroup, MediaPicker, type PickedImage } from "./fields";
import { useUnsavedGuard } from "./use-unsaved-guard";

/*
 * CMS forms. They only collect input: every action re-authorizes on the server
 * and the database checks again. Success is shown only after the server
 * confirms; errors are announced (role="alert") and summarised at the top.
 */

const IDLE: CmsActionState = { status: "idle" };

/**
 * The version to send with the next save. Forms are not remounted after a
 * save (that would drop the confirmation), so the props catch up only after
 * the refresh; versions only grow, so the larger one is current.
 */
export function latestVersion(state: CmsActionState, version: number) {
  return state.status === "success" ? Math.max(state.version, version) : version;
}

export type Permissions = { write: boolean; translate: boolean; publish: boolean };

function ActionMessage({ state, success }: { state: CmsActionState; success: string }) {
  const t = useTranslations("AdminCms.errors");
  if (state.status === "idle") return null;
  if (state.status === "success") {
    return (
      <p role="status" className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
        <CheckCircle2 aria-hidden className="size-4" />
        {success}
      </p>
    );
  }
  return (
    <p role="alert" className="text-sm font-medium text-danger">
      {t(state.error)}
    </p>
  );
}

function SubmitButton({
  pending,
  children,
  disabled,
}: {
  pending: boolean;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending && <LoaderCircle aria-hidden className="animate-spin" />}
      {children}
    </Button>
  );
}

/** Tracks unsaved edits of a form and guards navigation while there are any. */
function useDirtyForm(state: CmsActionState) {
  const t = useTranslations("AdminCms");
  const [dirty, setDirty] = useState(false);
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.status === "success") setDirty(false);
  }
  useUnsavedGuard(dirty, t("unsavedChanges"));
  return { dirty, markDirty: () => setDirty(true) };
}

type CmsTranslator = ReturnType<typeof useTranslations<"AdminCms">>;

function fieldLabel(t: CmsTranslator, name: string) {
  return t(fieldLabelKey(name));
}

function fieldHint(t: CmsTranslator, name: string) {
  const key = fieldHintKey(name);
  return t.has(key) ? t(key) : undefined;
}

// ---------------------------------------------------------------------------
// Language-neutral details
// ---------------------------------------------------------------------------

export function EntityForm({
  type,
  id,
  version,
  values,
  image,
  categories,
  canEdit,
}: {
  type: ContentType;
  id: string;
  version: number;
  values: Record<string, unknown>;
  image: EntryImage | null;
  categories: { id: string; label: string }[];
  canEdit: boolean;
}) {
  const t = useTranslations("AdminCms");
  const [state, dispatch, pending] = useActionState(saveEntityAction, IDLE);
  const { dirty, markDirty } = useDirtyForm(state);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const currentVersion = latestVersion(state, version);

  return (
    <form
      method="post"
      noValidate
      className="space-y-5"
      onInput={markDirty}
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(() => dispatch(new FormData(event.currentTarget)));
      }}
    >
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={currentVersion} />
      <fieldset disabled={!canEdit} className="space-y-5">
        {CONTENT[type].entityFields.map((field) => (
          <FieldControl
            key={field.name}
            field={field}
            name={field.name}
            id={`entity-${field.name}`}
            label={fieldLabel(t, field.name)}
            hint={fieldHint(t, field.name)}
            error={fieldErrors?.[field.name]}
            value={values[field.name]}
            image={image}
            categories={categories}
            onDirty={markDirty}
          />
        ))}
      </fieldset>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton pending={pending}>{t("save")}</SubmitButton>
          {dirty && state.status !== "error" && (
            <span className="text-sm text-muted-foreground">{t("unsaved")}</span>
          )}
          <ActionMessage state={state} success={t("saved")} />
        </div>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// One language version
// ---------------------------------------------------------------------------

export function TranslationForm({
  type,
  id,
  locale,
  version,
  values,
  reviewed,
  canEdit,
  live,
}: {
  type: ContentType;
  id: string;
  locale: "en" | "am";
  /** 0 when this language version does not exist yet. */
  version: number;
  values: Record<string, unknown>;
  reviewed: boolean;
  canEdit: boolean;
  /** Published: saving changes the website immediately. */
  live: boolean;
}) {
  const t = useTranslations("AdminCms");
  const [state, dispatch, pending] = useActionState(saveTranslationAction, IDLE);
  const { dirty, markDirty } = useDirtyForm(state);
  const [review, setReview] = useState(reviewed);
  const [confirmLive, setConfirmLive] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const currentVersion = latestVersion(state, version);
  const page = type === "page" && isPageKey(id) ? PAGES[id] : null;
  const sections = (values.sections ?? {}) as Record<string, Record<string, string>>;
  const submit = () => startTransition(() => dispatch(new FormData(formRef.current!)));

  const onInput = (event: FormEvent<HTMLFormElement>) => {
    markDirty();
    // Changed Amharic text is no longer the reviewed text.
    if (locale === "am" && (event.target as HTMLInputElement).name !== "reviewed") setReview(false);
  };

  const errorCount = fieldErrors ? Object.keys(fieldErrors).length : 0;

  return (
    <form
      ref={formRef}
      method="post"
      noValidate
      className="space-y-5"
      onInput={onInput}
      onSubmit={(event) => {
        event.preventDefault();
        if (live && currentVersion > 0) setConfirmLive(true);
        else submit();
      }}
    >
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="version" value={currentVersion} />

      {errorCount > 0 && (
        <p
          role="alert"
          className="rounded-xl border border-danger/50 bg-surface p-3 text-sm font-medium text-danger"
        >
          {t("errorSummary", { count: errorCount })}
        </p>
      )}

      <fieldset disabled={!canEdit} className="space-y-5">
        {CONTENT[type].translationFields.map((field) => (
          <FieldControl
            key={field.name}
            field={field}
            name={field.name}
            id={`${locale}-${field.name}`}
            label={fieldLabel(t, field.name)}
            hint={fieldHint(t, field.name)}
            error={fieldErrors?.[field.name]}
            value={values[field.name]}
            lang={locale}
            onDirty={markDirty}
          />
        ))}
        {page?.sections.map((section) => (
          <FieldGroup key={section.key} title={t(sectionTitleKey(page.key, section.key))}>
            {section.fields.map((field) => {
              const name = sectionFieldName(section.key, field.name);
              return (
                <FieldControl
                  key={name}
                  field={field}
                  name={name}
                  id={`${locale}-${section.key}-${field.name}`}
                  label={t(sectionFieldKey(page.key, section.key, field.name))}
                  error={fieldErrors?.[name]}
                  value={sections[section.key]?.[field.name]}
                  lang={locale}
                  onDirty={markDirty}
                />
              );
            })}
          </FieldGroup>
        ))}

        {locale === "am" && (
          <div className="rounded-xl border border-accent/50 bg-surface p-4">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                name="reviewed"
                checked={review}
                onChange={(event) => setReview(event.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-primary"
              />
              <span>
                <span className="block font-semibold">{t("review.label")}</span>
                <span className="mt-1 block text-muted-foreground">{t("review.help")}</span>
              </span>
            </label>
            {reviewed && !review && (
              <p className="mt-2 text-xs font-semibold text-terracotta">{t("review.cleared")}</p>
            )}
          </div>
        )}
      </fieldset>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton pending={pending}>
            {currentVersion === 0 ? t("createLanguage") : t("save")}
          </SubmitButton>
          {dirty && state.status !== "error" && (
            <span className="text-sm text-muted-foreground">{t("unsaved")}</span>
          )}
          <ActionMessage state={state} success={t("saved")} />
        </div>
      )}

      <AlertDialog open={confirmLive} onOpenChange={setConfirmLive}>
        <AlertDialogContent
          title={t("confirm.liveEditTitle")}
          description={t("confirm.liveEditBody")}
          cancelLabel={t("cancel")}
          confirmLabel={t("confirm.liveEditConfirm")}
          onConfirm={submit}
        />
      </AlertDialog>
    </form>
  );
}

// ---------------------------------------------------------------------------
// New entry
// ---------------------------------------------------------------------------

export function CreateEntryForm({
  type,
  categories,
}: {
  type: ContentType;
  categories: { id: string; label: string }[];
}) {
  const t = useTranslations("AdminCms");
  const [state, dispatch, pending] = useActionState(createEntryAction, IDLE);
  const { markDirty } = useDirtyForm(state);
  const def = CONTENT[type];
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const label = def.translationFields[0]!;

  return (
    <form
      method="post"
      noValidate
      className="space-y-5"
      onInput={markDirty}
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(() => dispatch(new FormData(event.currentTarget)));
      }}
    >
      <input type="hidden" name="type" value={type} />
      <FieldControl
        field={label}
        name={label.name}
        id={`new-${label.name}`}
        label={`${fieldLabel(t, label.name)} (${t("languages.en")})`}
        hint={t("createHint")}
        error={fieldErrors?.[label.name]}
        value=""
        onDirty={markDirty}
      />
      {def.entityFields.map((field) => (
        <FieldControl
          key={field.name}
          field={field}
          name={field.name}
          id={`new-${field.name}`}
          label={fieldLabel(t, field.name)}
          hint={fieldHint(t, field.name)}
          error={fieldErrors?.[field.name]}
          value={field.kind === "order" ? 0 : undefined}
          categories={categories}
          onDirty={markDirty}
        />
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending}>{t("createDraft")}</SubmitButton>
        <ActionMessage state={state} success={t("saved")} />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

/** Confirmation copy for changes that affect the website (publish rights needed). */
function confirmKey(from: PublicationStatus, to: PublicationStatus) {
  if (to === "draft") return from === "archived" ? "restore" : "unpublish";
  return to === "archived" ? "archive" : "publish";
}

const ACTION_LABEL = {
  draft: "actions.toDraft",
  in_review: "actions.submit",
  published: "actions.publish",
  archived: "actions.archive",
} as const satisfies Record<PublicationStatus, string>;

export function StatusActions({
  type,
  id,
  scope,
  locale,
  status,
  version,
  permissions,
}: {
  type: ContentType;
  id: string;
  scope: "entity" | "translation";
  locale?: "en" | "am";
  status: PublicationStatus;
  version: number;
  permissions: Permissions;
}) {
  const t = useTranslations("AdminCms");
  const [state, dispatch, pending] = useActionState(changeStatusAction, IDLE);
  const [confirming, setConfirming] = useState<PublicationStatus | null>(null);
  const canWrite = scope === "entity" ? permissions.write : permissions.translate;
  const options = STATUS_ACTIONS[status].filter((to) =>
    needsPublishPermission(status, to) ? permissions.publish : canWrite,
  );
  if (options.length === 0) return null;

  const run = (to: PublicationStatus) => {
    const data = new FormData();
    data.set("type", type);
    data.set("id", id);
    data.set("scope", scope);
    if (locale) data.set("locale", locale);
    data.set("from", status);
    data.set("to", to);
    data.set("version", String(version));
    startTransition(() => dispatch(data));
  };
  const label = (to: PublicationStatus) =>
    status === "archived" && to === "draft"
      ? t("actions.restore")
      : status === "published" && to === "draft"
        ? t("actions.unpublish")
        : t(ACTION_LABEL[to]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {options.map((to) => (
          <Button
            key={to}
            type="button"
            size="sm"
            variant={to === "published" ? "primary" : "outline"}
            disabled={pending}
            onClick={() => (needsPublishPermission(status, to) ? setConfirming(to) : run(to))}
          >
            {pending && confirming === null && <LoaderCircle aria-hidden className="animate-spin" />}
            {label(to)}
          </Button>
        ))}
      </div>
      <ActionMessage state={state} success={t("statusChanged")} />
      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        {confirming && (
          <AlertDialogContent
            title={t(`confirm.${confirmKey(status, confirming)}Title`)}
            description={t(`confirm.${confirmKey(status, confirming)}Body`)}
            cancelLabel={t("cancel")}
            confirmLabel={label(confirming)}
            tone={confirming === "archived" ? "danger" : "default"}
            onConfirm={() => {
              const to = confirming;
              setConfirming(null);
              run(to);
            }}
          />
        )}
      </AlertDialog>
    </div>
  );
}

export function DeleteControl({
  type,
  id,
  scope,
  locale,
  label,
  description,
}: {
  type: ContentType;
  id: string;
  scope: "entity" | "translation";
  locale?: "en" | "am";
  label: string;
  description: string;
}) {
  const t = useTranslations("AdminCms");
  const [state, dispatch, pending] = useActionState(deleteEntryAction, IDLE);
  const [confirming, setConfirming] = useState(false);
  const run = () => {
    const data = new FormData();
    data.set("type", type);
    data.set("id", id);
    data.set("scope", scope);
    if (locale) data.set("locale", locale);
    startTransition(() => dispatch(data));
  };
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => setConfirming(true)}
        className="border-danger/60 text-danger hover:border-danger"
      >
        {pending && <LoaderCircle aria-hidden className="animate-spin" />}
        {label}
      </Button>
      <ActionMessage state={state} success={t("deleted")} />
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent
          title={label}
          description={description}
          cancelLabel={t("cancel")}
          confirmLabel={label}
          tone="danger"
          onConfirm={run}
        />
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page image slots
// ---------------------------------------------------------------------------

export function PageImageSlot({
  page,
  slot,
  image,
  canEdit,
}: {
  page: PageKey;
  slot: string;
  image: EntryImage | null;
  canEdit: boolean;
}) {
  const t = useTranslations("AdminCms");
  const [state, dispatch, pending] = useActionState(setPageImageAction, IDLE);
  const [open, setOpen] = useState(false);
  // The parent keys this component by the saved image, so this starts fresh after a refresh.
  const [current, setCurrent] = useState<PickedImage | null>(
    image ? { id: image.id, title: image.title, version: image.version } : null,
  );

  // A failed save leaves the saved image in place.
  const saved = image ? { id: image.id, title: image.title, version: image.version } : null;
  const shown = state.status === "error" && !pending ? saved : current;

  const save = (next: PickedImage | null) => {
    setCurrent(next);
    const data = new FormData();
    data.set("id", page);
    data.set("slot", slot);
    data.set("asset_id", next?.id ?? "");
    startTransition(() => dispatch(data));
  };

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border p-4">
      {shown ? (
        // eslint-disable-next-line @next/next/no-img-element -- authenticated admin file route
        <img
          src={adminImageUrl(shown.id, shown.version)}
          alt=""
          className="size-24 rounded-xl object-cover"
        />
      ) : (
        <span className="flex size-24 items-center justify-center rounded-xl border border-dashed border-border-strong px-2 text-center text-xs text-muted-foreground">
          {t("image.none")}
        </span>
      )}
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-semibold">{t(imageSlotKey(page, slot))}</p>
        <p className="truncate text-sm text-muted-foreground">{shown?.title ?? t("image.none")}</p>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => setOpen(true)}
            >
              {shown ? t("image.change") : t("image.choose")}
            </Button>
            {shown && (
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => save(null)}>
                {t("image.remove")}
              </Button>
            )}
            {pending && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
          </div>
        )}
        <ActionMessage state={state} success={t("saved")} />
      </div>
      <MediaPicker
        open={open}
        onOpenChange={setOpen}
        onSelect={(picked) => {
          setOpen(false);
          save(picked);
        }}
      />
    </div>
  );
}
