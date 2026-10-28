import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Eye, Plus, Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { FilterDisclosure } from "@/components/admin/filter-disclosure";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/form-controls";
import { hasPermission, type SignedInStaffSession } from "@/lib/auth/access";
import { formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  CMS_PAGE_SIZE,
  getEntry,
  LIST_SORTS,
  listCategories,
  listEntries,
  TRANSLATION_FILTERS,
  type CmsListFilters,
  type CmsListRow,
} from "../../admin-data";
import {
  CONTENT,
  CONTENT_TYPES,
  PUBLICATION_STATUSES,
  RESTRICTED_STATUSES,
  type ContentType,
  type PublicationStatus,
} from "../../content-types";
import { isPageKey, PAGES } from "../../pages";
import { PublicationBadge } from "../status-badge";
import { CmsMessages } from "./cms-messages";
import {
  CreateEntryForm,
  DeleteControl,
  EntityForm,
  PageImageSlot,
  StatusActions,
  TranslationForm,
} from "./forms";
import { LanguageTabs } from "./language-tabs";

/*
 * Server-rendered CMS screens. Pages call authorizeAdmin() and pass the
 * session in; RLS decides what each read returns. Controls are shown only to
 * roles that hold the permission, and every action checks again on the server.
 */

type Session = SignedInStaffSession;

const LOCALES = ["en", "am"] as const;

function permissionsOf(session: Session) {
  return {
    write: hasPermission(session, "content.write"),
    translate: hasPermission(session, "translations.write"),
    publish: hasPermission(session, "content.publish"),
  };
}

