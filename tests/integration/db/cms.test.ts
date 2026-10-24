import { randomBytes, randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONTENT, CONTENT_TYPES, SLUG_MAX } from "@/features/cms/content-types";
import {
  anon,
  asActor,
  createAuthUser,
  createTestDatabase,
  grantRoleAsOwner,
  user,
  type Actor,
} from "./harness";

/*
 * Stage 3 content management: workflow and publish rules per role, Amharic
 * review, visitor isolation (tables and public functions), media rows and
 * Storage policies, audit entries, constraints and escalation attempts.
 * Storage is exercised as the Storage API does it: rows in storage.objects
 * written and read as the caller's role.
 */

const PERMISSION_DENIED = "42501";

let db: PGlite;
const ids = {} as Record<"owner" | "admin" | "editor" | "eventManager" | "analyst" | "noRole", string>;

const persist = { persist: true };

async function ok<T = Record<string, unknown>>(actor: Actor, sql: string, params: unknown[] = []) {
  const result = await asActor<T>(db, actor, sql, params, persist);
  if (!result.ok) throw new Error(`${sql}\n→ ${result.code} ${result.message}`);
  return result;
}

const objectPath = (assetId: string, ext = "jpg") =>
  `assets/${assetId}/${randomBytes(16).toString("hex")}.${ext}`;

/** A finished image, created by trusted server code (as the database owner). */
async function readyAsset(title = "Test image"): Promise<{ id: string; path: string }> {
  const id = randomUUID();
  const path = objectPath(id);
  await db.query("insert into storage.objects (bucket_id, name) values ('media', $1)", [path]);
  await db.query(
    `insert into public.media_assets (id, title, status, storage_path, mime_type, byte_size, width, height)
     values ($1, $2, 'ready', $3, 'image/jpeg', 1000, 800, 600)`,
    [id, title, path],
  );
  await db.query(
    "insert into public.media_asset_translations (asset_id, locale, alt_text) values ($1, 'en', $2)",
    [id, `${title} alt`],
  );
  return { id, path };
}

/** A service with an English translation, both in the given status. */
async function service(slug: string, status = "published", imageId: string | null = null) {
  const { rows } = await db.query<{ id: string }>(
    "insert into public.services (slug, status, image_id) values ($1, $2, $3) returning id",
    [slug, status, imageId],
  );
  const id = rows[0]!.id;
  await db.query(
    "insert into public.service_translations (service_id, locale, status, title, summary) values ($1, 'en', $2, $3, 'Summary')",
    [id, status, `Title ${slug}`],
  );
  return id;
}

beforeAll(async () => {
  db = await createTestDatabase();
  ids.owner = await createAuthUser(db, "owner@example.test");
  ids.admin = await createAuthUser(db, "admin@example.test");
  ids.editor = await createAuthUser(db, "editor@example.test");
  ids.eventManager = await createAuthUser(db, "events@example.test");
  ids.analyst = await createAuthUser(db, "analyst@example.test");
  ids.noRole = await createAuthUser(db, "visitor@example.test");
  await grantRoleAsOwner(db, ids.owner, "owner");
  await grantRoleAsOwner(db, ids.admin, "admin");
  await grantRoleAsOwner(db, ids.editor, "content_editor");
  await grantRoleAsOwner(db, ids.eventManager, "event_manager");
  await grantRoleAsOwner(db, ids.analyst, "analyst");
});

afterAll(async () => {
  await db?.close();
});

