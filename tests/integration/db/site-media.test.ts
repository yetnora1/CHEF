import { randomBytes, randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BUNDLED_MEDIA } from "@/features/content/bundled-media";
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
 * Every photo and video of the website in the media library: the rows seeded for
 * the bundled files, staying in step with the code; what staff may do to them;
 * what visitors get from public_site_media; and videos in Storage. Storage is
 * exercised as the Storage API does it: rows in storage.objects written and read
 * as the caller's role.
 */

const PERMISSION_DENIED = "42501";
const CHECK_VIOLATION = "23514";
const BAD_PARAMETER = "22023";
const MEGABYTE = 1024 * 1024;

let db: PGlite;
const ids = {} as Record<"editor" | "analyst" | "noRole", string>;
const persist = { persist: true };

async function ok<T = Record<string, unknown>>(actor: Actor, sql: string, params: unknown[] = []) {
  const result = await asActor<T>(db, actor, sql, params, persist);
  if (!result.ok) throw new Error(`${sql}\n→ ${result.code} ${result.message}`);
  return result;
}

const objectPath = (assetId: string, ext = "jpg") =>
  `assets/${assetId}/${randomBytes(16).toString("hex")}.${ext}`;

type SiteRow = {
  id: string;
  key: string | null;
  kind: string;
  removed: boolean;
  credit: string | null;
  alt: Record<string, string>;
  file: { path: string; width: number; height: number } | null;
};

async function siteMedia(): Promise<SiteRow[]> {
  const { rows } = await ok<{ media: SiteRow[] }>(anon, "select public.public_site_media() as media");
  return rows[0]!.media;
}

const rowFor = async (key: string) => (await siteMedia()).find((row) => row.key === key)!;

async function assetIdFor(key: string) {
  const { rows } = await db.query<{ id: string }>(
    "select id from public.media_assets where bundled_key = $1",
    [key],
  );
  return rows[0]!.id;
}

/** Uploads a replacement as the editor: reserve, store, finish. Returns its path. */
async function replaceFile(assetId: string, ext = "jpg", mime = "image/jpeg", size = 2048) {
  const path = objectPath(assetId, ext);
  await ok(user(ids.editor), "update public.media_assets set pending_path = $2 where id = $1", [
    assetId,
    path,
  ]);
  await ok(user(ids.editor), "insert into storage.objects (bucket_id, name) values ('media', $1)", [path]);
  await ok(
    user(ids.editor),
    `update public.media_assets
     set storage_path = pending_path, pending_path = null, status = 'ready',
         mime_type = $2, byte_size = $3, width = 800, height = 600
     where id = $1`,
    [assetId, mime, size],
  );
  return path;
}

const BACK_TO_BUNDLED = `status = 'bundled', storage_path = null, pending_path = null,
  mime_type = null, byte_size = null, width = null, height = null`;

async function visitorCanReadObject(path: string) {
  const result = await ok(anon, "select name from storage.objects where bucket_id = 'media' and name = $1", [
    path,
  ]);
  return result.rows.length === 1;
}

