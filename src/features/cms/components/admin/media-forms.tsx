"use client";

import { CheckCircle2, LoaderCircle, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { startTransition, useActionState, useState, useTransition, type FormEvent } from "react";
import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, fieldAria } from "@/components/ui/form-controls";
import {
  cleanupMediaAction,
  deleteMediaAction,
  saveAltTextAction,
  saveMediaDetailsAction,
  type CmsActionState,
} from "../../actions";
import { latestVersion } from "./forms";
import { useUnsavedGuard } from "./use-unsaved-guard";

/*
 * Media library forms. Uploads go to /api/admin/media, which validates and
 * re-encodes every file on the server; the checks here only give quick feedback.
 */

const IDLE: CmsActionState = { status: "idle" };
const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 10 * 1024 * 1024;

function Message({ state, success }: { state: CmsActionState; success: string }) {
  const t = useTranslations("AdminCms.errors");
  if (state.status === "idle") return null;
  return state.status === "success" ? (
    <p role="status" className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
      <CheckCircle2 aria-hidden className="size-4" />
      {success}
    </p>
  ) : (
    <p role="alert" className="text-sm font-medium text-danger">
      {t(state.error)}
    </p>
  );
}

const UPLOAD_ERRORS = [
  "empty",
  "tooLarge",
  "unsupportedType",
  "typeMismatch",
  "unreadable",
  "tooManyPixels",
  "forbidden",
  "signedOut",
  "notConfigured",
  "uploadFailed",
  "conflict",
  "notFound",
  "invalid",
] as const;

function useUpload(onSuccess: (id: string) => void) {
  const t = useTranslations("AdminCms.upload");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const upload = (form: HTMLFormElement) => {
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) return setError(t("errors.empty"));
    if (file.size > MAX_BYTES) return setError(t("errors.tooLarge"));
    if (!ACCEPT.split(",").includes(file.type)) return setError(t("errors.unsupportedType"));
    setError(null);
    start(async () => {
      try {
        const response = await fetch("/api/admin/media", { method: "POST", body: data });
        const body = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          id?: string;
          error?: string;
        };
        if (response.ok && body.ok && body.id) return onSuccess(body.id);
        const code = (UPLOAD_ERRORS as readonly string[]).includes(body.error ?? "")
          ? body.error!
          : "uploadFailed";
        setError(t(`errors.${code as (typeof UPLOAD_ERRORS)[number]}`));
      } catch {
        setError(t("errors.network"));
      }
    });
  };
  return { upload, error, pending };
}

export function MediaUploadForm() {
  const t = useTranslations("AdminCms.upload");
  const router = useRouter();
  const [fileName, setFileName] = useState<string | null>(null);
  const { upload, error, pending } = useUpload((id) => router.push(`/admin/media/${id}`));

  return (
    <form
      method="post"
      encType="multipart/form-data"
      noValidate
      className="grid gap-4 md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-end"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        upload(event.currentTarget);
      }}
    >
      <Field id="upload-file" label={t("file")} required hint={fileName ?? t("fileHint")}>
        <input
          {...fieldAria("upload-file", { hint: true, error: error ?? undefined })}
          type="file"
          name="file"
          accept={ACCEPT}
          required
          className="block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-border-strong file:bg-surface file:px-4 file:py-2 file:text-sm file:font-semibold file:transition-colors hover:file:bg-surface-muted"
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
        />
      </Field>
      <Field id="upload-title" label={t("title")} optionalLabel={t("optional")}>
        <Input id="upload-title" name="title" maxLength={200} className="h-11" />
      </Field>
      <Field id="upload-alt" label={t("altEn")} optionalLabel={t("optional")}>
        <Input id="upload-alt" name="alt_en" maxLength={300} lang="en" className="h-11" />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <Upload aria-hidden />}
        {pending ? t("uploading") : t("submit")}
      </Button>
      {error && (
        <p id="upload-file-error" role="alert" className="text-sm font-medium text-danger md:col-span-4">
          {error}
        </p>
      )}
    </form>
  );
}