describe("content editor workflow", () => {
  let serviceId: string;

  it("creates a draft entity and translation, stamped with its own id", async () => {
    const created = await ok<{ id: string; version: number; updated_by: string; status: string }>(
      user(ids.editor),
      "insert into public.services (slug) values ('tasting-dinners') returning id, version, updated_by, status",
    );
    expect(created.rows[0]).toMatchObject({ version: 1, updated_by: ids.editor, status: "draft" });
    serviceId = created.rows[0]!.id;
    await ok(
      user(ids.editor),
      "insert into public.service_translations (service_id, locale, title, summary) values ($1, 'en', 'Tasting dinners', 'A summary')",
      [serviceId],
    );
  });

  it("moves draft → in review → published, bumping the version each time", async () => {
    const review = await ok<{ version: number }>(
      user(ids.editor),
      "update public.services set status = 'in_review' where id = $1 and version = 1 returning version",
      [serviceId],
    );
    expect(review.rows).toEqual([{ version: 2 }]);
    const publish = await ok<{ version: number; published_at: string | null }>(
      user(ids.editor),
      "update public.services set status = 'published' where id = $1 and version = 2 returning version, published_at",
      [serviceId],
    );
    expect(publish.rows[0]!.version).toBe(3);
    expect(publish.rows[0]!.published_at).not.toBeNull();
    await ok(
      user(ids.editor),
      "update public.service_translations set status = 'published' where service_id = $1 and locale = 'en'",
      [serviceId],
    );
    const visible = await asActor(
      db,
      anon,
      "select slug from public.services where slug = 'tasting-dinners'",
    );
    expect(visible).toMatchObject({ ok: true, rows: [{ slug: "tasting-dinners" }] });
  });

  it("refuses a stale write (optimistic concurrency) and never lets clients set the version", async () => {
    const stale = await asActor(
      db,
      user(ids.editor),
      "update public.services set sort_order = 5 where id = $1 and version = 1",
      [serviceId],
    );
    expect(stale).toMatchObject({ ok: true, affectedRows: 0 });
    const forged = await asActor(
      db,
      user(ids.editor),
      "update public.services set version = 99 where id = $1",
      [serviceId],
    );
    expect(forged).toMatchObject({ ok: false, code: PERMISSION_DENIED });
  });

  it("enforces unique, well-formed slugs and text limits", async () => {
    const duplicate = await asActor(
      db,
      user(ids.editor),
      "insert into public.services (slug) values ('tasting-dinners')",
    );
    expect(duplicate).toMatchObject({ ok: false, code: "23505" });
    for (const slug of ["Bad Slug", "trailing-", "ሠርግ"]) {
      const bad = await asActor(db, user(ids.editor), "insert into public.journal_posts (slug) values ($1)", [
        slug,
      ]);
      expect(bad, slug).toMatchObject({ ok: false, code: "23514" });
    }
    const longTitle = await asActor(
      db,
      user(ids.editor),
      "update public.service_translations set title = $2 where service_id = $1 and locale = 'en'",
      [serviceId, "x".repeat(161)],
    );
    expect(longTitle).toMatchObject({ ok: false, code: "23514" });
  });

  it("must unpublish before deleting; deleting removes the translations", async () => {
    const live = await asActor(db, user(ids.editor), "delete from public.services where id = $1", [
      serviceId,
    ]);
    expect(live).toMatchObject({ ok: true, affectedRows: 0 });
    await ok(user(ids.editor), "update public.services set status = 'archived' where id = $1", [serviceId]);
    const removed = await asActor(
      db,
      user(ids.editor),
      "delete from public.services where id = $1",
      [serviceId],
      persist,
    );
    expect(removed).toMatchObject({ ok: true, affectedRows: 1 });
    const { rows } = await db.query("select 1 from public.service_translations where service_id = $1", [
      serviceId,
    ]);
    expect(rows).toHaveLength(0);
  });
});

describe("Amharic review before publication", () => {
  let id: string;
  const amTitle = "የቅምሻ እራት";

  beforeAll(async () => {
    id = await service("review-flow");
  });

  it("refuses to publish an Amharic translation nobody confirmed as reviewed", async () => {
    await ok(
      user(ids.editor),
      "insert into public.service_translations (service_id, locale, title) values ($1, 'am', $2)",
      [id, amTitle],
    );
    const publish = await asActor(
      db,
      user(ids.editor),
      "update public.service_translations set status = 'published' where service_id = $1 and locale = 'am'",
      [id],
    );
    expect(publish).toMatchObject({ ok: false, code: "P0001" });
  });

  it("stamps the confirmation server-side (time and reviewer), then allows publishing", async () => {
    const confirmed = await ok<{ language_reviewed_at: string; language_reviewed_by: string }>(
      user(ids.editor),
      `update public.service_translations set language_reviewed_at = '2000-01-01'
       where service_id = $1 and locale = 'am' returning language_reviewed_at, language_reviewed_by`,
      [id],
    );
    expect(confirmed.rows[0]!.language_reviewed_by).toBe(ids.editor);
    expect(new Date(confirmed.rows[0]!.language_reviewed_at).getFullYear()).toBeGreaterThan(2000);
    await ok(
      user(ids.editor),
      "update public.service_translations set status = 'published' where service_id = $1 and locale = 'am'",
      [id],
    );
  });

  it("clears the confirmation when the text changes, so live Amharic text cannot change unreviewed", async () => {
    const edit = await asActor(
      db,
      user(ids.editor),
      "update public.service_translations set title = 'ሌላ ርዕስ' where service_id = $1 and locale = 'am'",
      [id],
    );
    expect(edit).toMatchObject({ ok: false, code: "P0001" });
    const editAndConfirm = await asActor(
      db,
      user(ids.editor),
      `update public.service_translations set title = 'ሌላ ርዕስ', language_reviewed_at = now()
       where service_id = $1 and locale = 'am' returning language_reviewed_by`,
      [id],
    );
    expect(editAndConfirm).toMatchObject({ ok: true, rows: [{ language_reviewed_by: ids.editor }] });
  });

  it("keeps review fields empty for English and refuses forged reviewer ids", async () => {
    const english = await asActor<{ language_reviewed_at: string | null }>(
      db,
      user(ids.editor),
      `update public.service_translations set language_reviewed_at = now()
       where service_id = $1 and locale = 'en' returning language_reviewed_at`,
      [id],
    );
    expect(english).toMatchObject({ ok: true, rows: [{ language_reviewed_at: null }] });
    const forged = await asActor(
      db,
      user(ids.editor),
      "update public.service_translations set language_reviewed_by = $2 where service_id = $1",
      [id, ids.owner],
    );
    expect(forged).toMatchObject({ ok: false, code: PERMISSION_DENIED });
  });
});