function listHref(basePath: string, filters: Partial<CmsListFilters>, extra: Record<string, string> = {}) {
  const params = new URLSearchParams(extra);
  for (const [key, value] of Object.entries(filters)) {
    if (
      value === undefined ||
      value === "" ||
      (key === "sort" && value === "updated_desc") ||
      (key === "page" && value === 1)
    )
      continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

async function Pagination({
  basePath,
  filters,
  total,
  extra,
}: {
  basePath: string;
  filters: CmsListFilters;
  total: number;
  extra?: Record<string, string>;
}) {
  const t = await getTranslations("AdminCms.list");
  const pages = Math.max(1, Math.ceil(total / CMS_PAGE_SIZE));
  if (pages <= 1) return null;
  const link = buttonVariants({ variant: "outline", size: "sm" });
  return (
    <nav aria-label={t("pagination")} className="flex items-center justify-between gap-3">
      {filters.page > 1 ? (
        <Link href={listHref(basePath, { ...filters, page: filters.page - 1 }, extra)} className={link}>
          <ChevronLeft aria-hidden className="size-4" />
          {t("previous")}
        </Link>
      ) : (
        <span />
      )}
      <p className="text-sm text-muted-foreground">{t("pageOf", { page: filters.page, pages })}</p>
      {filters.page < pages ? (
        <Link href={listHref(basePath, { ...filters, page: filters.page + 1 }, extra)} className={link}>
          {t("next")}
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

async function TranslationState({ row, locale }: { row: CmsListRow; locale: "en" | "am" }) {
  const tStatus = await getTranslations("PublicationStatus");
  const t = await getTranslations("AdminCms");
  const status = locale === "en" ? row.en_status : row.am_status;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <PublicationBadge status={status ?? "missing"} label={status ? tStatus(status) : t("missing")} />
      {locale === "am" && status && !row.am_reviewed && (
        <span className="text-xs font-semibold text-terracotta">{t("review.notReviewed")}</span>
      )}
    </span>
  );
}

/** The entry's name, marked with its content language (the admin may be in the other one). */
function rowLabel(row: CmsListRow, fallback: string) {
  if (row.label_en) return { text: row.label_en, lang: "en" };
  if (row.label_am) return { text: row.label_am, lang: "am" };
  return { text: fallback, lang: undefined };
}

async function EntryRows({
  rows,
  hrefFor,
  showType,
}: {
  rows: CmsListRow[];
  hrefFor: (row: CmsListRow) => string;
  showType?: boolean;
}) {
  const [t, tStatus, locale] = await Promise.all([
    getTranslations("AdminCms"),
    getTranslations("PublicationStatus"),
    getLocale(),
  ]);
  const head = "hidden text-xs font-semibold text-muted-foreground md:block";
  return (
    <div className="overflow-hidden rounded-2xl border border-border glass">
      <div className="hidden grid-cols-[minmax(0,2.2fr)_1fr_1.2fr_1.2fr_1fr] gap-4 border-b border-border px-5 py-3 md:grid">
        <span className={head}>{t("list.title")}</span>
        <span className={head}>{t("list.status")}</span>
        <span className={head}>{t("languages.en")}</span>
        <span className={head}>{t("languages.am")}</span>
        <span className={head}>{t("list.updated")}</span>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((row) => {
          const label = rowLabel(
            row,
            row.type === "page" && isPageKey(row.id) ? t(`pageNames.${row.id}`) : (row.slug ?? t("untitled")),
          );
          return (
            <li
              key={`${row.type}-${row.id}`}
              className="grid gap-2 px-5 py-4 md:grid-cols-[minmax(0,2.2fr)_1fr_1.2fr_1.2fr_1fr] md:items-center md:gap-4"
            >
              <div className="min-w-0">
                <Link
                  href={hrefFor(row)}
                  className="font-semibold break-words hover:underline"
                  lang={label.lang}
                >
                  {label.text}
                </Link>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {[
                    showType ? t(`types.${row.type}.singular`) : null,
                    row.slug && row.type !== "page" ? `/${row.slug}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground md:sr-only">{t("list.status")}:</span>
                <PublicationBadge status={row.status} label={tStatus(row.status)} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground md:sr-only">{t("languages.en")}:</span>
                <TranslationState row={row} locale="en" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground md:sr-only">{t("languages.am")}:</span>
                <TranslationState row={row} locale="am" />
              </div>
              <p className="text-xs text-muted-foreground">
                <span className="md:sr-only">{t("list.updated")}: </span>
                {formatTimestamp(locale === "am" ? "am" : "en", row.updated_at)}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

async function ListFilters({
  basePath,
  filters,
  categories,
  types,
}: {
  basePath: string;
  filters: CmsListFilters;
  categories?: { id: string; label: string }[];
  types?: { value: string; label: string; selected: boolean }[];
}) {
  const [t, tStatus, tAdmin] = await Promise.all([
    getTranslations("AdminCms"),
    getTranslations("PublicationStatus"),
    getTranslations("Admin"),
  ]);
  const activeCount = [
    filters.q,
    filters.status,
    filters.translation,
    filters.parent,
    types?.some((type) => type.selected) ? "type" : undefined,
  ].filter(Boolean).length;
  return (
    <FilterDisclosure
      label={t("list.filters")}
      activeLabel={tAdmin("activeFilters", { count: activeCount })}
      activeCount={activeCount}
    >
      <form
        method="get"
        action={basePath}
        role="search"
        aria-label={t("list.filters")}
        className="space-y-4 rounded-2xl border border-border glass p-4"
      >
        <label className="block space-y-1.5">
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
              placeholder={t("list.searchPlaceholder")}
            />
          </span>
        </label>
        {/* Each select gets at least 14rem, so its longest option is never cut off. */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
          {types && (
            <label className="space-y-1.5">
              <span className="text-xs font-semibold">{t("list.type")}</span>
              <NativeSelect
                name="type"
                defaultValue={types.find((type) => type.selected)?.value ?? ""}
                className="h-11"
              >
                <option value="">{t("list.anyType")}</option>
                {types.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </NativeSelect>
            </label>
          )}
          <label className="space-y-1.5">
            <span className="text-xs font-semibold">{t("list.status")}</span>
            <NativeSelect name="status" defaultValue={filters.status ?? ""} className="h-11">
              <option value="">{t("list.anyStatus")}</option>
              {PUBLICATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {tStatus(status)}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold">{t("list.translation")}</span>
            <NativeSelect name="translation" defaultValue={filters.translation ?? ""} className="h-11">
              <option value="">{t("list.anyTranslation")}</option>
              {TRANSLATION_FILTERS.map((filter) => (
                <option key={filter} value={filter}>
                  {t(`list.translationFilters.${filter}`)}
                </option>
              ))}
            </NativeSelect>
          </label>
          {categories && (
            <label className="space-y-1.5">
              <span className="text-xs font-semibold">{t("fields.category_id.label")}</span>
              <NativeSelect name="parent" defaultValue={filters.parent ?? ""} className="h-11">
                <option value="">{t("list.anyCategory")}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </NativeSelect>
            </label>
          )}
          <label className="space-y-1.5">
            <span className="text-xs font-semibold">{t("list.sort")}</span>
            <NativeSelect name="sort" defaultValue={filters.sort} className="h-11">
              {LIST_SORTS.map((sort) => (
                <option key={sort} value={sort}>
                  {t(`list.sorts.${sort}`)}
                </option>
              ))}
            </NativeSelect>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit">{t("list.apply")}</Button>
          <Link href={basePath} className={buttonVariants({ variant: "ghost" })}>
            {t("list.reset")}
          </Link>
        </div>
      </form>
    </FilterDisclosure>
  );
}

async function MenuTabs({ active }: { active: ContentType }) {
  const t = await getTranslations("AdminCms");
  const tabs = [
    { type: "menu_item" as const, href: CONTENT.menu_item.basePath },
    { type: "menu_category" as const, href: CONTENT.menu_category.basePath },
  ];
  return (
    <nav aria-label={t("types.menu_item.plural")} className="flex gap-1.5">
      {tabs.map((tab) => (
        <Link
          key={tab.type}
          href={tab.href}
          aria-current={tab.type === active ? "page" : undefined}
          className={cn(
            buttonVariants({ variant: tab.type === active ? "neutral" : "outline", size: "sm" }),
            "px-3.5",
          )}
        >
          {t(`types.${tab.type}.plural`)}
        </Link>
      ))}
    </nav>
  );
}

export async function ContentListScreen({
  type,
  session,
  filters,
}: {
  type: ContentType;
  session: Session;
  filters: CmsListFilters;
}) {
  const t = await getTranslations("AdminCms");
  const def = CONTENT[type];
  const [list, categories] = await Promise.all([
    listEntries(type, filters),
    type === "menu_item" ? listCategories() : Promise.resolve(undefined),
  ]);
  const permissions = permissionsOf(session);
  const canCreate = def.creatable && permissions.write && permissions.translate;
  const filtered = Boolean(filters.q || filters.status || filters.translation || filters.parent);

  return (
    <CmsMessages>
      <div className="max-w-6xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="admin-title">{t(`types.${type}.plural`)}</h1>
            <p className="mt-3 max-w-3xl text-muted-foreground">{t(`types.${type}.intro`)}</p>
          </div>
          {canCreate && (
            <Link href={`${def.basePath}/new`} className={buttonVariants({ variant: "action" })}>
              <Plus aria-hidden />
              {t(`types.${type}.new`)}
            </Link>
          )}
        </header>
        {def.module === "menu" && <MenuTabs active={type} />}
        {type !== "page" && <ListFilters basePath={def.basePath} filters={filters} categories={categories} />}
        {/* With no entries, the empty state below says so. */}
        {list.total > 0 && (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {t("list.count", { count: list.total })}
          </p>
        )}
        {list.rows.length > 0 ? (
          <EntryRows rows={list.rows} hrefFor={(row) => `${def.basePath}/${row.id}`} />
        ) : (
          <div className="rounded-2xl border border-dashed border-border-strong p-8 text-center">
            <p className="font-semibold">{filtered ? t("list.noMatches") : t(`types.${type}.empty`)}</p>
            {filtered ? (
              <Link href={def.basePath} className="mt-3 inline-block text-sm font-semibold underline">
                {t("list.reset")}
              </Link>
            ) : (
              canCreate && (
                <Link
                  href={`${def.basePath}/new`}
                  className={cn(buttonVariants({ variant: "action", size: "sm" }), "mt-4")}
                >
                  <Plus aria-hidden />
                  {t(`types.${type}.new`)}
                </Link>
              )
            )}
          </div>
        )}
        <Pagination basePath={def.basePath} filters={filters} total={list.total} />
      </div>
    </CmsMessages>
  );
}

export async function ContentCreateScreen({ type }: { type: ContentType }) {
  const t = await getTranslations("AdminCms");
  const def = CONTENT[type];
  if (!def.creatable) notFound();
  const categories = type === "menu_item" ? await listCategories() : [];

  return (
    <CmsMessages>
      <div className="max-w-3xl space-y-6">
        <Link
          href={def.basePath}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t(`types.${type}.plural`)}
        </Link>
        <header>
          <h1 className="admin-title">{t(`types.${type}.new`)}</h1>
          <p className="mt-3 text-muted-foreground">{t("createIntro")}</p>
        </header>
        {type === "menu_item" && categories.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border-strong p-6 text-sm">
            {t("needCategory")}{" "}
            <Link href={`${CONTENT.menu_category.basePath}/new`} className="font-semibold underline">
              {t("types.menu_category.new")}
            </Link>
          </p>
        ) : (
          <div className="rounded-2xl border border-border glass p-4 sm:p-6">
            <CreateEntryForm type={type} categories={categories} />
          </div>
        )}
      </div>
    </CmsMessages>
  );
}

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-2xl border border-border glass p-4 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export async function ContentEditScreen({
  type,
  id,
  session,
  initialLocale,
}: {
  type: ContentType;
  id: string;
  session: Session;
  initialLocale?: string;
}) {
  const def = CONTENT[type];
  const entry = await getEntry(type, id);
  if (!entry) notFound();

  const [t, tStatus, categories] = await Promise.all([
    getTranslations("AdminCms"),
    getTranslations("PublicationStatus"),
    type === "menu_item" ? listCategories() : Promise.resolve([]),
  ]);
  const permissions = permissionsOf(session);
  const restricted = (status: PublicationStatus) => RESTRICTED_STATUSES.has(status);
  const english = entry.translations.en;
  const amharic = entry.translations.am;
  const label =
    english?.[CONTENT[type].translationFields[0]!.name] ??
    amharic?.[CONTENT[type].translationFields[0]!.name];
  const slug = typeof entry.entity.slug === "string" ? entry.entity.slug : null;
  const publicPath = def.publicPath({ id: entry.id, slug });
  const page = type === "page" && isPageKey(entry.id) ? PAGES[entry.id] : null;

  return (
    <CmsMessages>
      <div className="max-w-4xl space-y-6">
        <Link
          href={def.basePath}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t(`types.${type}.plural`)}
        </Link>

        <header className="space-y-3">
          <p className="text-sm font-semibold text-accent-ink">{t(`types.${type}.singular`)}</p>
          <h1 className="admin-title break-words" lang={english ? "en" : amharic ? "am" : undefined}>
            {typeof label === "string"
              ? label
              : isPageKey(entry.id)
                ? t(`pageNames.${entry.id}`)
                : t("untitled")}
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <PublicationBadge status={entry.status} label={tStatus(entry.status)} />
            {LOCALES.map((locale) => (
              <Link
                key={locale}
                href={`/admin/preview/${type}/${entry.id}?locale=${locale}`}
                className="inline-flex items-center gap-1.5 text-sm font-semibold underline-offset-4 hover:underline"
              >
                <Eye aria-hidden className="size-4" />
                {t("preview", { language: t(`languages.${locale}`) })}
              </Link>
            ))}
            {entry.status === "published" && english?.status === "published" && (
              <a
                href={`/en${publicPath === "/" ? "" : publicPath}`}
                className="inline-flex items-center gap-1.5 text-sm font-semibold underline-offset-4 hover:underline"
              >
                <ExternalLink aria-hidden className="size-4" />
                {t("viewOnSite")}
              </a>
            )}
          </div>
        </header>

        <Card
          title={t("publication.title")}
          description={t(`publication.${type === "menu_item" ? "ruleMenuItem" : "rule"}`)}
        >
          <StatusActions
            type={type}
            id={entry.id}
            scope="entity"
            status={entry.status}
            version={entry.version}
            permissions={permissions}
          />
          {restricted(entry.status) && !permissions.publish && (
            <p className="text-sm text-muted-foreground">{t("publication.needsPublish")}</p>
          )}
        </Card>

        {def.entityFields.length > 0 && (
          <Card title={t("details.title")} description={t("details.description")}>
            <EntityForm
              type={type}
              id={entry.id}
              version={entry.version}
              values={entry.entity}
              image={entry.image}
              categories={categories}
              canEdit={permissions.write && (!restricted(entry.status) || permissions.publish)}
            />
          </Card>
        )}

        {page && (
          <Card title={t("details.images")} description={t("details.imagesDescription")}>
            <div className="grid gap-3 md:grid-cols-2">
              {page.imageSlots.map((slot) => {
                const image = entry.images[slot] ?? null;
                return (
                  <PageImageSlot
                    key={`${slot}-${image?.id ?? "none"}-${image?.version ?? 0}`}
                    page={page.key}
                    slot={slot}
                    image={image}
                    canEdit={permissions.write && (!restricted(entry.status) || permissions.publish)}
                  />
                );
              })}
            </div>
          </Card>
        )}

        <section className="space-y-3" aria-labelledby="languages-heading">
          <div>
            <h2 id="languages-heading" className="text-lg font-semibold">
              {t("languages.title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("languages.description")}</p>
          </div>
          <LanguageTabs
            label={t("languages.title")}
            initial={initialLocale}
            tabs={LOCALES.map((locale) => {
              const translation = entry.translations[locale];
              const status = translation?.status ?? null;
              return {
                key: locale,
                label: (
                  <>
                    {t(`languages.${locale}`)}
                    {!translation && (
                      <>
                        {" "}
                        <span className="text-xs font-normal">({t("missing")})</span>
                      </>
                    )}
                  </>
                ),
                panel: (
                  <div className="space-y-6">
                    <div className="flex flex-wrap items-center gap-3">
                      <PublicationBadge
                        status={status ?? "missing"}
                        label={status ? tStatus(status) : t("missing")}
                      />
                      {locale === "am" && translation && (
                        <span
                          className={cn(
                            "text-xs font-semibold",
                            translation.language_reviewed_at ? "text-success" : "text-terracotta",
                          )}
                        >
                          {translation.language_reviewed_at ? t("review.reviewed") : t("review.notReviewed")}
                        </span>
                      )}
                    </div>
                    {translation && status && (
                      <StatusActions
                        type={type}
                        id={entry.id}
                        scope="translation"
                        locale={locale}
                        status={status}
                        version={Number(translation.version)}
                        permissions={permissions}
                      />
                    )}
                    {!translation && locale === "am" && (
                      <p className="text-sm text-muted-foreground">{t("languages.amharicMissing")}</p>
                    )}
                    <TranslationForm
                      type={type}
                      id={entry.id}
                      locale={locale}
                      version={translation ? Number(translation.version) : 0}
                      values={translation ?? {}}
                      reviewed={Boolean(translation?.language_reviewed_at)}
                      canEdit={
                        permissions.translate && (!status || !restricted(status) || permissions.publish)
                      }
                      live={status === "published"}
                    />
                    {translation && permissions.publish && status !== "published" && (
                      <DeleteControl
                        type={type}
                        id={entry.id}
                        scope="translation"
                        locale={locale}
                        label={t("deleteLanguage", { language: t(`languages.${locale}`) })}
                        description={t("confirm.deleteLanguageBody")}
                      />
                    )}
                  </div>
                ),
              };
            })}
          />
        </section>

        {def.creatable && permissions.publish && (
          <Card
            title={t("danger.title")}
            description={entry.status === "published" ? t("danger.unpublishFirst") : t("danger.description")}
          >
            {entry.status !== "published" && (
              <DeleteControl
                type={type}
                id={entry.id}
                scope="entity"
                label={t("danger.delete", { item: t(`types.${type}.singular`) })}
                description={t("confirm.deleteEntryBody")}
              />
            )}
          </Card>
        )}
      </div>
    </CmsMessages>
  );
}

export async function TranslationsScreen({
  filters,
  type,
}: {
  filters: CmsListFilters;
  type: ContentType | null;
}) {
  const t = await getTranslations("AdminCms");
  const effective: CmsListFilters = { ...filters, translation: filters.translation ?? "unpublished" };
  const list = await listEntries(type, effective);
  const types = CONTENT_TYPES.map((value) => ({
    value,
    label: t(`types.${value}.plural`),
    selected: value === type,
  }));

  return (
    <CmsMessages>
      <div className="max-w-6xl space-y-6">
        <header>
          <h1 className="admin-title">{t("translations.title")}</h1>
          <p className="mt-3 max-w-3xl text-muted-foreground">{t("translations.intro")}</p>
        </header>
        <ListFilters basePath="/admin/translations" filters={effective} types={types} />
        {list.total > 0 && (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {t("list.count", { count: list.total })}
          </p>
        )}
        {list.rows.length > 0 ? (
          <EntryRows
            showType
            rows={list.rows}
            hrefFor={(row) =>
              `${CONTENT[row.type].basePath}/${row.id}?lang=${row.am_status && row.am_reviewed ? "en" : "am"}`
            }
          />
        ) : (
          <p className="rounded-2xl border border-dashed border-border-strong p-8 text-center font-semibold">
            {t("translations.empty")}
          </p>
        )}
        <Pagination
          basePath="/admin/translations"
          filters={effective}
          total={list.total}
          extra={type ? { type } : undefined}
        />
      </div>
    </CmsMessages>
  );
}
