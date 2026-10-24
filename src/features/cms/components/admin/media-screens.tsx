import { ArrowLeft, ChevronLeft, ChevronRight, Globe, ImageIcon, Lock, Search } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/form-controls";
import { formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  getMediaAsset,
  listMedia,
  MEDIA_FILTERS,
  MEDIA_PAGE_SIZE,
  mediaCleanupCandidates,
  type MediaListFilters,
} from "../../admin-data";
import { CONTENT, isContentType, isPublicationStatus } from "../../content-types";
import { adminImageUrl } from "../../media-urls";
import { CmsMessages } from "./cms-messages";
import {
  AltTextForm,
  CleanupButton,
  DeleteMediaButton,
  MediaDetailsForm,
  MediaUploadForm,
  ReplaceFileForm,
} from "./media-forms";

/* Media library screens (pages authorize media.write before rendering these). */

function mediaHref(filters: Partial<MediaListFilters>) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.filter) params.set("filter", filters.filter);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  const query = params.toString();
  return query ? `/admin/media?${query}` : "/admin/media";
}

const formatBytes = (bytes: number | null) =>
  bytes === null
    ? "—"
    : bytes < 1024 * 1024
      ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export async function MediaLibraryScreen({ filters }: { filters: MediaListFilters }) {
  const [t, list, cleanup] = await Promise.all([
    getTranslations("AdminCms"),
    listMedia(filters),
    mediaCleanupCandidates().catch(() => []),
  ]);
  const pages = Math.max(1, Math.ceil(list.total / MEDIA_PAGE_SIZE));

  return (
    <CmsMessages>
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <h1 className="display-lg">{t("media.title")}</h1>
          <p className="mt-3 max-w-3xl text-muted-foreground">{t("media.intro")}</p>
        </header>

        <section
          aria-labelledby="upload-heading"
          className="space-y-3 rounded-2xl border border-border bg-surface p-4 sm:p-6"
        >
          <h2 id="upload-heading" className="text-lg font-semibold">
            {t("upload.heading")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("upload.rules")}</p>
          <MediaUploadForm />
        </section>

        {cleanup.length > 0 && (
          <section className="space-y-2 rounded-2xl border border-warning/60 bg-surface p-4">
            <p className="text-sm">{t("media.cleanupIntro")}</p>
            <CleanupButton count={cleanup.length} />
          </section>
        )}

        <form
          method="get"
          action="/admin/media"
          role="search"
          aria-label={t("list.filters")}
          className="grid gap-4 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end"
        >
          <label className="space-y-1.5">
            <span className="text-xs font-semibold">{t("list.search")}</span>
            <span className="relative block">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                name="q"
                type="search"
                defaultValue={filters.q ?? ""}
                maxLength={100}
                className="h-11 pl-10"
                placeholder={t("media.searchPlaceholder")}
              />
            </span>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold">{t("media.show")}</span>
            <NativeSelect name="filter" defaultValue={filters.filter ?? ""} className="h-11">
              <option value="">{t("media.filters.all")}</option>
              {MEDIA_FILTERS.map((filter) => (
                <option key={filter} value={filter}>
                  {t(`media.filters.${filter}`)}
                </option>
              ))}
            </NativeSelect>
          </label>
          <Button type="submit" size="sm">
            {t("list.apply")}
          </Button>
        </form>

        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t("media.count", { count: list.total })}
        </p>

        {list.rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border-strong p-8 text-center font-semibold">
            {filters.q || filters.filter ? t("list.noMatches") : t("media.empty")}
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {list.rows.map((row) => (
              <li key={row.id} className="overflow-hidden rounded-2xl border border-border bg-surface">
                <Link
                  href={`/admin/media/${row.id}`}
                  className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {row.status === "ready" ? (
                    // eslint-disable-next-line @next/next/no-img-element -- authenticated admin file route
                    <img
                      src={adminImageUrl(row.id, row.version)}
                      alt=""
                      loading="lazy"
                      className="aspect-[4/3] w-full bg-surface-muted object-cover"
                    />
                  ) : (
                    <span className="flex aspect-[4/3] w-full items-center justify-center bg-surface-muted text-sm text-muted-foreground">
                      <ImageIcon aria-hidden className="mr-2 size-5" />
                      {t("media.incomplete")}
                    </span>
                  )}
                  <span className="block space-y-1.5 p-3">
                    <span className="block truncate font-semibold">{row.title}</span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        {row.is_public ? (
                          <Globe aria-hidden className="size-3.5" />
                        ) : (
                          <Lock aria-hidden className="size-3.5" />
                        )}
                        {row.is_public ? t("media.public") : t("media.private")}
                      </span>
                      <span>{t("media.usedIn", { count: row.usage_count })}</span>
                    </span>
                    {!row.alt_en && row.status === "ready" && (
                      <span className="block text-xs font-semibold text-terracotta">
                        {t("media.missingAlt")}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {pages > 1 && (
          <nav aria-label={t("list.pagination")} className="flex items-center justify-between gap-3">
            {filters.page > 1 ? (
              <Link
                href={mediaHref({ ...filters, page: filters.page - 1 })}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                <ChevronLeft aria-hidden />
                {t("list.previous")}
              </Link>
            ) : (
              <span />
            )}
            <p className="text-sm text-muted-foreground">{t("list.pageOf", { page: filters.page, pages })}</p>
            {filters.page < pages ? (
              <Link
                href={mediaHref({ ...filters, page: filters.page + 1 })}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                {t("list.next")}
                <ChevronRight aria-hidden />
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </div>
    </CmsMessages>
  );
}

export async function MediaDetailScreen({ id }: { id: string }) {
  const detail = await getMediaAsset(id);
  if (!detail) notFound();
  const [t, tStatus, locale] = await Promise.all([
    getTranslations("AdminCms"),
    getTranslations("PublicationStatus"),
    getLocale(),
  ]);
  const { asset, translations, usages, is_public } = detail;

  return (
    <CmsMessages>
      <div className="mx-auto max-w-5xl space-y-6">
        <Link
          href="/admin/media"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t("media.title")}
        </Link>
        <header className="space-y-2">
          <h1 className="display-lg break-words">{asset.title}</h1>
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
            {is_public ? <Globe aria-hidden className="size-4" /> : <Lock aria-hidden className="size-4" />}
            {is_public ? t("media.publicExplained") : t("media.privateExplained")}
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-3">
            {asset.status === "ready" ? (
              // eslint-disable-next-line @next/next/no-img-element -- authenticated admin file route
              <img
                src={adminImageUrl(asset.id, asset.version)}
                alt={translations.en?.alt_text ?? ""}
                className="max-h-[32rem] w-full rounded-2xl border border-border bg-surface-muted object-contain"
              />
            ) : (
              <p className="rounded-2xl border border-dashed border-border-strong p-8 text-center text-sm">
                {t("media.incompleteExplained")}
              </p>
            )}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-2xl border border-border bg-surface p-4 text-sm">
              <dt className="text-muted-foreground">{t("media.type")}</dt>
              <dd>{asset.mime_type ?? "—"}</dd>
              <dt className="text-muted-foreground">{t("media.dimensions")}</dt>
              <dd>{asset.width && asset.height ? `${asset.width} × ${asset.height}` : "—"}</dd>
              <dt className="text-muted-foreground">{t("media.size")}</dt>
              <dd>{formatBytes(asset.byte_size)}</dd>
              <dt className="text-muted-foreground">{t("list.updated")}</dt>
              <dd>{formatTimestamp(locale === "am" ? "am" : "en", asset.updated_at)}</dd>
            </dl>
          </div>

          <div className="space-y-6">
            <section className="space-y-4 rounded-2xl border border-border bg-surface p-4 sm:p-6">
              <h2 className="text-lg font-semibold">{t("media.details")}</h2>
              <MediaDetailsForm
                id={asset.id}
                version={asset.version}
                title={asset.title}
                credit={asset.credit}
              />
            </section>
            <section className="space-y-4 rounded-2xl border border-border bg-surface p-4 sm:p-6">
              <h2 className="text-lg font-semibold">{t("media.descriptions")}</h2>
              <p className="text-sm text-muted-foreground">{t("media.descriptionsIntro")}</p>
              {(["en", "am"] as const).map((language) => (
                <AltTextForm
                  key={language}
                  id={asset.id}
                  locale={language}
                  version={translations[language]?.version ?? 0}
                  altText={translations[language]?.alt_text ?? ""}
                  reviewed={Boolean(translations[language]?.language_reviewed_at)}
                  usedPublicly={is_public}
                />
              ))}
            </section>
          </div>
        </div>

        <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 sm:p-6">
          <h2 className="text-lg font-semibold">{t("media.usages", { count: usages.length })}</h2>
          {usages.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("media.unused")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {usages.map((usage) => {
                const type = isContentType(usage.type) ? usage.type : null;
                const href = type ? `${CONTENT[type].basePath}/${usage.id}` : null;
                return (
                  <li
                    key={`${usage.type}-${usage.id}-${usage.label}`}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
                  >
                    {href ? (
                      <Link href={href} className="font-semibold hover:underline">
                        {usage.label}
                      </Link>
                    ) : (
                      <span className="font-semibold">{usage.label}</span>
                    )}
                    <span className="text-muted-foreground">
                      {type ? t(`types.${type}.singular`) : usage.type} ·{" "}
                      {isPublicationStatus(usage.status) ? tStatus(usage.status) : usage.status}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 sm:p-6">
            <h2 className="text-lg font-semibold">{t("upload.replaceFile")}</h2>
            <ReplaceFileForm id={asset.id} version={asset.version} />
          </section>
          <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 sm:p-6">
            <h2 className="text-lg font-semibold">{t("danger.title")}</h2>
            <DeleteMediaButton id={asset.id} inUse={usages.length > 0} />
          </section>
        </div>
      </div>
    </CmsMessages>
  );
}