beforeAll(async () => {
  db = await createTestDatabase();
  ids.editor = await createAuthUser(db, "editor@example.test");
  ids.analyst = await createAuthUser(db, "analyst@example.test");
  ids.noRole = await createAuthUser(db, "visitor@example.test");
  await grantRoleAsOwner(db, ids.editor, "content_editor");
  await grantRoleAsOwner(db, ids.analyst, "analyst");
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("bundled files", () => {
  it("have one row each, matching the code's kind and English description", async () => {
    const { rows } = await db.query<{ bundled_key: string; kind: string; status: string; alt: string }>(
      `select a.bundled_key, a.kind, a.status, t.alt_text as alt
       from public.media_assets a
       join public.media_asset_translations t on t.asset_id = a.id and t.locale = 'en'
       where a.bundled_key is not null`,
    );
    expect(rows.map((row) => row.bundled_key).sort()).toEqual([...BUNDLED_MEDIA.keys()].sort());
    for (const row of rows) {
      const file = BUNDLED_MEDIA.get(row.bundled_key)!;
      expect(row.status).toBe("bundled");
      expect(row.kind).toBe(file.kind);
      expect(row.alt).toBe(file.alt.en);
    }
  });

  it("left nothing in the audit log when they were seeded", async () => {
    const { rows } = await db.query("select 1 from public.audit_logs where target_type like 'media%'");
    expect(rows).toEqual([]);
  });

  it("show every photo and video in the library, and none in the picker for content forms", async () => {
    const list = (filter: string | null) =>
      ok<{ bundled_key: string | null; kind: string; is_public: boolean }>(
        user(ids.editor),
        "select bundled_key, kind, is_public from public.media_list(null, $1, 100, 0)",
        [filter],
      );
    const all = (await list(null)).rows;
    expect(all).toHaveLength(BUNDLED_MEDIA.size);
    expect(all.every((row) => row.is_public)).toBe(true);
    expect((await list("videos")).rows.every((row) => row.kind === "video")).toBe(true);
    expect((await list("images")).rows.every((row) => row.kind === "image")).toBe(true);
    expect((await list("ready")).rows).toEqual([]);
    expect((await list("unused")).rows).toEqual([]);
  });

  it("tell visitors what they need and nothing more", async () => {
    const media = await siteMedia();
    expect(media).toHaveLength(BUNDLED_MEDIA.size);
    expect(Object.keys(media[0]!).sort()).toEqual(["alt", "credit", "file", "id", "key", "kind", "removed"]);
    expect(await rowFor("chef/banquet-hall")).toMatchObject({ removed: false, file: null, credit: null });
    expect((await rowFor("chef/banquet-hall")).alt.en).toContain("banquet room");
  });

  it("show an Amharic description to visitors only once its review is confirmed", async () => {
    const id = await assetIdFor("chef/sushi-platter");
    await ok(
      user(ids.editor),
      "insert into public.media_asset_translations (asset_id, locale, alt_text) values ($1, 'am', 'የሱሺ ገበታ')",
      [id],
    );
    expect((await rowFor("chef/sushi-platter")).alt.am).toBeUndefined();
    await ok(
      user(ids.editor),
      "update public.media_asset_translations set language_reviewed_at = now() where asset_id = $1 and locale = 'am'",
      [id],
    );
    expect((await rowFor("chef/sushi-platter")).alt.am).toBe("የሱሺ ገበታ");
  });

  it("can be deleted and restored, and visitors learn only that one is gone", async () => {
    const key = "chef/beef-risotto";
    const id = await assetIdFor(key);
    await ok(user(ids.editor), "update public.media_assets set removed_at = now() where id = $1", [id]);
    expect(await rowFor(key)).toMatchObject({ removed: true, alt: {}, credit: null, file: null });

    const list = (filter: string | null) =>
      ok<{ id: string }>(user(ids.editor), "select id from public.media_list(null, $1, 100, 0)", [filter]);
    expect((await list(null)).rows.map((row) => row.id)).not.toContain(id);
    expect((await list("removed")).rows.map((row) => row.id)).toEqual([id]);

    await ok(user(ids.editor), "update public.media_assets set removed_at = null where id = $1", [id]);
    expect((await rowFor(key)).removed).toBe(false);
    expect((await list("removed")).rows).toEqual([]);
  });

  it("are never deleted outright, by anyone but the database owner", async () => {
    const id = await assetIdFor("chef/salad-platters");
    const deleted = await asActor(
      db,
      user(ids.editor),
      "delete from public.media_assets where id = $1",
      [id],
      persist,
    );
    expect(deleted).toMatchObject({ ok: true, affectedRows: 0 });
    const { rows } = await db.query("select 1 from public.media_assets where id = $1", [id]);
    expect(rows).toHaveLength(1);
  });

  it("cannot be created, renamed or turned into another kind by staff", async () => {
    const id = await assetIdFor("chef/salad-platters");
    for (const [sql, params] of [
      ["insert into public.media_assets (title, bundled_key) values ('Forged', 'chef/forged')", []],
      ["update public.media_assets set bundled_key = 'chef/other' where id = $1", [id]],
      ["update public.media_assets set kind = 'video' where id = $1", [id]],
    ] as const) {
      const result = await asActor(db, user(ids.editor), sql, [...params]);
      expect(result).toMatchObject({ ok: false, code: PERMISSION_DENIED });
    }
    const asReady = await asActor(
      db,
      user(ids.editor),
      "insert into public.media_assets (id, title, status) values ($1, 'Forged', 'bundled')",
      [randomUUID()],
    );
    expect(asReady).toMatchObject({ ok: false, code: PERMISSION_DENIED });
  });

  it("refuse staff without media rights and visitors", async () => {
    const id = await assetIdFor("chef/salad-platters");
    for (const who of [anon, user(ids.analyst), user(ids.noRole)]) {
      const result = await asActor(
        db,
        who,
        "update public.media_assets set removed_at = now() where id = $1",
        [id],
      );
      if (result.ok) expect(result.affectedRows).toBe(0);
      else expect(result.code).toBe(PERMISSION_DENIED);
    }
    expect((await rowFor("chef/salad-platters")).removed).toBe(false);
  });

  it("can be replaced: the upload is public at once, and going back removes it", async () => {
    const key = "sample/dish-shiro";
    const id = await assetIdFor(key);
    const path = await replaceFile(id);
    expect(await rowFor(key)).toMatchObject({ removed: false, file: { path, width: 800, height: 600 } });
    expect(await visitorCanReadObject(path)).toBe(true);
    const listed = await ok<{ status: string; is_public: boolean }>(
      user(ids.editor),
      "select status, is_public from public.media_list('Shiro')",
    );
    expect(listed.rows).toEqual([{ status: "ready", is_public: true }]);

    await ok(user(ids.editor), `update public.media_assets set ${BACK_TO_BUNDLED} where id = $1`, [id]);
    expect((await rowFor(key)).file).toBeNull();
    expect(await visitorCanReadObject(path)).toBe(false);
    // No asset tracks the file any more, so Storage lets staff remove it.
    const removed = await ok(
      user(ids.editor),
      "delete from storage.objects where bucket_id = 'media' and name = $1",
      [path],
    );
    expect(removed.affectedRows).toBe(1);
  });

  it("keep a deleted file's upload out of reach", async () => {
    const key = "sample/dish-gomen";
    const id = await assetIdFor(key);
    const path = await replaceFile(id);
    // A replaced file must go back to the bundled state in the same change as deleting it.
    const keepingFile = await asActor(
      db,
      user(ids.editor),
      "update public.media_assets set removed_at = now() where id = $1",
      [id],
    );
    expect(keepingFile).toMatchObject({ ok: false, code: CHECK_VIOLATION });

    await ok(
      user(ids.editor),
      `update public.media_assets set ${BACK_TO_BUNDLED}, removed_at = now() where id = $1`,
      [id],
    );
    expect(await visitorCanReadObject(path)).toBe(false);
    expect(await rowFor(key)).toMatchObject({ removed: true, file: null });
    await ok(user(ids.editor), "update public.media_assets set removed_at = null where id = $1", [id]);
  });

  it("cannot leave a half-finished state", async () => {
    const id = await assetIdFor("chef/roast-drumsticks");
    for (const [sql, code] of [
      ["update public.media_assets set status = 'pending' where id = $1", BAD_PARAMETER],
      ["update public.media_assets set mime_type = 'image/jpeg' where id = $1", CHECK_VIOLATION],
    ] as const) {
      expect(await asActor(db, user(ids.editor), sql, [id])).toMatchObject({ ok: false, code });
    }
  });

  it("record deleting, restoring and going back in the audit log", async () => {
    const id = await assetIdFor("sample/dish-kitfo");
    await replaceFile(id);
    await ok(user(ids.editor), `update public.media_assets set ${BACK_TO_BUNDLED} where id = $1`, [id]);
    await ok(user(ids.editor), "update public.media_assets set removed_at = now() where id = $1", [id]);
    await ok(user(ids.editor), "update public.media_assets set removed_at = null where id = $1", [id]);
    const { rows } = await db.query<{ action: string; actor_id: string }>(
      "select action, actor_id from public.audit_logs where target_id = $1 order by id",
      [id],
    );
    expect(rows.map((row) => row.action)).toEqual([
      "media.updated",
      "media.uploaded",
      "media.reverted",
      "media.removed",
      "media.restored",
    ]);
    expect(new Set(rows.map((row) => row.actor_id))).toEqual(new Set([ids.editor]));
  });
});

describe("uploads", () => {
  it("cannot use the deleted state, which is only for bundled files", async () => {
    const id = randomUUID();
    await ok(user(ids.editor), "insert into public.media_assets (id, title) values ($1, 'Mine')", [id]);
    const result = await asActor(
      db,
      user(ids.editor),
      "update public.media_assets set removed_at = now() where id = $1",
      [id],
    );
    expect(result).toMatchObject({ ok: false, code: CHECK_VIOLATION });
    await ok(user(ids.editor), "delete from public.media_assets where id = $1", [id]);
  });

  it("stay private while they are images no published content uses", async () => {
    const id = randomUUID();
    const path = objectPath(id);
    await ok(
      user(ids.editor),
      "insert into public.media_assets (id, title, pending_path) values ($1, 'Private', $2)",
      [id, path],
    );
    await ok(user(ids.editor), "insert into storage.objects (bucket_id, name) values ('media', $1)", [path]);
    await ok(
      user(ids.editor),
      `update public.media_assets
       set storage_path = pending_path, pending_path = null, status = 'ready',
           mime_type = 'image/jpeg', byte_size = 2048, width = 800, height = 600
       where id = $1`,
      [id],
    );
    expect(await visitorCanReadObject(path)).toBe(false);
    expect((await siteMedia()).map((row) => row.id)).not.toContain(id);
  });
});

describe("videos", () => {
  let videoId: string;
  let videoPath: string;

  const finish = (id: string, mime: string, size: number) =>
    asActor(
      db,
      user(ids.editor),
      `update public.media_assets
       set storage_path = pending_path, pending_path = null, status = 'ready',
           mime_type = $2, byte_size = $3, width = 1280, height = 720
       where id = $1`,
      [id, mime, size],
      persist,
    );

  async function reserve(ext: string, kind = "video") {
    const id = randomUUID();
    const path = objectPath(id, ext);
    await ok(
      user(ids.editor),
      "insert into public.media_assets (id, title, kind, pending_path) values ($1, 'A clip', $2, $3)",
      [id, kind, path],
    );
    await ok(user(ids.editor), "insert into storage.objects (bucket_id, name) values ('media', $1)", [path]);
    return { id, path };
  }

  it("fit the bucket, which takes MP4 and WebM up to 50 MB", async () => {
    const { rows } = await db.query<{ file_size_limit: number; allowed_mime_types: string[] }>(
      "select file_size_limit, allowed_mime_types from storage.buckets where id = 'media'",
    );
    expect(Number(rows[0]!.file_size_limit)).toBe(50 * MEGABYTE);
    expect(rows[0]!.allowed_mime_types).toEqual(expect.arrayContaining(["video/mp4", "video/webm"]));
  });

  it("are public as soon as they are finished, without published content", async () => {
    ({ id: videoId, path: videoPath } = await reserve("mp4"));
    expect(await visitorCanReadObject(videoPath)).toBe(false);
    expect((await siteMedia()).map((row) => row.id)).not.toContain(videoId);

    await ok(
      user(ids.editor),
      "insert into public.media_asset_translations (asset_id, locale, alt_text) values ($1, 'en', 'A clip of injera')",
      [videoId],
    );
    expect(await finish(videoId, "video/mp4", 30 * MEGABYTE)).toMatchObject({ ok: true });

    expect(await visitorCanReadObject(videoPath)).toBe(true);
    const row = (await siteMedia()).find((entry) => entry.id === videoId)!;
    expect(row).toMatchObject({
      key: null,
      kind: "video",
      removed: false,
      alt: { en: "A clip of injera" },
      file: { path: videoPath, width: 1280, height: 720 },
    });
  });

  it("appear under videos in the library, but never in the picker for content forms", async () => {
    const list = (filter: string) =>
      ok<{ id: string }>(user(ids.editor), "select id from public.media_list(null, $1, 100, 0)", [filter]);
    expect((await list("videos")).rows.map((row) => row.id)).toContain(videoId);
    expect((await list("ready")).rows.map((row) => row.id)).not.toContain(videoId);
    expect((await list("unused")).rows.map((row) => row.id)).not.toContain(videoId);
  });

  it("are refused over 50 MB, and images still at 10 MB", async () => {
    const video = await reserve("mp4");
    expect(await finish(video.id, "video/mp4", 51 * MEGABYTE)).toMatchObject({
      ok: false,
      code: CHECK_VIOLATION,
    });
    const image = await reserve("jpg", "image");
    expect(await finish(image.id, "image/jpeg", 11 * MEGABYTE)).toMatchObject({
      ok: false,
      code: CHECK_VIOLATION,
    });
  });

  it("cannot be labelled as another type or kind", async () => {
    const mismatch = await reserve("webm");
    expect(await finish(mismatch.id, "video/mp4", MEGABYTE)).toMatchObject({
      ok: false,
      code: CHECK_VIOLATION,
    });
    const asImage = await reserve("mp4", "image");
    expect(await finish(asImage.id, "video/mp4", MEGABYTE)).toMatchObject({
      ok: false,
      code: CHECK_VIOLATION,
    });
    const notVideo = await reserve("jpg");
    expect(await finish(notVideo.id, "image/jpeg", MEGABYTE)).toMatchObject({
      ok: false,
      code: CHECK_VIOLATION,
    });
  });

  it("go for good when deleted, unlike bundled files", async () => {
    await ok(user(ids.editor), "delete from public.media_assets where id = $1", [videoId]);
    expect((await siteMedia()).map((row) => row.id)).not.toContain(videoId);
    expect(await visitorCanReadObject(videoPath)).toBe(false);
  });

  it("can replace a bundled clip", async () => {
    const key = "video/platter";
    const id = await assetIdFor(key);
    const path = await replaceFile(id, "mp4", "video/mp4", 20 * MEGABYTE);
    expect((await rowFor(key)).file?.path).toBe(path);
    expect(await visitorCanReadObject(path)).toBe(true);
  });
});
