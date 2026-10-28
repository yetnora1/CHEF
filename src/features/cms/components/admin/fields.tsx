"use client";

import { Eye, ImageIcon, LoaderCircle, Pencil, Search } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea, fieldAria } from "@/components/ui/form-controls";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { EVENT_TYPES } from "@/features/bookings/status";
import { searchMediaAction, type MediaPickerItem } from "../../actions";
import { DIETARY_TAGS, SLUG_MAX, type EntryImage, type FieldDef } from "../../content-types";
import { Markup } from "../../markup";
import { adminImageUrl } from "../../media-urls";
import type { FieldError } from "../../schemas";

/*
 * Form controls generated from the content registry. Controls are uncontrolled
 * (the form reads FormData) except where the UI needs live state: character
 * counts, the formatting preview and the image picker.
 */

export type PickedImage = { id: string; title: string; version: number };

type ControlProps = {
  field: FieldDef;
  /** Form field name (differs from field.name for page sections). */
  name: string;
  id: string;
  label: string;
  hint?: string;
  error?: FieldError;
  value: unknown;
  image?: EntryImage | null;
  categories?: { id: string; label: string }[];
  /** Called when a control changes without a native input event (image picker). */
  onDirty: () => void;
  /** Language of the content typed into this control. */
  lang?: "en" | "am";
};

function useFieldError(error: FieldError | undefined, max?: number) {
  const t = useTranslations("AdminCms.fieldErrors");
  return error ? t(error, { max: max ?? 0 }) : undefined;
}

function TextControl({ field, name, id, label, hint, error, value, lang }: ControlProps) {
  const t = useTranslations("AdminCms");
  const initial = typeof value === "string" ? value : "";
  const [length, setLength] = useState([...initial].length);
  const message = useFieldError(error, field.max);
  const counter = field.max ? t("characterCount", { count: length, max: field.max }) : null;
  const multiline = field.kind === "textarea";
  const control = multiline ? (
    <Textarea
      {...fieldAria(id, { hint: hint ?? counter, error: message })}
      name={name}
      lang={lang}
      defaultValue={initial}
      rows={field.rows ?? 3}
      required={field.required}
      onChange={(event) => setLength([...event.target.value].length)}
    />
  ) : (
    <Input
      {...fieldAria(id, { hint: hint ?? counter, error: message })}
      name={name}
      lang={lang}
      defaultValue={initial}
      required={field.required}
      onChange={(event) => setLength([...event.target.value].length)}
    />
  );
  return (
    <Field
      id={id}
      label={label}
      required={field.required}
      optionalLabel={t("optional")}
      error={message}
      hint={
        hint || counter ? (
          <>
            {hint}
            {hint && counter ? " · " : null}
            {counter && (
              <span className={field.max && length > field.max ? "font-semibold text-danger" : undefined}>
                {counter}
              </span>
            )}
          </>
        ) : undefined
      }
    >
      {control}
    </Field>
  );
}

function MarkupControl({ field, name, id, label, hint, error, value, lang }: ControlProps) {
  const t = useTranslations("AdminCms");
  const [text, setText] = useState(typeof value === "string" ? value : "");
  const [preview, setPreview] = useState(false);
  const message = useFieldError(error, field.max);
  const length = [...text].length;
  const counter = field.max ? t("characterCount", { count: length, max: field.max }) : "";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <label htmlFor={id} className="block text-sm font-semibold">
          {label}
          {!field.required && (
            <>
              {" "}
              <span className="ml-1 text-xs font-normal text-muted-foreground">({t("optional")})</span>
            </>
          )}
        </label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={preview}
          onClick={() => setPreview((p) => !p)}
        >
          {preview ? <Pencil aria-hidden /> : <Eye aria-hidden />}
          {preview ? t("markup.edit") : t("markup.preview")}
        </Button>
      </div>
      {/* Hidden, not removed, while previewing: the text is still submitted. */}
      <Textarea
        {...fieldAria(id, { hint: true, error: message })}
        name={name}
        lang={lang}
        value={text}
        rows={field.rows ?? 8}
        required={field.required}
        hidden={preview}
        className="font-mono text-sm"
        onChange={(event) => setText(event.target.value)}
      />
      {preview && (
        <div className="min-h-28 rounded-xl border border-border bg-field p-4" aria-live="polite">
          {text.trim() ? (
            <Markup text={text} lang={lang} />
          ) : (
            <p className="text-sm text-muted-foreground">{t("markup.empty")}</p>
          )}
        </div>
      )}
      <p id={`${id}-hint`} className="text-xs leading-relaxed text-muted-foreground">
        {hint ? `${hint} · ` : ""}
        {t("markup.help")}{" "}
        {counter && (
          <span className={field.max && length > field.max ? "font-semibold text-danger" : undefined}>
            · {counter}
          </span>
        )}
      </p>
      {message && (
        <p id={`${id}-error`} className="text-sm font-medium text-danger">
          {message}
        </p>
      )}
    </div>
  );
}

