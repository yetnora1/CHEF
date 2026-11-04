"use client";

import { CheckCircle2, LoaderCircle, RotateCcw, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { startTransition, useActionState, useState, useTransition, type FormEvent } from "react";
import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, fieldAria } from "@/components/ui/form-controls";
import { isVideoType, VIDEO_MAX_BYTES } from "@/features/media/video";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import {
  abandonVideoAction,
  cleanupMediaAction,
  completeVideoAction,
  deleteMediaAction,
  reserveVideoAction,
  restoreMediaAction,
  revertMediaAction,
  saveAltTextAction,
  saveMediaDetailsAction,
  type CmsActionState,
} from "../../actions";
import { latestVersion } from "./forms";
import { useUnsavedGuard } from "./use-unsaved-guard";

/*
 * Media library forms. Image uploads go to /api/admin/media, which validates and
 * re-encodes every file on the server; videos go from here directly to Storage,
 * at a name the server reserved, and the server then checks what arrived. The
 * checks here only give quick feedback.
 */

const IDLE: CmsActionState = { status: "idle" };
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const IMAGE_ACCEPT = IMAGE_TYPES.join(",");
const VIDEO_ACCEPT = "video/mp4,video/webm";
const MAX_BYTES = 10 * 1024 * 1024;
const FILE_INPUT =
  "block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-border file:bg-glass-raised file:px-4 file:py-2 file:text-sm file:font-semibold file:text-foreground file:shadow-xs file:inset-shadow-sheen file:transition-[border-color,background-color,box-shadow] hover:file:border-border-strong hover:file:bg-glass-raised-hover hover:file:shadow-md";

export type MediaKind = "image" | "video";

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
  "unsupportedAny",
  "typeMismatch",
  "unreadable",
  "tooManyPixels",
  "videoTooLarge",
  "videoUnsupported",
  "videoUnreadable",
  "forbidden",
  "signedOut",
  "notConfigured",
  "uploadFailed",
  "conflict",
  "notFound",
  "invalid",
  "network",
] as const;

// A Vercel Function refuses a request over 4.5 MB, and phone photos are often
// bigger. Larger ones are resized here first; the server re-encodes them anyway.
const REQUEST_LIMIT = 4 * 1024 * 1024;
const RESIZED_EDGE = 2560;

async function fitForRequest(file: File): Promise<File> {
  if (file.size <= REQUEST_LIMIT) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, RESIZED_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // JPEG for photographs; WebP keeps a PNG's transparency.
  const type = file.type === "image/jpeg" ? "image/jpeg" : "image/webp";
  for (const quality of [0.9, 0.75]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    if (blob && blob.size <= REQUEST_LIMIT) {
      const extension = blob.type === "image/jpeg" ? "jpg" : blob.type === "image/webp" ? "webp" : "png";
      return new File([blob], `${file.name.replace(/\.[^.]*$/, "")}.${extension}`, { type: blob.type });
    }
  }
  return file;
}

/** The video's size in pixels, or null if this browser cannot read it (then visitors' may not either). */
function readVideoSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const finish = (size: { width: number; height: number } | null) => {
      URL.revokeObjectURL(url);
      resolve(size);
    };
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () =>
      finish(video.videoWidth > 0 ? { width: video.videoWidth, height: video.videoHeight } : null);
    video.onerror = () => finish(null);
    video.src = url;
  });
}