export function ReplaceFileForm({ id, version }: { id: string; version: number }) {
  const t = useTranslations("AdminCms.upload");
  const router = useRouter();
  const [done, setDone] = useState(false);
  const { upload, error, pending } = useUpload(() => {
    setDone(true);
    router.refresh();
  });
  return (
    <form
      method="post"
      encType="multipart/form-data"
      noValidate
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        setDone(false);
        upload(event.currentTarget);
      }}
    >
      <input type="hidden" name="replace" value={id} />
      <input type="hidden" name="version" value={version} />
      <Field id="replace-file" label={t("replaceFile")} hint={t("replaceHint")}>
        <input
          {...fieldAria("replace-file", { hint: true, error: error ?? undefined })}
          type="file"
          name="file"
          accept={ACCEPT}
          required
          className="block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-border-strong file:bg-surface file:px-4 file:py-2 file:text-sm file:font-semibold file:transition-colors hover:file:bg-surface-muted"
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending && <LoaderCircle aria-hidden className="animate-spin" />}
          {t("replaceSubmit")}
        </Button>
        {done && (
          <p role="status" className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
            <CheckCircle2 aria-hidden className="size-4" />
            {t("replaced")}
          </p>
        )}
      </div>
      {error && (
        <p id="replace-file-error" role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

export function MediaDetailsForm({
  id,
  version,
  title,
  credit,
}: {
  id: string;
  version: number;
  title: string;
  credit: string | null;
}) {
  const t = useTranslations("AdminCms");
  const tErrors = useTranslations("AdminCms.fieldErrors");
  const [state, dispatch, pending] = useActionState(saveMediaDetailsAction, IDLE);
  const [dirty, setDirty] = useState(false);
  useUnsavedGuard(dirty && state.status !== "success", t("unsavedChanges"));
  const errors = state.status === "error" ? state.fieldErrors : undefined;
  return (
    <form
      method="post"
      noValidate
      className="space-y-4"
      onInput={() => setDirty(true)}
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(() => dispatch(new FormData(event.currentTarget)));
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={latestVersion(state, version)} />
      <Field
        id="media-title"
        label={t("media.titleLabel")}
        required
        hint={t("media.titleHint")}
        error={errors?.title ? tErrors(errors.title, { max: 200 }) : undefined}
      >
        <Input
          {...fieldAria("media-title", { hint: true, error: errors?.title })}
          name="title"
          defaultValue={title}
          maxLength={200}
          required
        />
      </Field>
      <Field
        id="media-credit"
        label={t("media.creditLabel")}
        optionalLabel={t("optional")}
        hint={t("media.creditHint")}
        error={errors?.credit ? tErrors(errors.credit, { max: 200 }) : undefined}
      >
        <Input
          {...fieldAria("media-credit", { hint: true, error: errors?.credit })}
          name="credit"
          defaultValue={credit ?? ""}
          maxLength={200}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending && <LoaderCircle aria-hidden className="animate-spin" />}
          {t("save")}
        </Button>
        <Message state={state} success={t("saved")} />
      </div>
    </form>
  );
}

export function AltTextForm({
  id,
  locale,
  version,
  altText,
  reviewed,
  usedPublicly,
}: {
  id: string;
  locale: "en" | "am";
  version: number;
  altText: string;
  reviewed: boolean;
  usedPublicly: boolean;
}) {
  const t = useTranslations("AdminCms");
  const [state, dispatch, pending] = useActionState(saveAltTextAction, IDLE);
  const [review, setReview] = useState(reviewed);
  const fieldId = `alt-${locale}`;
  return (
    <form
      method="post"
      noValidate
      className="space-y-3"
      onInput={(event) => {
        if (locale === "am" && (event.target as HTMLInputElement).name === "alt_text") setReview(false);
      }}
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(() => dispatch(new FormData(event.currentTarget)));
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="version" value={latestVersion(state, version)} />
      <Field
        id={fieldId}
        label={t("media.altLabel", { language: t(`languages.${locale}`) })}
        hint={usedPublicly && locale === "en" && !altText ? t("media.altRequiredHint") : t("media.altHint")}
      >
        <Input
          {...fieldAria(fieldId, { hint: true })}
          name="alt_text"
          lang={locale}
          defaultValue={altText}
          maxLength={300}
        />
      </Field>
      {locale === "am" && (
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
            <span className="block text-muted-foreground">{t("media.altReviewHelp")}</span>
          </span>
        </label>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending && <LoaderCircle aria-hidden className="animate-spin" />}
          {t("save")}
        </Button>
        <Message state={state} success={t("saved")} />
      </div>
    </form>
  );
}

export function DeleteMediaButton({ id, inUse }: { id: string; inUse: boolean }) {
  const t = useTranslations("AdminCms");
  const [state, dispatch, pending] = useActionState(deleteMediaAction, IDLE);
  const [confirming, setConfirming] = useState(false);
  if (inUse) return <p className="text-sm text-muted-foreground">{t("media.deleteInUse")}</p>;
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
        {t("media.delete")}
      </Button>
      <Message state={state} success={t("deleted")} />
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent
          title={t("media.delete")}
          description={t("media.deleteBody")}
          cancelLabel={t("cancel")}
          confirmLabel={t("media.delete")}
          tone="danger"
          onConfirm={() => {
            const data = new FormData();
            data.set("id", id);
            startTransition(() => dispatch(data));
          }}
        />
      </AlertDialog>
    </div>
  );
}

export function CleanupButton({ count }: { count: number }) {
  const t = useTranslations("AdminCms.media");
  const [state, dispatch, pending] = useActionState(cleanupMediaAction, IDLE);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => startTransition(() => dispatch())}
      >
        {pending && <LoaderCircle aria-hidden className="animate-spin" />}
        {t("cleanup", { count })}
      </Button>
      {state.status === "success" && (
        <p role="status" className="text-sm font-medium text-success">
          {t("cleaned", { count: state.version })}
        </p>
      )}
      {state.status === "error" && (
        <p role="alert" className="text-sm font-medium text-danger">
          {t("cleanupFailed")}
        </p>
      )}
    </div>
  );
}