export function MediaPicker({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: PickedImage) => void;
}) {
  const t = useTranslations("AdminCms.picker");
  const [query, setQuery] = useState("");
  const [state, setState] = useState<
    { items: MediaPickerItem[]; total: number; page: number } | "error" | null
  >(null);
  const [pending, startTransition] = useTransition();

  const load = (q: string, page: number) =>
    startTransition(async () => {
      const result = await searchMediaAction(q, page);
      if (!result) return setState("error");
      setState((previous) =>
        page > 1 && previous && previous !== "error"
          ? { items: [...previous.items, ...result.items], total: result.total, page }
          : { ...result, page },
      );
    });

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next && state === null) load("", 1);
      }}
    >
      <SheetContent closeLabel={t("close")} className="w-[min(40rem,100vw)]">
        <div className="space-y-1 pr-10">
          <SheetTitle className="display-md">{t("title")}</SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">{t("description")}</SheetDescription>
        </div>
        <form
          role="search"
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            load(query, 1);
          }}
        >
          <label className="sr-only" htmlFor="media-picker-search">
            {t("search")}
          </label>
          <Input
            id="media-picker-search"
            type="search"
            value={query}
            maxLength={100}
            placeholder={t("searchPlaceholder")}
            className="h-11"
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button type="submit" variant="outline" disabled={pending}>
            <Search aria-hidden />
            {t("search")}
          </Button>
        </form>

        <div aria-live="polite" aria-busy={pending}>
          {state === "error" ? (
            <p className="text-sm text-danger">{t("error")}</p>
          ) : state && state.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("empty")}{" "}
              <Link href="/admin/media" className="font-semibold underline">
                {t("openLibrary")}
              </Link>
            </p>
          ) : state ? (
            <>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {state.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onSelect({ id: item.id, title: item.title, version: item.version })}
                      className="group w-full overflow-hidden rounded-xl border border-border glass text-left shadow-xs transition-[border-color,box-shadow] hover:border-foreground hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- authenticated admin file route */}
                      <img
                        src={adminImageUrl(item.id, item.version)}
                        alt=""
                        loading="lazy"
                        className="aspect-[4/3] w-full bg-surface-muted object-cover"
                      />
                      <span className="block truncate px-3 py-2 text-sm font-medium">{item.title}</span>
                      {!item.altEn && (
                        <span className="block px-3 pb-2 text-xs font-semibold text-terracotta">
                          {t("missingAlt")}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              {state.items.length < state.total && (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4"
                  disabled={pending}
                  onClick={() => load(query, state.page + 1)}
                >
                  {t("more")}
                </Button>
              )}
            </>
          ) : null}
          {pending && (
            <p className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle aria-hidden className="size-4 animate-spin" />
              {t("loading")}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ImageControl({ field, name, id, label, hint, error, image, onDirty }: ControlProps) {
  const t = useTranslations("AdminCms.image");
  const [picked, setPicked] = useState<PickedImage | null>(
    image ? { id: image.id, title: image.title, version: image.version } : null,
  );
  const [open, setOpen] = useState(false);
  const message = useFieldError(error);
  const tCms = useTranslations("AdminCms");

  return (
    <Field
      id={id}
      label={label}
      required={field.required}
      optionalLabel={tCms("optional")}
      hint={hint}
      error={message}
    >
      <input type="hidden" name={name} value={picked?.id ?? ""} />
      <div className="flex flex-wrap items-center gap-4">
        {picked ? (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated admin file route
          <img
            src={adminImageUrl(picked.id, picked.version)}
            alt=""
            className="size-24 rounded-xl border border-border bg-surface-muted object-cover"
          />
        ) : (
          <span className="flex size-24 items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface-muted text-muted-foreground">
            <ImageIcon aria-hidden className="size-6" />
          </span>
        )}
        <div className="min-w-0 space-y-2">
          <p className="truncate text-sm font-medium">{picked?.title ?? t("none")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              id={id}
              type="button"
              variant="outline"
              size="sm"
              // The field label points here; keep the action in the accessible name too.
              aria-label={`${picked ? t("change") : t("choose")} (${label})`}
              aria-invalid={message ? true : undefined}
              aria-describedby={message ? `${id}-error` : hint ? `${id}-hint` : undefined}
              onClick={() => setOpen(true)}
            >
              {picked ? t("change") : t("choose")}
            </Button>
            {picked && !field.required && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPicked(null);
                  onDirty();
                }}
              >
                {t("remove")}
              </Button>
            )}
          </div>
        </div>
      </div>
      <MediaPicker
        open={open}
        onOpenChange={setOpen}
        onSelect={(item) => {
          setPicked(item);
          setOpen(false);
          onDirty();
        }}
      />
    </Field>
  );
}

export function FieldControl(props: ControlProps) {
  const t = useTranslations("AdminCms");
  const tDiet = useTranslations("DietaryTag");
  const tEvent = useTranslations("EventType");
  const { field, name, id, label, hint, error, value } = props;
  const message = useFieldError(error, field.kind === "slug" ? SLUG_MAX : field.max);

  switch (field.kind) {
    case "text":
    case "textarea":
      return <TextControl {...props} />;
    case "markup":
      return <MarkupControl {...props} />;
    case "image":
      return <ImageControl {...props} />;
    case "slug":
      return (
        <Field id={id} label={label} required hint={hint} error={message}>
          <Input
            {...fieldAria(id, { hint, error: message })}
            name={name}
            defaultValue={typeof value === "string" ? value : ""}
            required
            maxLength={SLUG_MAX}
            autoCapitalize="none"
            spellCheck={false}
            className="font-mono"
          />
        </Field>
      );
    case "order":
      return (
        <Field id={id} label={label} optionalLabel={t("optional")} hint={hint} error={message}>
          <Input
            {...fieldAria(id, { hint, error: message })}
            name={name}
            type="number"
            inputMode="numeric"
            step={1}
            min={-9999}
            max={9999}
            defaultValue={typeof value === "number" ? value : 0}
            className="max-w-40"
          />
        </Field>
      );
    case "category":
      return (
        <Field id={id} label={label} required hint={hint} error={message}>
          <NativeSelect
            {...fieldAria(id, { hint, error: message })}
            name={name}
            defaultValue={typeof value === "string" ? value : ""}
            required
          >
            <option value="" disabled>
              {t("chooseCategory")}
            </option>
            {(props.categories ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      );
    case "eventType":
      return (
        <Field id={id} label={label} optionalLabel={t("optional")} hint={hint} error={message}>
          <NativeSelect
            {...fieldAria(id, { hint, error: message })}
            name={name}
            defaultValue={typeof value === "string" ? value : ""}
          >
            <option value="">{t("notSpecified")}</option>
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {tEvent(type)}
              </option>
            ))}
          </NativeSelect>
        </Field>
      );
    case "dietary": {
      const selected = new Set(Array.isArray(value) ? value : []);
      return (
        <fieldset
          className="space-y-2"
          aria-describedby={message ? `${id}-error` : hint ? `${id}-hint` : undefined}
        >
          <legend className="text-sm font-semibold">
            {label} <span className="ml-1 text-xs font-normal text-muted-foreground">({t("optional")})</span>
          </legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {DIETARY_TAGS.map((tag) => (
              <label key={tag} className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name={name}
                  value={tag}
                  defaultChecked={selected.has(tag)}
                  className="size-4 accent-primary"
                />
                {tDiet(tag)}
              </label>
            ))}
          </div>
          {hint && (
            <p id={`${id}-hint`} className="text-xs text-muted-foreground">
              {hint}
            </p>
          )}
          {message && (
            <p id={`${id}-error`} className="text-sm font-medium text-danger">
              {message}
            </p>
          )}
        </fieldset>
      );
    }
  }
}

/** Groups related controls under a heading. */
export function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-5 rounded-2xl border border-border p-4 sm:p-5">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}