/** Sends the file to the reserved name in Storage, as the signed-in staff member. */
async function sendToStorage(path: string, file: File, onProgress: (percent: number) => void) {
  const config = getSupabasePublicConfig();
  const session = await createSupabaseBrowserClient()?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (!config || !token) throw new Error("signedOut");

  // XMLHttpRequest rather than the Supabase client: only it reports upload progress.
  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${config.url}/storage/v1/object/media/${path}`);
    request.setRequestHeader("Authorization", `Bearer ${token}`);
    request.setRequestHeader("apikey", config.publishableKey);
    request.setRequestHeader("Content-Type", file.type);
    request.setRequestHeader("Cache-Control", "max-age=31536000");
    request.setRequestHeader("x-upsert", "false");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error(request.responseText.includes('"413"') ? "videoTooLarge" : "uploadFailed"));
    };
    request.onerror = () => reject(new Error("network"));
    request.send(file);
  });
}

function useUpload(accepts: MediaKind | "any", onSuccess: (id: string) => void) {
  const t = useTranslations("AdminCms.upload");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [pending, start] = useTransition();

  const fail = (code: string | undefined) => {
    const known = (UPLOAD_ERRORS as readonly string[]).includes(code ?? "") ? code! : "uploadFailed";
    setError(t(`errors.${known as (typeof UPLOAD_ERRORS)[number]}`));
  };

  const sendImage = async (data: FormData, chosen: File) => {
    const file = await fitForRequest(chosen);
    if (file.size > MAX_BYTES) return fail("tooLarge");
    data.set("file", file);
    const response = await fetch("/api/admin/media", { method: "POST", body: data });
    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string };
    if (response.ok && body.ok && body.id) return onSuccess(body.id);
    fail(body.error);
  };

  const sendVideo = async (data: FormData, file: File) => {
    if (file.size > VIDEO_MAX_BYTES) return fail("videoTooLarge");
    const size = await readVideoSize(file);
    if (!size) return fail("videoUnreadable");
    const replace = data.get("replace");
    const ticket = await reserveVideoAction({
      type: file.type,
      size: file.size,
      name: file.name,
      title: String(data.get("title") ?? ""),
      altEn: String(data.get("alt_en") ?? ""),
      replace: typeof replace === "string" && replace ? replace : null,
      version: replace ? Number(data.get("version")) : null,
    });
    if (ticket.status === "error") return fail(ticket.error);
    const { id, path, version } = ticket;

    setProgress(0);
    try {
      await sendToStorage(path, file, setProgress);
    } catch (cause) {
      await abandonVideoAction({ id, path, version }).catch(() => null);
      return fail(cause instanceof Error ? cause.message : undefined);
    } finally {
      setProgress(null);
    }

    const result = await completeVideoAction({ id, path, version, ...size });
    if (result.status === "error") return fail(result.error);
    onSuccess(id);
  };

  const upload = (form: HTMLFormElement) => {
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) return setError(t("errors.empty"));
    const video = isVideoType(file.type);
    if (video ? accepts === "image" : !IMAGE_TYPES.includes(file.type) || accepts === "video") {
      return fail(
        accepts === "any" ? "unsupportedAny" : accepts === "video" ? "videoUnsupported" : "unsupportedType",
      );
    }
    setError(null);
    start(async () => {
      try {
        await (video ? sendVideo(data, file) : sendImage(data, file));
      } catch {
        setError(t("errors.network"));
      }
    });
  };
  return { upload, error, pending, progress };
}

function UploadProgress({ percent }: { percent: number }) {
  const t = useTranslations("AdminCms.upload");
  return (
    <div className="space-y-1.5 md:col-span-4">
      <div
        role="progressbar"
        aria-label={t("uploading")}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 overflow-hidden rounded-full bg-surface-muted"
      >
        <div
          className="h-full rounded-full bg-action-top transition-[width] duration-200"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{t("uploadingPercent", { percent })}</p>
    </div>
  );
}

export function MediaUploadForm() {
  const t = useTranslations("AdminCms.upload");
  const router = useRouter();
  const [fileName, setFileName] = useState<string | null>(null);
  const { upload, error, pending, progress } = useUpload("any", (id) => router.push(`/admin/media/${id}`));

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
          accept={`${IMAGE_ACCEPT},${VIDEO_ACCEPT}`}
          required
          className={FILE_INPUT}
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
        />
      </Field>
      <Field id="upload-title" label={t("title")} optionalLabel={t("optional")}>
        <Input id="upload-title" name="title" maxLength={200} className="h-11" />
      </Field>
      <Field id="upload-alt" label={t("altEn")} optionalLabel={t("optional")}>
        <Input id="upload-alt" name="alt_en" maxLength={300} lang="en" className="h-11" />
      </Field>
      <Button type="submit" variant="action" disabled={pending}>
        {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <Upload aria-hidden />}
        {pending ? t("uploading") : t("submit")}
      </Button>
      {progress !== null && <UploadProgress percent={progress} />}
      {error && (
        <p id="upload-file-error" role="alert" className="text-sm font-medium text-danger md:col-span-4">
          {error}
        </p>
      )}
    </form>
  );
}

export function ReplaceFileForm({ id, version, kind }: { id: string; version: number; kind: MediaKind }) {
  const t = useTranslations("AdminCms.upload");
  const router = useRouter();
  const [done, setDone] = useState(false);
  const { upload, error, pending, progress } = useUpload(kind, () => {
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
      <Field
        id="replace-file"
        label={t("replaceFile")}
        hint={kind === "video" ? t("replaceHintVideo") : t("replaceHint")}
      >
        <input
          {...fieldAria("replace-file", { hint: true, error: error ?? undefined })}
          type="file"
          name="file"
          accept={kind === "video" ? VIDEO_ACCEPT : IMAGE_ACCEPT}
          required
          className={FILE_INPUT}
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
      {progress !== null && <UploadProgress percent={progress} />}
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
  showCredit,
}: {
  id: string;
  version: number;
  title: string;
  credit: string | null;
  /** A sample bundled with the site keeps its credit in the code. */
  showCredit: boolean;
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
      {showCredit && (
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
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="action" disabled={pending}>
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

/**
 * Deletes a file after a confirmation. On a card (`compact`) it names the file for
 * screen readers and stays on the list; a file in use cannot be deleted, which the
 * card shows on a disabled button and the detail page spells out.
 */
export function DeleteMediaButton({
  id,
  title,
  kind,
  inUse,
  bundled,
  replaced,
  compact,
}: {
  id: string;
  title: string;
  kind: MediaKind;
  inUse: boolean;
  /** It ships with the site, so deleting takes it off the site and it can come back. */
  bundled: boolean;
  /** Its bundled file has an uploaded replacement, which goes for good. */
  replaced: boolean;
  compact?: boolean;
}) {
  const t = useTranslations("AdminCms");
  const [state, dispatch, pending] = useActionState(deleteMediaAction, IDLE);
  const [confirming, setConfirming] = useState(false);
  if (inUse && !compact) return <p className="text-sm text-muted-foreground">{t("media.deleteInUse")}</p>;

  const label = kind === "video" ? t("media.deleteVideo") : t("media.delete");
  const body = bundled
    ? replaced
      ? t("media.deleteBodyReplaced")
      : t("media.deleteBodyBundled")
    : kind === "video"
      ? t("media.deleteBodyVideo")
      : t("media.deleteBody");

  return (
    <div className={compact ? "flex-1" : "space-y-2"}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending || inUse}
        title={inUse ? t("media.deleteInUse") : undefined}
        aria-label={compact ? t("media.deleteNamed", { title }) : undefined}
        onClick={() => setConfirming(true)}
        className="w-full border-danger/60 text-danger hover:border-danger"
      >
        {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <Trash2 aria-hidden />}
        {compact ? t("media.deleteShort") : label}
      </Button>
      {compact ? (
        state.status === "error" && (
          <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
            {t(`errors.${state.error}`)}
          </p>
        )
      ) : (
        <Message state={state} success={t("deleted")} />
      )}
      {/* Mounted only when asked for: a list holds dozens of these buttons. */}
      {confirming && (
        <AlertDialog open onOpenChange={setConfirming}>
          <AlertDialogContent
            title={compact ? t("media.deleteNamed", { title }) : label}
            description={body}
            cancelLabel={t("cancel")}
            confirmLabel={label}
            tone="danger"
            onConfirm={() => {
              const data = new FormData();
              data.set("id", id);
              if (compact) data.set("stay", "1");
              startTransition(() => dispatch(data));
            }}
          />
        </AlertDialog>
      )}
    </div>
  );
}

/** Puts a deleted bundled file back on the website. */
export function RestoreMediaButton({ id, title, compact }: { id: string; title: string; compact?: boolean }) {
  const t = useTranslations("AdminCms");
  const [state, dispatch, pending] = useActionState(restoreMediaAction, IDLE);
  return (
    <div className={compact ? "flex-1" : "space-y-2"}>
      <Button
        type="button"
        variant="action"
        size="sm"
        disabled={pending}
        aria-label={t("media.restoreNamed", { title })}
        className={compact ? "w-full" : undefined}
        onClick={() => {
          const data = new FormData();
          data.set("id", id);
          startTransition(() => dispatch(data));
        }}
      >
        {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <RotateCcw aria-hidden />}
        {t("media.restore")}
      </Button>
      {state.status === "error" && <Message state={state} success="" />}
    </div>
  );
}

/** Drops the uploaded replacement of a bundled file, after a confirmation. */
export function RevertMediaButton({ id, version }: { id: string; version: number }) {
  const t = useTranslations("AdminCms");
  const [state, dispatch, pending] = useActionState(revertMediaAction, IDLE);
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => setConfirming(true)}
      >
        {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <RotateCcw aria-hidden />}
        {t("media.revert")}
      </Button>
      <Message state={state} success={t("media.reverted")} />
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent
          title={t("media.revert")}
          description={t("media.revertBody")}
          cancelLabel={t("cancel")}
          confirmLabel={t("media.revert")}
          onConfirm={() => {
            const data = new FormData();
            data.set("id", id);
            data.set("version", String(version));
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
