import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Globe,
  ImageIcon,
  Lock,
  Pencil,
  Play,
  Search,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { IntentLink } from "@/components/ui/intent-link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/form-controls";
import { BUNDLED_MEDIA, type BundledMedia, type BundledPlacement } from "@/features/content/bundled-media";
import { licenseUrl } from "@/features/content/licenses";
import type { AppLocale } from "@/i18n/routing";
import { formatTimestamp } from "@/lib/format";
import { resolveLocalized } from "@/lib/localization/translations";
import { cn } from "@/lib/utils";
import {
  getMediaAsset,
  listMedia,
  MEDIA_FILTERS,
  MEDIA_PAGE_SIZE,
  mediaCleanupCandidates,
  type MediaListFilters,
  type MediaListRow,
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
  RestoreMediaButton,
  RevertMediaButton,
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

/** The bundled file behind a row, if it has one and the code still ships it. */
const bundledFile = (key: string | null): BundledMedia | undefined =>
  key ? BUNDLED_MEDIA.get(key) : undefined;

/** Where a file appears without any content pointing at it. */
function sitePlacements(kind: "image" | "video", bundled: BundledMedia | undefined): BundledPlacement[] {
  return bundled?.placements ?? (kind === "video" ? [{ place: "reel" }] : []);
}

const THUMB = "aspect-[4/3] w-full bg-surface-muted object-cover";

/** A card's picture: the bundled file if it is in use, otherwise the staff file route. */
function MediaThumb({
  file,
  bundled,
  incompleteLabel,
  videoLabel,
  sampleLabel,
}: {
  file: Pick<MediaListRow, "id" | "kind" | "status" | "version">;
  bundled: BundledMedia | undefined;
  incompleteLabel: string;
  videoLabel: string;
  sampleLabel: string;
}) {
  const url = adminImageUrl(file.id, file.version);
  let picture;
  if (file.status === "pending") {
    picture = (
      <span className="flex aspect-[4/3] w-full items-center justify-center bg-surface-muted text-sm text-muted-foreground">
        <ImageIcon aria-hidden className="mr-2 size-5" />
        {incompleteLabel}
      </span>
    );
  } else if (file.status === "bundled" && bundled?.kind === "image") {
    picture = (
      <Image
        src={bundled.src}
        alt=""
        sizes="(min-width: 80rem) 16rem, (min-width: 64rem) 22vw, (min-width: 40rem) 45vw, 92vw"
        className={THUMB}
      />
    );
  } else if (file.status === "bundled" && bundled?.kind === "video") {
    picture = (
      // eslint-disable-next-line @next/next/no-img-element -- video posters in public/videos, outside the optimiser's allow-list
      <img src={bundled.poster} alt="" loading="lazy" className={THUMB} />
    );
  } else if (file.kind === "video") {
    // The fragment makes phones draw a frame, not a blank box, before any playback.
    picture = <video src={`${url}#t=0.1`} muted playsInline preload="metadata" className={THUMB} />;
  } else {
    picture = (
      // eslint-disable-next-line @next/next/no-img-element -- authenticated admin file route
      <img src={url} alt="" loading="lazy" className={THUMB} />
    );
  }
  return (
    <span className="relative block">
      {picture}
      <span className="absolute top-2 left-2 flex flex-wrap gap-1.5">
        {file.kind === "video" && (
          <span className="inline-flex items-center gap-1 rounded-full tint-chip px-2 py-0.5 text-xs font-semibold shadow-xs hue-sky">
            <Play aria-hidden className="size-3" />
            {videoLabel}
          </span>
        )}
        {file.status === "bundled" && bundled?.credit && (
          <span className="rounded-full tint-chip px-2 py-0.5 text-xs font-semibold shadow-xs hue-amber">
            {sampleLabel}
          </span>
        )}
      </span>
    </span>
  );
}

export async function MediaLibraryScreen({ filters }: { filters: MediaListFilters }) {
  const [t, list, cleanup] = await Promise.all([
    getTranslations("AdminCms"),
    listMedia(filters),
    mediaCleanupCandidates().catch(() => []),
  ]);
  const pages = Math.max(1, Math.ceil(list.total / MEDIA_PAGE_SIZE));

  return (
    <CmsMessages>
      <div className="max-w-6xl space-y-6">
        <header>
          <h1 className="admin-title">{t("media.title")}</h1>
          <p className="mt-3 max-w-3xl text-muted-foreground">{t("media.intro")}</p>
        </header>

        <section
          aria-labelledby="upload-heading"
          className="space-y-3 rounded-2xl border border-border glass p-4 sm:p-6"
        >
          <h2 id="upload-heading" className="text-lg font-semibold">
            {t("upload.heading")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("upload.rules")}</p>
          <MediaUploadForm />
        </section>

        {cleanup.length > 0 && (
          <section className="space-y-2 rounded-2xl border border-warning/60 glass p-4">
            <p className="text-sm">{t("media.cleanupIntro")}</p>
            <CleanupButton count={cleanup.length} />
          </section>
        )}

        <form
          method="get"
          action="/admin/media"
          role="search"
          aria-label={t("list.filters")}
          className="grid gap-4 rounded-2xl border border-border glass p-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end"
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
          <Button type="submit">{t("list.apply")}</Button>
        </form>

        {list.total > 0 && (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {t("media.count", { count: list.total })}
          </p>
        )}

        {list.rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border-strong p-8 text-center font-semibold">
            {filters.filter === "removed"
              ? t("media.noneDeleted")
              : filters.q || filters.filter
                ? t("list.noMatches")
                : t("media.empty")}
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {list.rows.map((row) => {
              const bundled = bundledFile(row.bundled_key);
              const removed = row.removed_at !== null;
              const used = row.usage_count + sitePlacements(row.kind, bundled).length;
              const href = `/admin/media/${row.id}`;
              return (
                <li
                  key={row.id}
                  className="flex flex-col overflow-hidden rounded-2xl border border-border glass [contain-intrinsic-size:auto_22rem] [content-visibility:auto]"
                >
                  <Link
                    href={href}
                    prefetch={false}
                    // A larger target for the mouse; keyboards and screen readers use Edit below.
                    aria-hidden
                    tabIndex={-1}
                    className={cn("block", removed && "opacity-60")}
                  >
                    <MediaThumb
                      file={row}
                      bundled={bundled}
                      incompleteLabel={t("media.incomplete")}
                      videoLabel={t("media.video")}
                      sampleLabel={t("media.sample")}
                    />
                  </Link>
                  <div className="flex flex-1 flex-col gap-3 p-3">
                    <div className="min-w-0 space-y-1.5">
                      <p className="truncate font-semibold">{row.title}</p>
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          {removed ? (
                            <Trash2 aria-hidden className="size-3.5" />
                          ) : row.is_public ? (
                            <Globe aria-hidden className="size-3.5" />
                          ) : (
                            <Lock aria-hidden className="size-3.5" />
                          )}
                          {removed
                            ? t("media.deletedLabel")
                            : row.is_public
                              ? t("media.public")
                              : t("media.private")}
                        </span>
                        {!removed && <span>{t("media.usedIn", { count: used })}</span>}
                      </p>
                      {!removed && !row.alt_en && row.status !== "pending" && (
                        <p className="text-xs font-semibold text-terracotta">{t("media.missingAlt")}</p>
                      )}
                    </div>
                    <div className="mt-auto flex items-start gap-2">
                      {removed ? (
                        <RestoreMediaButton id={row.id} title={row.title} compact />
                      ) : (
                        <>
                          <IntentLink
                            href={href}
                            aria-label={t("media.editNamed", { title: row.title })}
                            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "flex-1")}
                          >
                            <Pencil aria-hidden />
                            {t("media.edit")}
                          </IntentLink>
                          <DeleteMediaButton
                            id={row.id}
                            title={row.title}
                            kind={row.kind}
                            inUse={row.usage_count > 0}
                            bundled={row.bundled_key !== null}
                            replaced={row.bundled_key !== null && row.status === "ready"}
                            compact
                          />
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
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
  const bundled = bundledFile(asset.bundled_key);
  const removed = asset.removed_at !== null;
  const isVideo = asset.kind === "video";
  // Which file is on show: the one bundled with the site, or one in Storage.
  const shown = asset.status === "bundled" ? bundled : undefined;
  const placements = removed ? [] : sitePlacements(asset.kind, bundled);
  const appearances = placements.length + usages.length;
  const usedBySite = is_public && (asset.bundled_key !== null || isVideo);
  const fileUrl = adminImageUrl(asset.id, asset.version);
  const alt = translations.en?.alt_text ?? "";
  const placementLabel = (placement: BundledPlacement) =>
    "name" in placement
      ? t(`media.places.${placement.place}`, {
          name: resolveLocalized(placement.name, locale as AppLocale)?.text ?? "",
        })
      : t(`media.places.${placement.place}`);

  return (
    <CmsMessages>
      <div className="max-w-5xl space-y-6">
        <Link
          href="/admin/media"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t("media.title")}
        </Link>
        <header className="space-y-2">
          <h1 className="admin-title break-words">{asset.title}</h1>
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
            {removed ? (
              <Trash2 aria-hidden className="size-4" />
            ) : is_public ? (
              <Globe aria-hidden className="size-4" />
            ) : (
              <Lock aria-hidden className="size-4" />
            )}
            {removed
              ? t("media.removedExplained")
              : usedBySite
                ? t("media.siteExplained")
                : is_public
                  ? t("media.publicExplained")
                  : t("media.privateExplained")}
          </p>
          {removed && <RestoreMediaButton id={asset.id} title={asset.title} />}
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-3">
            {shown?.kind === "image" ? (
              <Image
                src={shown.src}
                alt={alt}
                sizes="(min-width: 64rem) 32rem, 92vw"
                placeholder="blur"
                className="max-h-[32rem] w-full rounded-2xl border border-border bg-surface-muted object-contain"
              />
            ) : shown?.kind === "video" ? (
              <video
                src={shown.src}
                poster={shown.poster}
                controls
                playsInline
                preload="metadata"
                className="max-h-[32rem] w-full rounded-2xl border border-border bg-surface-muted"
              />
            ) : asset.status === "ready" && isVideo ? (
              <video
                src={fileUrl}
                controls
                playsInline
                preload="metadata"
                className="max-h-[32rem] w-full rounded-2xl border border-border bg-surface-muted"
              />
            ) : asset.status === "ready" ? (
              // eslint-disable-next-line @next/next/no-img-element -- authenticated admin file route
              <img
                src={fileUrl}
                alt={alt}
                className="max-h-[32rem] w-full rounded-2xl border border-border bg-surface-muted object-contain"
              />
            ) : (
              <p className="rounded-2xl border border-dashed border-border-strong p-8 text-center text-sm">
                {t("media.incompleteExplained")}
              </p>
            )}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-2xl border border-border glass p-4 text-sm">
              <dt className="text-muted-foreground">{t("media.source")}</dt>
              <dd>{shown ? t("media.sourceBundled") : t("media.sourceUploaded")}</dd>
              {!shown && (
                <>
                  <dt className="text-muted-foreground">{t("media.type")}</dt>
                  <dd>{asset.mime_type ?? "—"}</dd>
                </>
              )}
              <dt className="text-muted-foreground">{t("media.dimensions")}</dt>
              <dd>
                {shown?.kind === "image"
                  ? `${shown.src.width} × ${shown.src.height}`
                  : shown
                    ? `${shown.width} × ${shown.height}`
                    : asset.width && asset.height
                      ? `${asset.width} × ${asset.height}`
                      : "—"}
              </dd>
              {!shown && (
                <>
                  <dt className="text-muted-foreground">{t("media.size")}</dt>
                  <dd>{formatBytes(asset.byte_size)}</dd>
                </>
              )}
              <dt className="text-muted-foreground">{t("list.updated")}</dt>
              <dd>{formatTimestamp(locale === "am" ? "am" : "en", asset.updated_at)}</dd>
            </dl>
            {shown?.credit && (
              <div className="space-y-1 rounded-2xl border border-border glass p-4 text-sm">
                <p className="font-semibold">{t("media.sampleHeading")}</p>
                <p className="text-muted-foreground">
                  {t("media.sampleCredit", { author: shown.credit.author })}{" "}
                  {licenseUrl(shown.credit.license) ? (
                    <a
                      href={licenseUrl(shown.credit.license)!}
                      lang="en"
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      {shown.credit.license}
                    </a>
                  ) : (
                    <span lang="en">{shown.credit.license}</span>
                  )}
                </p>
                <p className="text-muted-foreground">{t("media.sampleExplained")}</p>
                <a
                  href={shown.credit.source}
                  className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
                >
                  {t("media.sampleSource")}
                  <ExternalLink aria-hidden className="size-3.5" />
                </a>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <section className="space-y-4 rounded-2xl border border-border glass p-4 sm:p-6">
              <h2 className="text-lg font-semibold">{t("media.details")}</h2>
              <MediaDetailsForm
                id={asset.id}
                version={asset.version}
                title={asset.title}
                credit={asset.credit}
                showCredit={asset.status !== "bundled"}
              />
            </section>
            <section className="space-y-4 rounded-2xl border border-border glass p-4 sm:p-6">
              <h2 className="text-lg font-semibold">{t("media.descriptions")}</h2>
              <p className="text-sm text-muted-foreground">
                {isVideo ? t("media.descriptionsIntroVideo") : t("media.descriptionsIntro")}
              </p>
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

        {!removed && (
          <section className="space-y-3 rounded-2xl border border-border glass p-4 sm:p-6">
            <h2 className="text-lg font-semibold">{t("media.usages", { count: appearances })}</h2>
            {appearances === 0 ? (
              <p className="text-sm text-muted-foreground">{t("media.unused")}</p>
            ) : (
              <ul className="divide-y divide-border">
                {placements.map((placement) => (
                  <li key={placementLabel(placement)} className="py-2.5 text-sm font-semibold">
                    {placementLabel(placement)}
                  </li>
                ))}
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
        )}

        {!removed && (
          <div className="grid gap-6 md:grid-cols-2">
            <section className="space-y-3 rounded-2xl border border-border glass p-4 sm:p-6">
              <h2 className="text-lg font-semibold">{t("upload.replaceFile")}</h2>
              <ReplaceFileForm id={asset.id} version={asset.version} kind={asset.kind} />
              {asset.bundled_key && asset.status === "ready" && (
                <RevertMediaButton id={asset.id} version={asset.version} />
              )}
            </section>
            <section className="space-y-3 rounded-2xl border border-border glass p-4 sm:p-6">
              <h2 className="text-lg font-semibold">{t("danger.title")}</h2>
              <DeleteMediaButton
                id={asset.id}
                title={asset.title}
                kind={asset.kind}
                inUse={usages.length > 0}
                bundled={asset.bundled_key !== null}
                replaced={asset.bundled_key !== null && asset.status === "ready"}
              />
            </section>
          </div>
        )}
      </div>
    </CmsMessages>
  );
}