describe("visitors", () => {
  beforeAll(async () => {
    await service("visible-service");
    const draftId = await service("draft-service", "draft");
    // A published translation of a draft service stays hidden.
    await db.query("update public.service_translations set status = 'published' where service_id = $1", [
      draftId,
    ]);

    const { rows: categories } = await db.query<{ id: string; slug: string }>(
      "insert into public.menu_categories (slug, status) values ('mains', 'published'), ('hidden', 'draft') returning id, slug",
    );
    for (const category of categories) {
      await db.query(
        "insert into public.menu_category_translations (category_id, locale, status, name) values ($1, 'en', 'published', $2)",
        [category.id, `Category ${category.slug}`],
      );
      const { rows: items } = await db.query<{ id: string }>(
        "insert into public.menu_items (category_id, status, dietary_tags) values ($1, 'published', '{vegan,fasting}') returning id",
        [category.id],
      );
      await db.query(
        "insert into public.menu_item_translations (item_id, locale, status, name) values ($1, 'en', 'published', $2)",
        [items[0]!.id, `Dish in ${category.slug}`],
      );
    }
  });

  it("cannot read whole rows (select *) or audit columns of content tables", async () => {
    for (const sql of [
      "select * from public.services",
      "select * from public.menu_items",
      "select updated_by from public.journal_posts",
      "select version from public.page_translations",
      "select language_reviewed_by from public.service_translations",
    ]) {
      expect(await asActor(db, anon, sql), sql).toMatchObject({ ok: false, code: PERMISSION_DENIED });
    }
  });

  it("see published entities with published translations only", async () => {
    const services = await asActor<{ slug: string }>(
      db,
      anon,
      "select slug from public.services order by slug",
    );
    expect(services.ok && services.rows.map((r) => r.slug)).not.toContain("draft-service");
    const translations = await asActor<{ title: string }>(
      db,
      anon,
      `select t.title from public.service_translations t join public.services s on s.id = t.service_id
       where s.slug in ('draft-service', 'visible-service')`,
    );
    expect(translations).toMatchObject({ ok: true, rows: [{ title: "Title visible-service" }] });
  });

  it("do not see published menu items of an unpublished category", async () => {
    const items = await asActor<{ name: string }>(db, anon, "select name from public.menu_item_translations");
    expect(items).toMatchObject({ ok: true, rows: [{ name: "Dish in mains" }] });
    const menu = await asActor<{ menu: { slug: string; items: unknown[] }[] }>(
      db,
      anon,
      "select public.public_menu() as menu",
    );
    expect(menu.ok && menu.rows[0]!.menu.map((c) => c.slug)).toEqual(["mains"]);
  });

  it("cannot write any content table", async () => {
    for (const sql of [
      "insert into public.services (slug) values ('anon-service')",
      "insert into public.menu_categories (slug) values ('anon-category')",
      "insert into public.journal_posts (slug) values ('anon-post')",
      "insert into public.media_assets (title) values ('anon')",
      "update public.pages set status = 'published'",
      "delete from public.page_images",
    ]) {
      expect(await asActor(db, anon, sql), sql).toMatchObject({ ok: false, code: PERMISSION_DENIED });
    }
  });

  it("cannot call staff reads", async () => {
    for (const sql of [
      "select * from public.cms_list()",
      "select public.cms_get('page', 'home')",
      "select * from public.media_list()",
    ]) {
      expect(await asActor(db, anon, sql), sql).toMatchObject({ ok: false, code: PERMISSION_DENIED });
    }
  });

  it("get only published content from the public functions", async () => {
    const result = await asActor<{ services: { slug: string }[]; draft: unknown; page: unknown }>(
      db,
      anon,
      `select public.public_services() as services, public.public_service('draft-service') as draft,
              public.public_page('home') as page`,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const slugs = result.rows[0]!.services.map((s) => s.slug);
    expect(slugs).toContain("visible-service");
    expect(slugs).not.toContain("draft-service");
    expect(result.rows[0]!.draft).toBeNull();
    expect(result.rows[0]!.page).toBeNull();
  });

  it("get the same published-only answers from the public functions when signed in as staff", async () => {
    const result = await asActor<{ draft: unknown }>(
      db,
      user(ids.editor),
      "select public.public_service('draft-service') as draft",
    );
    expect(result).toMatchObject({ ok: true, rows: [{ draft: null }] });
  });
});

describe("staff without content permissions", () => {
  beforeAll(async () => {
    await service("staff-draft", "draft");
  });

  it.each([
    ["event manager", () => ids.eventManager],
    ["analyst", () => ids.analyst],
    ["account without a role", () => ids.noRole],
  ])("%s sees no drafts and changes nothing", async (_label, idOf) => {
    const who = user(idOf());
    const drafts = await asActor(db, who, "select slug from public.services where status <> 'published'");
    expect(drafts).toMatchObject({ ok: true, rows: [] });
    const listed = await asActor<{ slug: string }>(db, who, "select slug from public.cms_list('service')");
    expect(listed.ok && listed.rows.map((r) => r.slug)).not.toContain("staff-draft");
    const insert = await asActor(db, who, "insert into public.services (slug) values ('sneaky')");
    expect(insert).toMatchObject({ ok: false, code: PERMISSION_DENIED });
    const update = await asActor(db, who, "update public.services set sort_order = 9");
    expect(update).toMatchObject({ ok: true, affectedRows: 0 });
    const media = await asActor(db, who, "insert into public.media_assets (title) values ('sneaky')");
    expect(media).toMatchObject({ ok: false, code: PERMISSION_DENIED });
    const cleanup = await asActor(db, who, "select * from public.media_cleanup_candidates()");
    expect(cleanup).toMatchObject({ ok: false, code: PERMISSION_DENIED });
  });
});

describe("media assets and Storage", () => {
  let assetId: string;
  let reserved: string;

  it("reserves an upload, accepts the file only at the reserved path, then completes it", async () => {
    assetId = randomUUID();
    reserved = objectPath(assetId);
    await ok(
      user(ids.editor),
      "insert into public.media_assets (id, title, pending_path) values ($1, 'Platter', $2)",
      [assetId, reserved],
    );

    const elsewhere = await asActor(
      db,
      user(ids.editor),
      "insert into storage.objects (bucket_id, name, owner_id) values ('media', $1, $2)",
      [objectPath(assetId), ids.editor],
    );
    expect(elsewhere).toMatchObject({ ok: false, code: PERMISSION_DENIED });
    for (const who of [anon, user(ids.eventManager), user(ids.analyst)]) {
      const upload = await asActor(
        db,
        who,
        "insert into storage.objects (bucket_id, name) values ('media', $1)",
        [reserved],
      );
      expect(upload).toMatchObject({ ok: false, code: PERMISSION_DENIED });
    }

    await ok(
      user(ids.editor),
      "insert into storage.objects (bucket_id, name, owner_id) values ('media', $1, $2)",
      [reserved, ids.editor],
    );
    const done = await ok<{ status: string; version: number }>(
      user(ids.editor),
      `update public.media_assets
       set storage_path = pending_path, pending_path = null, status = 'ready',
           mime_type = 'image/jpeg', byte_size = 2048, width = 1600, height = 1200
       where id = $1 returning status, version`,
      [assetId],
    );
    expect(done.rows).toEqual([{ status: "ready", version: 2 }]);
  });

  it("rejects paths that do not belong to the asset, mismatched types and shortcuts in the lifecycle", async () => {
    const otherId = randomUUID();
    const wrongOwner = await asActor(
      db,
      user(ids.editor),
      "insert into public.media_assets (id, title, pending_path) values ($1, 'Wrong', $2)",
      [otherId, objectPath(assetId)],
    );
    expect(wrongOwner).toMatchObject({ ok: false, code: "23514" });
    const traversal = await asActor(
      db,
      user(ids.editor),
      "insert into public.media_assets (id, title, pending_path) values ($1, 'Traversal', $2)",
      [otherId, `assets/${otherId}/../../${randomBytes(16).toString("hex")}.jpg`],
    );
    expect(traversal).toMatchObject({ ok: false, code: "23514" });
    const startsReady = await asActor(
      db,
      user(ids.editor),
      `insert into public.media_assets (id, title, status, storage_path, mime_type, byte_size, width, height)
       values ($1, 'Ready', 'ready', $2, 'image/jpeg', 1, 1, 1)`,
      [otherId, objectPath(otherId)],
    );
    // Refused by column privileges before the lifecycle trigger even runs.
    expect(startsReady).toMatchObject({ ok: false, code: PERMISSION_DENIED });

    const pendingId = randomUUID();
    const pendingPath = objectPath(pendingId, "png");
    await ok(
      user(ids.editor),
      "insert into public.media_assets (id, title, pending_path) values ($1, 'No file', $2)",
      [pendingId, pendingPath],
    );
    const missingFile = await asActor(
      db,
      user(ids.editor),
      `update public.media_assets set storage_path = pending_path, pending_path = null, status = 'ready',
         mime_type = 'image/png', byte_size = 10, width = 10, height = 10 where id = $1`,
      [pendingId],
    );
    expect(missingFile).toMatchObject({ ok: false, code: "22023" });
    await ok(user(ids.editor), "insert into storage.objects (bucket_id, name) values ('media', $1)", [
      pendingPath,
    ]);
    const wrongType = await asActor(
      db,
      user(ids.editor),
      `update public.media_assets set storage_path = pending_path, pending_path = null, status = 'ready',
         mime_type = 'image/jpeg', byte_size = 10, width = 10, height = 10 where id = $1`,
      [pendingId],
    );
    expect(wrongType).toMatchObject({ ok: false, code: "23514" });
  });

  it("serves a file to visitors only while published content uses the image", async () => {
    const anonCanRead = async () => {
      const objects = await asActor(
        db,
        anon,
        "select name from storage.objects where bucket_id = 'media' and name = $1",
        [reserved],
      );
      const rows = await asActor(db, anon, "select id, storage_path from public.media_assets where id = $1", [
        assetId,
      ]);
      return objects.ok && rows.ok && objects.rows.length === 1 && rows.rows.length === 1;
    };
    expect(await anonCanRead()).toBe(false);

    const serviceId = await service("with-image", "draft", null);
    await ok(user(ids.editor), "update public.services set image_id = $2 where id = $1", [
      serviceId,
      assetId,
    ]);
    expect(await anonCanRead()).toBe(false);

    await ok(user(ids.editor), "update public.services set status = 'published' where id = $1", [serviceId]);
    expect(await anonCanRead()).toBe(false); // translation still draft
    await ok(
      user(ids.editor),
      "update public.service_translations set status = 'published' where service_id = $1",
      [serviceId],
    );
    expect(await anonCanRead()).toBe(true);
    const staffView = await asActor(
      db,
      user(ids.editor),
      "select name from storage.objects where name = $1",
      [reserved],
    );
    expect(staffView).toMatchObject({ ok: true, rows: [{ name: reserved }] });

    await ok(user(ids.editor), "update public.services set status = 'draft' where id = $1", [serviceId]);
    expect(await anonCanRead()).toBe(false);

    const inUse = await asActor(db, user(ids.editor), "delete from public.media_assets where id = $1", [
      assetId,
    ]);
    // ON DELETE RESTRICT: PostgreSQL 17 (Supabase) reports foreign_key_violation
    // (23503); PostgreSQL 18 (PGlite) restrict_violation (23001).
    expect(inUse.ok).toBe(false);
    expect(["23503", "23001"]).toContain(!inUse.ok && inUse.code);
    await ok(user(ids.editor), "update public.services set image_id = null where id = $1", [serviceId]);
  });

  it("shows unreviewed Amharic alt text to staff only", async () => {
    const asset = await readyAsset("Alt test");
    await service("alt-service", "published", asset.id);
    await ok(
      user(ids.editor),
      "insert into public.media_asset_translations (asset_id, locale, alt_text) values ($1, 'am', 'የምግብ ገበታ')",
      [asset.id],
    );
    const before = await asActor<{ locale: string }>(
      db,
      anon,
      "select locale from public.media_asset_translations where asset_id = $1 order by locale",
      [asset.id],
    );
    expect(before).toMatchObject({ ok: true, rows: [{ locale: "en" }] });
    await ok(
      user(ids.editor),
      "update public.media_asset_translations set language_reviewed_at = now() where asset_id = $1 and locale = 'am'",
      [asset.id],
    );
    const after = await asActor<{ image: { alt: Record<string, string> } }>(
      db,
      anon,
      "select (public.public_service('alt-service')) -> 'image' as image",
    );
    expect(after.ok && after.rows[0]!.image.alt).toEqual({ en: "Alt test alt", am: "የምግብ ገበታ" });
  });

  it("removes only files that no asset tracks, never overwrites", async () => {
    const tracked = await asActor(db, user(ids.editor), "delete from storage.objects where name = $1", [
      reserved,
    ]);
    expect(tracked).toMatchObject({ ok: true, affectedRows: 0 });
    const overwrite = await asActor(
      db,
      user(ids.editor),
      "update storage.objects set metadata = '{}' where name = $1",
      [reserved],
    );
    expect(overwrite).toMatchObject({ ok: true, affectedRows: 0 });

    await ok(user(ids.editor), "delete from public.media_assets where id = $1", [assetId]);
    const byManager = await asActor(
      db,
      user(ids.eventManager),
      "delete from storage.objects where name = $1",
      [reserved],
    );
    expect(byManager).toMatchObject({ ok: true, affectedRows: 0 });
    const untracked = await asActor(
      db,
      user(ids.editor),
      "delete from storage.objects where name = $1",
      [reserved],
      persist,
    );
    expect(untracked).toMatchObject({ ok: true, affectedRows: 1 });
  });

  it("lists cleanup candidates for media managers only", async () => {
    const orphan = `assets/${randomUUID()}/${randomBytes(16).toString("hex")}.webp`;
    await db.query(
      "insert into storage.objects (bucket_id, name, created_at) values ('media', $1, now() - interval '2 hours')",
      [orphan],
    );
    const list = await asActor<{ kind: string; object_name: string }>(
      db,
      user(ids.editor),
      "select kind, object_name from public.media_cleanup_candidates()",
    );
    expect(list.ok && list.rows).toContainEqual({ kind: "untracked_file", object_name: orphan });
  });
});

describe("audit trail", () => {
  it("records content changes with the actor, status and changed field names, but no content", async () => {
    const created = await ok<{ id: string }>(
      user(ids.admin),
      "insert into public.journal_posts (slug) values ('audit-post') returning id",
    );
    const postId = created.rows[0]!.id;
    await ok(
      user(ids.admin),
      "insert into public.journal_post_translations (post_id, locale, title, body) values ($1, 'en', 'Secret title', 'Body text')",
      [postId],
    );
    await ok(
      user(ids.admin),
      "update public.journal_post_translations set body = 'New body' where post_id = $1",
      [postId],
    );
    await ok(user(ids.admin), "update public.journal_posts set status = 'published' where id = $1", [postId]);
    await ok(user(ids.admin), "update public.journal_posts set status = 'draft' where id = $1", [postId]);
    await ok(user(ids.admin), "delete from public.journal_posts where id = $1", [postId]);

    const { rows } = await db.query<{
      actor_id: string;
      action: string;
      target_type: string;
      details: Record<string, unknown>;
    }>(
      "select actor_id, action, target_type, details from public.audit_logs where target_id = $1 order by id",
      [postId],
    );
    expect(rows.map((r) => `${r.target_type}:${r.action}`)).toEqual([
      "journal_post:content.created",
      "journal_post_translation:content.created",
      "journal_post_translation:content.updated",
      "journal_post:content.status_changed",
      "journal_post:content.status_changed",
      "journal_post:content.deleted",
      // Removed by the cascade, so it is logged after its parent.
      "journal_post_translation:content.deleted",
    ]);
    expect(rows.every((r) => r.actor_id === ids.admin)).toBe(true);
    expect(rows[2]!.details).toMatchObject({ fields: ["body"], locale: "en" });
    expect(rows[3]!.details).toMatchObject({ from: "draft", status: "published" });
    expect(JSON.stringify(rows)).not.toMatch(/Secret title|Body text|New body/);
  });

  it("records uploads, replacements, review confirmations and deletions of media", async () => {
    const id = randomUUID();
    const first = objectPath(id);
    const second = objectPath(id, "png");
    await ok(
      user(ids.editor),
      "insert into public.media_assets (id, title, pending_path) values ($1, 'Audit image', $2)",
      [id, first],
    );
    await ok(user(ids.editor), "insert into storage.objects (bucket_id, name) values ('media', $1)", [first]);
    await ok(
      user(ids.editor),
      `update public.media_assets set storage_path = pending_path, pending_path = null, status = 'ready',
         mime_type = 'image/jpeg', byte_size = 5, width = 5, height = 5 where id = $1`,
      [id],
    );
    await ok(user(ids.editor), "update public.media_assets set pending_path = $2 where id = $1", [
      id,
      second,
    ]);
    await ok(user(ids.editor), "insert into storage.objects (bucket_id, name) values ('media', $1)", [
      second,
    ]);
    await ok(
      user(ids.editor),
      `update public.media_assets set storage_path = pending_path, pending_path = null,
         mime_type = 'image/png', byte_size = 6, width = 6, height = 6 where id = $1`,
      [id],
    );
    await ok(
      user(ids.editor),
      "insert into public.media_asset_translations (asset_id, locale, alt_text, language_reviewed_at) values ($1, 'am', 'ምስል', now())",
      [id],
    );
    await ok(user(ids.editor), "delete from public.media_assets where id = $1", [id]);

    const { rows } = await db.query<{ action: string }>(
      "select action from public.audit_logs where target_id = $1 order by id",
      [id],
    );
    expect(rows.map((r) => r.action)).toEqual([
      "media.created",
      "media.uploaded",
      "media.updated",
      "media.replaced",
      "media.created",
      "media.deleted",
      "media.deleted",
    ]);
  });

  it("cannot be written or rewritten by content staff", async () => {
    for (const sql of [
      "insert into public.audit_logs (action) values ('content.forged')",
      "update public.audit_logs set details = '{}'",
      "delete from public.audit_logs",
    ]) {
      expect(await asActor(db, user(ids.editor), sql), sql).toMatchObject({
        ok: false,
        code: PERMISSION_DENIED,
      });
    }
  });
});

describe("staff reads", () => {
  it("lists drafts with translation state for editors; search matches wildcards literally", async () => {
    const id = await service("list-me", "draft");
    await db.query(
      "insert into public.service_translations (service_id, locale, title) values ($1, 'am', 'ዝርዝር')",
      [id],
    );
    const all = await asActor<{ slug: string; en_status: string; am_status: string; am_reviewed: boolean }>(
      db,
      user(ids.editor),
      "select slug, en_status, am_status, am_reviewed from public.cms_list('service', 'list-me')",
    );
    expect(all).toMatchObject({
      ok: true,
      rows: [{ slug: "list-me", en_status: "draft", am_status: "draft", am_reviewed: false }],
    });
    const unreviewed = await asActor<{ slug: string }>(
      db,
      user(ids.editor),
      "select slug from public.cms_list('service', null, null, 'unreviewed_am')",
    );
    expect(unreviewed.ok && unreviewed.rows.map((r) => r.slug)).toContain("list-me");
    const wildcard = await asActor(db, user(ids.editor), "select slug from public.cms_list('service', '%')");
    expect(wildcard).toMatchObject({ ok: true, rows: [] });
  });

  it("returns one entity with translations for editors, nothing for others or malformed ids", async () => {
    const id = await service("detail-me", "draft");
    const editor = await asActor<{
      item: { entity: { slug: string }; translations: Record<string, unknown> };
    }>(db, user(ids.editor), "select public.cms_get('service', $1) as item", [id]);
    expect(editor.ok && editor.rows[0]!.item.entity.slug).toBe("detail-me");
    expect(editor.ok && Object.keys(editor.rows[0]!.item.translations)).toEqual(["en"]);
    for (const [who, arg] of [
      [user(ids.eventManager), id],
      [user(ids.editor), "not-a-uuid"],
      [user(ids.editor), "' or 1=1 --"],
    ] as const) {
      const result = await asActor(db, who, "select public.cms_get('service', $1) as item", [arg]);
      expect(result).toMatchObject({ ok: true, rows: [{ item: null }] });
    }
    const page = await asActor<{ item: { entity: { key: string } } }>(
      db,
      user(ids.editor),
      "select public.cms_get('page', 'home') as item",
    );
    expect(page.ok && page.rows[0]!.item.entity.key).toBe("home");
  });

  it("reports where an image is used", async () => {
    const asset = await readyAsset("Usage");
    await service("uses-image", "draft", asset.id);
    const result = await asActor<{ item: { usages: { type: string; label: string }[]; is_public: boolean } }>(
      db,
      user(ids.editor),
      "select public.media_get($1) as item",
      [asset.id],
    );
    expect(result.ok && result.rows[0]!.item.usages).toEqual([
      { type: "service", id: expect.any(String), label: "Title uses-image", status: "draft" },
    ]);
    expect(result.ok && result.rows[0]!.item.is_public).toBe(false);
  });
});

describe("pages", () => {
  it("are a fixed set: staff can neither add nor delete pages", async () => {
    const insert = await asActor(db, user(ids.editor), "insert into public.pages (key) values ('about')");
    const remove = await asActor(db, user(ids.editor), "delete from public.pages where key = 'about'");
    expect(insert).toMatchObject({ ok: false, code: PERMISSION_DENIED });
    expect(remove).toMatchObject({ ok: false, code: PERMISSION_DENIED });
  });

  it("store sections as a bounded JSON object and publish only reviewed Amharic", async () => {
    const notObject = await asActor(
      db,
      user(ids.editor),
      "insert into public.page_translations (page_key, locale, title, sections) values ('about', 'en', 'About', '[]')",
    );
    expect(notObject).toMatchObject({ ok: false, code: "23514" });
    await ok(
      user(ids.editor),
      `insert into public.page_translations (page_key, locale, status, title, sections)
       values ('about', 'en', 'published', 'About', '{"intro": {"heading": "Hello"}}')`,
    );
    await ok(user(ids.editor), "update public.pages set status = 'published' where key = 'about'");
    const page = await asActor<{ page: { translations: Record<string, unknown> } }>(
      db,
      anon,
      "select public.public_page('about') as page",
    );
    expect(page.ok && Object.keys(page.rows[0]!.page.translations)).toEqual(["en"]);
    const nav = await asActor<{ nav: Record<string, Record<string, boolean>> }>(
      db,
      anon,
      "select public.public_navigation() as nav",
    );
    expect(nav.ok && nav.rows[0]!.nav.en!.about).toBe(true);
    expect(nav.ok && nav.rows[0]!.nav.am!.about).toBe(true); // English fallback
  });
});

describe("a role with content.write but not content.publish", () => {
  // No role has this combination today; remove content.publish from
  // content_editor in an isolated database to prove the rules hold.
  let isolated: PGlite;
  let writer: string;

  beforeAll(async () => {
    isolated = await createTestDatabase();
    writer = await createAuthUser(isolated, "writer@example.test");
    await grantRoleAsOwner(isolated, writer, "content_editor");
    await isolated.query(
      "delete from public.role_permissions where role = 'content_editor' and permission = 'content.publish'",
    );
  });

  afterAll(async () => {
    await isolated?.close();
  });

  const run = (sql: string, params: unknown[] = [], options = persist) =>
    asActor(isolated, user(writer), sql, params, options);

  it("drafts and submits for review, but cannot publish, archive, edit live rows or delete", async () => {
    const created = await run("insert into public.menu_categories (slug) values ('starters') returning id");
    expect(created.ok).toBe(true);
    const id = created.ok ? (created.rows[0] as { id: string }).id : "";
    expect(
      await run("update public.menu_categories set status = 'in_review' where id = $1", [id]),
    ).toMatchObject({
      ok: true,
      affectedRows: 1,
    });
    expect(await run("update public.menu_categories set status = 'draft' where id = $1", [id])).toMatchObject(
      {
        ok: true,
        affectedRows: 1,
      },
    );
    for (const status of ["published", "archived"]) {
      expect(
        await run("update public.menu_categories set status = $2 where id = $1", [id, status]),
      ).toMatchObject({
        ok: false,
        code: PERMISSION_DENIED,
      });
    }
    const live = await run("update public.services set sort_order = 3 where slug = 'weddings'");
    expect(live).toMatchObject({ ok: false, code: PERMISSION_DENIED });
    const insertLive = await run(
      "insert into public.journal_posts (slug, status) values ('live', 'published')",
    );
    expect(insertLive).toMatchObject({ ok: false, code: PERMISSION_DENIED });
    expect(await run("delete from public.menu_categories where id = $1", [id])).toMatchObject({
      ok: true,
      affectedRows: 0,
    });
  });

  it("cannot change the images of a published page", async () => {
    const id = randomUUID();
    const path = objectPath(id);
    await isolated.query("insert into storage.objects (bucket_id, name) values ('media', $1)", [path]);
    await isolated.query(
      `insert into public.media_assets (id, title, status, storage_path, mime_type, byte_size, width, height)
       values ($1, 'Hero', 'ready', $2, 'image/jpeg', 1, 1, 1)`,
      [id, path],
    );
    expect(
      await run("insert into public.page_images (page_key, slot, asset_id) values ('home', 'hero', $1)", [
        id,
      ]),
    ).toMatchObject({
      ok: true,
    });
    await isolated.query("update public.pages set status = 'published' where key = 'home'");
    expect(await run("delete from public.page_images where page_key = 'home'")).toMatchObject({
      ok: false,
      code: PERMISSION_DENIED,
    });
  });
});

describe("escalation attempts by content staff", () => {
  it("cannot touch roles, permissions, inquiries or the inquiry submission path", async () => {
    for (const sql of [
      `insert into public.user_roles (user_id, role) values ('${"00000000-0000-0000-0000-000000000000"}', 'owner')`,
      "update public.role_permissions set permission = 'users.manage_privileged'",
      "select public.submit_inquiry(gen_random_uuid(), 'x', 'x@example.test', null, 'email', 'wedding', null, 10, null, 'x', null, 'en', true)",
      "select * from public.list_bookings()",
    ]) {
      const result = await asActor(db, user(ids.editor), sql);
      if (sql.includes("list_bookings")) expect(result, sql).toMatchObject({ ok: true, rows: [] });
      else expect(result, sql).toMatchObject({ ok: false, code: PERMISSION_DENIED });
    }
    const self = await asActor(db, user(ids.editor), "select public.assign_role($1, 'owner')", [ids.editor]);
    expect(self).toMatchObject({ ok: false, code: PERMISSION_DENIED });
  });
});

describe("the admin's content registry (src/features/cms/content-types.ts)", () => {
  it("matches the database's columns, required fields and length limits", async () => {
    for (const type of CONTENT_TYPES) {
      const def = CONTENT[type];
      for (const [table, fields] of [
        [def.table, def.entityFields],
        [def.translationTable, def.translationFields],
      ] as const) {
        const { rows: columns } = await db.query<{ column_name: string; is_nullable: string }>(
          "select column_name, is_nullable from information_schema.columns where table_schema = 'public' and table_name = $1",
          [table],
        );
        const { rows: checks } = await db.query<{ definition: string }>(
          "select pg_get_constraintdef(oid) as definition from pg_constraint where conrelid = $1::regclass and contype = 'c'",
          [`public.${table}`],
        );
        for (const field of fields) {
          const label = `${table}.${field.name}`;
          const column = columns.find((c) => c.column_name === field.name);
          expect(column, label).toBeDefined();
          if (field.required) expect(column!.is_nullable, `${label} is required`).toBe("NO");

          const max = field.kind === "slug" ? SLUG_MAX : field.max;
          if (max === undefined) continue;
          // pg_get_constraintdef spells `between 1 and n` as `>= 1 AND <= n`.
          const limit = new RegExp(String.raw`char_length\((?:btrim\()?${field.name}\)?\) <= (\d+)`);
          const limits = checks.map((c) => limit.exec(c.definition)?.[1]).filter(Boolean);
          expect(limits, `${label} length limit in: ${checks.map((c) => c.definition).join(" | ")}`).toEqual([
            String(max),
          ]);
        }
      }
    }
  });
});
