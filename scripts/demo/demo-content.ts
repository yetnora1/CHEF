/*
 * DEMO CONTENT for `npm run dev:demo` (scripts/dev-demo.mjs). Never used by the
 * application itself, by tests or by any real database.
 *
 * Written straight into the in-memory test double (tests/e2e/support/
 * fake-supabase.ts) so every screen can be reviewed with realistic amounts of
 * content: published pages, services, menu, gallery and journal, images, and
 * inquiries in every stage of the workflow.
 *
 * Rules followed here:
 *   - Every text says it is sample or demo content. Nothing describes CHEF
 *     SIS's real biography, clients, events, prices or contact details.
 *   - Images are generated abstract patterns labelled "Demo image"; no
 *     photograph is presented as CHEF SIS's work.
 *   - English is published. Amharic versions are left as unreviewed drafts:
 *     confirming a fluent speaker's review would be a false attestation, and it
 *     shows the review gate and the English fallback instead.
 *   - Customers use reserved example.test addresses.
 */
import { randomBytes, randomUUID } from "node:crypto";
import type { PGlite, Transaction } from "@electric-sql/pglite";
import sharp from "sharp";
import type { FakeSupabaseSeed, StoredFile } from "../../tests/e2e/support/fake-supabase";

const CREDIT = "Generated demo image";

const PALETTE = {
  forest: "#173d32",
  gold: "#d3a45b",
  terracotta: "#9d4135",
  ivory: "#f5f0e6",
  charcoal: "#171d1a",
  sage: "#c9d2c9",
};

type Variant = "table" | "textile" | "arches" | "lattice" | "rings" | "lozenge";

/** An abstract, brand-coloured composition with a visible "Demo image" label. */
function demoSvg(variant: Variant, width: number, height: number, label: string): string {
  const { forest, gold, terracotta, ivory, charcoal, sage } = PALETTE;
  const cx = width / 2;
  const cy = height / 2;
  const min = Math.min(width, height);
  let body = "";

  switch (variant) {
    case "table": {
      body += `<rect width="100%" height="100%" fill="${forest}"/>`;
      body += `<circle cx="${cx}" cy="${cy}" r="${min * 0.3}" fill="${ivory}" stroke="${gold}" stroke-width="${min * 0.02}"/>`;
      body += `<circle cx="${cx}" cy="${cy}" r="${min * 0.2}" fill="none" stroke="${terracotta}" stroke-width="${min * 0.012}" stroke-dasharray="2 ${min * 0.03}" stroke-linecap="round"/>`;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const x = cx + Math.cos(a) * min * 0.43;
        const y = cy + Math.sin(a) * min * 0.43;
        body += `<circle cx="${x}" cy="${y}" r="${min * 0.07}" fill="${i % 2 ? gold : terracotta}" opacity="0.92"/>`;
      }
      break;
    }
    case "textile": {
      body += `<rect width="100%" height="100%" fill="${ivory}"/>`;
      const band = height / 7;
      for (let row = 0; row < 7; row++) {
        const y = row * band;
        const color = [terracotta, forest, gold][row % 3];
        body += `<rect y="${y + band * 0.42}" width="${width}" height="${band * 0.06}" fill="${color}"/>`;
        for (let x = band * 0.5; x < width; x += band) {
          body += `<path d="M${x} ${y + band * 0.2} L${x + band * 0.25} ${y + band * 0.45} L${x} ${y + band * 0.7} L${x - band * 0.25} ${y + band * 0.45}Z" fill="${color}"/>`;
        }
      }
      break;
    }
    case "arches": {
      body += `<rect width="100%" height="100%" fill="${charcoal}"/>`;
      for (let i = 0; i < 6; i++) {
        const w = width * (0.75 - i * 0.11);
        const h = height * (0.85 - i * 0.12);
        const x = cx - w / 2;
        const y = height - h;
        body += `<path d="M${x} ${height} V${y + w / 2} A${w / 2} ${w / 2} 0 0 1 ${x + w} ${y + w / 2} V${height}" fill="none" stroke="${i % 2 ? gold : sage}" stroke-width="${min * 0.008}"/>`;
      }
      break;
    }
    case "lattice": {
      body += `<rect width="100%" height="100%" fill="${terracotta}"/>`;
      const step = min / 6;
      for (let x = -height; x < width + height; x += step) {
        body += `<path d="M${x} 0 L${x + height} ${height} M${x + height} 0 L${x} ${height}" stroke="${ivory}" stroke-opacity="0.35" stroke-width="${min * 0.006}"/>`;
      }
      body += `<circle cx="${cx}" cy="${cy}" r="${min * 0.22}" fill="${gold}"/>`;
      break;
    }
    case "rings": {
      body += `<rect width="100%" height="100%" fill="${gold}"/>`;
      for (let i = 1; i <= 7; i++) {
        body += `<circle cx="${cx}" cy="${cy}" r="${(min * i) / 15}" fill="none" stroke="${charcoal}" stroke-opacity="${0.9 - i * 0.09}" stroke-width="${min * 0.01}"/>`;
      }
      body += `<circle cx="${cx}" cy="${cy}" r="${min * 0.05}" fill="${forest}"/>`;
      break;
    }
    case "lozenge": {
      body += `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${forest}"/><stop offset="1" stop-color="${charcoal}"/></linearGradient></defs>`;
      body += `<rect width="100%" height="100%" fill="url(#g)"/>`;
      const r = min * 0.32;
      body += `<path d="M${cx} ${cy - r} L${cx + r} ${cy} L${cx} ${cy + r} L${cx - r} ${cy}Z" fill="${gold}"/>`;
      body += `<path d="M${cx} ${cy - r * 0.5} L${cx + r * 0.5} ${cy} L${cx} ${cy + r * 0.5} L${cx - r * 0.5} ${cy}Z" fill="${forest}"/>`;
      break;
    }
  }

  const pad = Math.round(min * 0.04);
  const fontSize = Math.max(18, Math.round(min * 0.035));
  const tagWidth = Math.round(fontSize * (label.length * 0.62 + 1.6));
  const tagHeight = Math.round(fontSize * 2);
  body += `<rect x="${pad}" y="${height - pad - tagHeight}" width="${tagWidth}" height="${tagHeight}" rx="${tagHeight / 2}" fill="${charcoal}" fill-opacity="0.78"/>`;
  body += `<text x="${pad + fontSize * 0.8}" y="${height - pad - tagHeight / 2}" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700" letter-spacing="2" fill="${ivory}">${label}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}

type ImageSpec = { title: string; alt: string; variant: Variant; width: number; height: number };

async function addImage(db: PGlite, files: Map<string, StoredFile>, spec: ImageSpec): Promise<string> {
  const id = randomUUID();
  const path = `assets/${id}/${randomBytes(16).toString("hex")}.jpg`;
  const bytes = await sharp(Buffer.from(demoSvg(spec.variant, spec.width, spec.height, "DEMO IMAGE")))
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  await db.query(
    `insert into public.media_assets (id, status, title, credit, storage_path, mime_type, byte_size, width, height)
     values ($1, 'ready', $2, $3, $4, 'image/jpeg', $5, $6, $7)`,
    [id, spec.title, CREDIT, path, bytes.byteLength, spec.width, spec.height],
  );
  await db.query(
    "insert into public.media_asset_translations (asset_id, locale, alt_text) values ($1, 'en', $2)",
    [id, spec.alt],
  );
  await db.query("insert into storage.objects (bucket_id, name, metadata) values ('media', $1, $2::jsonb)", [
    path,
    JSON.stringify({ mimetype: "image/jpeg", size: bytes.byteLength }),
  ]);
  files.set(`media/${path}`, { bytes, contentType: "image/jpeg" });
  return id;
}

const one = async <T>(db: PGlite | Transaction, sql: string, params: unknown[] = []): Promise<T> =>
  (await db.query<T>(sql, params)).rows[0]!;

/** A future date in Addis Ababa, `days` from today, as YYYY-MM-DD. */
function futureDate(days: number): string {
  const date = new Date(Date.now() + days * 86_400_000);
  return date.toISOString().slice(0, 10);
}

export const seedDemoContent: FakeSupabaseSeed = async ({ db, files, users }) => {
  const owner = users.get("owner@example.test")!;
  const manager = users.get("manager@example.test")!;

  // --- Images -----------------------------------------------------------------
  const image = async (spec: ImageSpec) => addImage(db, files, spec);
  const heroImage = await image({
    title: "Demo: hero pattern",
    alt: "Demo image: an abstract table setting drawn as circles in forest green, gold and terracotta.",
    variant: "table",
    width: 1600,
    height: 2000,
  });
  const portraitImage = await image({
    title: "Demo: portrait placeholder pattern",
    alt: "Demo image: nested gold arches on a dark background, standing in for the chef's portrait.",
    variant: "arches",
    width: 1600,
    height: 2000,
  });
  const storyImage = await image({
    title: "Demo: textile bands",
    alt: "Demo image: rows of woven-style lozenge bands in terracotta, green and gold on ivory.",
    variant: "textile",
    width: 1600,
    height: 2000,
  });
  const serviceImages = await Promise.all(
    (["rings", "lattice", "lozenge"] as const).map((variant, i) =>
      image({
        title: `Demo: service image ${i + 1}`,
        alt: `Demo image ${i + 1}: an abstract ${variant === "rings" ? "pattern of concentric rings" : variant === "lattice" ? "diagonal lattice with a gold circle" : "gold lozenge on deep green"}.`,
        variant,
        width: 1600,
        height: 1200,
      }),
    ),
  );
  const galleryImages = await Promise.all(
    (["table", "textile", "rings", "arches", "lattice", "lozenge"] as const).map((variant, i) =>
      image({
        title: `Demo: gallery image ${i + 1}`,
        alt: `Demo gallery image ${i + 1}: an abstract pattern in the site's colours.`,
        variant,
        width: 1600,
        height: 1200,
      }),
    ),
  );
  const dishImage = await image({
    title: "Demo: dish thumbnail",
    alt: "Demo image: concentric rings on gold, standing in for a dish photograph.",
    variant: "rings",
    width: 800,
    height: 800,
  });
  const journalImage = await image({
    title: "Demo: journal cover",
    alt: "Demo image: a gold lozenge on a deep green gradient.",
    variant: "lozenge",
    width: 1600,
    height: 900,
  });
  // One image that nothing uses yet: stays private, shows the "unused" state.
  await image({
    title: "Demo: unused image",
    alt: "Demo image: a terracotta lattice, not used anywhere yet.",
    variant: "lattice",
    width: 1200,
    height: 900,
  });

  // --- Pages ------------------------------------------------------------------
  const homeSections = {
    hero: {
      eyebrow: "Sample content · Demo mode",
      headline: "A sample headline for the homepage.",
      lede: "Sample text: this is where CHEF SIS's own introduction will appear once it has been written and published in the admin.",
    },
    about: {
      heading: "Meet the chef (sample)",
      body: "Sample text for the demo. The chef's own story, in their own words, replaces this paragraph.\n\nThis section supports **bold**, *italic* and [links](/en/services).",
    },
    services: {
      heading: "Services (sample)",
      lede: "Sample introduction to the services. Each card below links to a sample service page.",
    },
    inquiry: {
      heading: "Planning an event? (sample)",
      body: "Sample text inviting visitors to send an inquiry through the form.",
    },
  };
  await db.query(
    `insert into public.page_translations (page_key, locale, status, title, sections)
     values ('home', 'en', 'published', 'Home', $1::jsonb)`,
    [JSON.stringify(homeSections)],
  );
  await db.query(
    "insert into public.page_images (page_key, slot, asset_id) values ('home', 'hero', $1), ('home', 'about', $2)",
    [heroImage, portraitImage],
  );
  await db.query("update public.pages set status = 'published' where key = 'home'");

  const aboutSections = {
    intro: {
      heading: "About the chef (sample)",
      body: "Sample introduction for the demo. Nothing on this page describes CHEF SIS's real biography, training or clients.",
    },
    story: {
      heading: "A sample story section",
      body: "## A sample sub-heading\n\nSample paragraph text, long enough to show how the About page sets body copy next to an image.\n\n- A sample list item\n- Another sample list item",
    },
    philosophy: {
      heading: "A sample philosophy section",
      body: "Sample closing paragraph for the demo.",
    },
  };
  await db.query(
    `insert into public.page_translations (page_key, locale, status, title, sections)
     values ('about', 'en', 'published', 'About the chef (sample)', $1::jsonb)`,
    [JSON.stringify(aboutSections)],
  );
  // An Amharic draft that still needs a fluent speaker's review.
  await db.query(
    `insert into public.page_translations (page_key, locale, status, title, sections)
     values ('about', 'am', 'draft', 'ስለ ሼፉ (ናሙና)', $1::jsonb)`,
    [JSON.stringify({ intro: { heading: "ስለ ሼፉ (ናሙና)", body: "ለማሳያ የተዘጋጀ ናሙና ጽሑፍ።" } })],
  );
  await db.query(
    "insert into public.page_images (page_key, slot, asset_id) values ('about', 'portrait', $1), ('about', 'story', $2)",
    [portraitImage, storyImage],
  );
  await db.query("update public.pages set status = 'published' where key = 'about'");

  // --- Services (rows come from supabase/seed.sql) ------------------------------
  const services = (
    await db.query<{ id: string; slug: string }>(
      "select id, slug from public.services where status = 'published' order by sort_order",
    )
  ).rows;
  for (const [index, service] of services.entries()) {
    await db.query("update public.services set image_id = $2 where id = $1", [
      service.id,
      serviceImages[index % 3],
    ]);
    await db.query(
      "update public.service_translations set body = $2 where service_id = $1 and locale = 'en'",
      [
        service.id,
        `## What this sample page shows\n\nSample service description for the demo. The final text describes how CHEF SIS works for this kind of event.\n\n- Sample point about the menu\n- Sample point about service style\n- Sample point about planning\n\nTo talk about your own event, [send an inquiry](/en/book).`,
      ],
    );
  }

  // --- Menu ---------------------------------------------------------------------
  const categories = [
    {
      slug: "sample-starters",
      name: "Sample starters",
      description: "Sample category description for the demo menu.",
    },
    {
      slug: "sample-main-dishes",
      name: "Sample main dishes",
      description: "Dishes are sample entries, not a confirmed menu.",
    },
  ];
  const categoryIds: string[] = [];
  for (const [index, category] of categories.entries()) {
    const { id } = await one<{ id: string }>(
      db,
      "insert into public.menu_categories (slug, status, sort_order) values ($1, 'published', $2) returning id",
      [category.slug, (index + 1) * 10],
    );
    await db.query(
      `insert into public.menu_category_translations (category_id, locale, status, name, description)
       values ($1, 'en', 'published', $2, $3)`,
      [id, category.name, category.description],
    );
    categoryIds.push(id);
  }
  const dishes = [
    {
      category: 0,
      name: "Sample dish: lentil stew",
      description: "Sample description of a slow-cooked lentil dish.",
      tags: ["vegan", "fasting"],
      image: dishImage,
    },
    {
      category: 0,
      name: "Sample dish: chickpea stew",
      description: "Sample description of a chickpea dish.",
      tags: ["vegetarian", "fasting"],
      image: null,
    },
    { category: 0, name: "Sample dish: seasonal greens", description: null, tags: ["vegan"], image: null },
    {
      category: 1,
      name: "Sample dish: spiced chicken stew",
      description: "Sample description of a festive dish.",
      tags: ["spicy"],
      image: null,
    },
    {
      category: 1,
      name: "Sample dish: sautéed beef",
      description: "Sample description of a sautéed dish.",
      tags: [],
      image: null,
    },
  ];
  for (const [index, dish] of dishes.entries()) {
    const { id } = await one<{ id: string }>(
      db,
      `insert into public.menu_items (category_id, status, sort_order, image_id, dietary_tags)
       values ($1, 'published', $2, $3, $4::public.dietary_tag[]) returning id`,
      [categoryIds[dish.category], (index + 1) * 10, dish.image, `{${dish.tags.join(",")}}`],
    );
    await db.query(
      `insert into public.menu_item_translations (item_id, locale, status, name, description)
       values ($1, 'en', 'published', $2, $3)`,
      [id, dish.name, dish.description],
    );
  }

  // --- Gallery --------------------------------------------------------------------
  const eventTypes = ["wedding", "corporate", "summit", "private_dining", "wedding", null] as const;
  for (const [index, asset] of galleryImages.entries()) {
    const { id } = await one<{ id: string }>(
      db,
      `insert into public.gallery_items (asset_id, status, sort_order, event_type)
       values ($1, 'published', $2, $3) returning id`,
      [asset, (index + 1) * 10, eventTypes[index]],
    );
    await db.query(
      `insert into public.gallery_item_translations (item_id, locale, status, caption)
       values ($1, 'en', 'published', $2)`,
      [id, `Sample caption ${index + 1}: a generated demo image, not a photograph of a real event.`],
    );
  }

  // --- Journal ---------------------------------------------------------------------
  const published = await one<{ id: string }>(
    db,
    `insert into public.journal_posts (slug, status, published_at, cover_image_id)
     values ('sample-journal-post', 'published', now() - interval '5 days', $1) returning id`,
    [journalImage],
  );
  await db.query(
    `insert into public.journal_post_translations (post_id, locale, status, title, excerpt, body)
     values ($1, 'en', 'published', $2, $3, $4)`,
    [
      published.id,
      "A sample journal post",
      "Sample excerpt for the demo journal.",
      "Sample article text for the demo.\n\n## A sample heading\n\nMore sample text, with a [link to the menu](/en/menu).",
    ],
  );
  const inReview = await one<{ id: string }>(
    db,
    "insert into public.journal_posts (slug, status) values ('sample-post-in-review', 'in_review') returning id",
  );
  await db.query(
    `insert into public.journal_post_translations (post_id, locale, status, title, excerpt)
     values ($1, 'en', 'in_review', 'A sample post waiting for review', 'Sample excerpt.')`,
    [inReview.id],
  );

  // --- Inquiries --------------------------------------------------------------------
  type Inquiry = {
    name: string;
    email: string;
    phone: string | null;
    method: "email" | "phone" | "messaging_app";
    type: "wedding" | "corporate" | "summit" | "private_dining" | "culinary_experience" | "other";
    inDays: number | null;
    guests: number;
    venue: string | null;
    needs: string;
    message: string | null;
    locale: "en" | "am";
    receivedHoursAgo: number;
    path: ("in_review" | "contacted" | "quoted" | "confirmed" | "declined")[];
    assign?: boolean;
    note?: string;
  };
  const inquiries: Inquiry[] = [
    {
      name: "Sample Customer A",
      email: "sample.a@example.test",
      phone: null,
      method: "email",
      type: "wedding",
      inDays: 60,
      guests: 180,
      venue: "Sample venue, Addis Ababa",
      needs: "Sample request: a wedding dinner with vegetarian options.",
      message: null,
      locale: "en",
      receivedHoursAgo: 1,
      path: [],
    },
    {
      name: "Sample Customer A",
      email: "sample.a@example.test",
      phone: null,
      method: "email",
      type: "wedding",
      inDays: 60,
      guests: 200,
      venue: "Sample venue, Addis Ababa",
      needs: "Sample request sent again with a different guest count.",
      message: null,
      locale: "en",
      receivedHoursAgo: 0.5,
      path: [],
    },
    {
      name: "Sample Customer B",
      email: "sample.b@example.test",
      phone: "+251 911 000 002",
      method: "phone",
      type: "corporate",
      inDays: 30,
      guests: 60,
      venue: null,
      needs: "Sample request: lunch for a team event.",
      message: "Sample message.",
      locale: "en",
      receivedHoursAgo: 26,
      path: [],
    },
    {
      name: "ናሙና ደንበኛ ሐ",
      email: "sample.c@example.test",
      phone: "+251 911 000 003",
      method: "messaging_app",
      type: "wedding",
      inDays: 90,
      guests: 250,
      venue: null,
      needs: "ለማሳያ የተዘጋጀ ናሙና ጥያቄ።",
      message: null,
      locale: "am",
      receivedHoursAgo: 50,
      path: [],
    },
    {
      name: "Sample Customer D",
      email: "sample.d@example.test",
      phone: null,
      method: "email",
      type: "summit",
      inDays: 75,
      guests: 250,
      venue: "Sample conference centre",
      needs: "Sample request: catering for a two-day summit.",
      message: null,
      locale: "en",
      receivedHoursAgo: 72,
      path: ["in_review"],
      assign: true,
    },
    {
      name: "Sample Customer E",
      email: "sample.e@example.test",
      phone: "+251 911 000 005",
      method: "phone",
      type: "private_dining",
      inDays: 14,
      guests: 12,
      venue: null,
      needs: "Sample request: a private dinner.",
      message: null,
      locale: "en",
      receivedHoursAgo: 120,
      path: ["in_review", "contacted"],
      assign: true,
      note: "Sample note: called to discuss the menu (demo).",
    },
    {
      name: "Sample Customer F",
      email: "sample.f@example.test",
      phone: null,
      method: "email",
      type: "wedding",
      inDays: 120,
      guests: 300,
      venue: "Sample garden venue",
      needs: "Sample request: a wedding feast.",
      message: null,
      locale: "en",
      receivedHoursAgo: 200,
      path: ["in_review", "contacted", "quoted"],
      assign: true,
    },
    {
      name: "Sample Customer G",
      email: "sample.g@example.test",
      phone: null,
      method: "email",
      type: "culinary_experience",
      inDays: 21,
      guests: 8,
      venue: null,
      needs: "Sample request: a cooking experience for visitors.",
      message: null,
      locale: "en",
      receivedHoursAgo: 300,
      path: ["in_review", "contacted", "confirmed"],
      assign: true,
    },
    {
      name: "Sample Customer H",
      email: "sample.h@example.test",
      phone: null,
      method: "email",
      type: "other",
      inDays: null,
      guests: 40,
      venue: null,
      needs: "Sample request outside the offered services.",
      message: null,
      locale: "en",
      receivedHoursAgo: 400,
      path: ["declined"],
    },
  ];

  for (const inquiry of inquiries) {
    const { inquiry_reference } = await one<{ inquiry_reference: string }>(
      db,
      `select inquiry_reference from public.submit_inquiry(
         $1::uuid, $2, $3, $4, $5::public.contact_method, $6::public.event_type, $7::date, $8,
         $9, $10, $11, $12::public.locale_code, true, false)`,
      [
        randomUUID(),
        inquiry.name,
        inquiry.email,
        inquiry.phone,
        inquiry.method,
        inquiry.type,
        inquiry.inDays === null ? null : futureDate(inquiry.inDays),
        inquiry.guests,
        inquiry.venue,
        inquiry.needs,
        inquiry.message,
        inquiry.locale,
      ],
    );
    const { id } = await one<{ id: string }>(db, "select id from public.bookings where reference = $1", [
      inquiry_reference,
    ]);
    const received = `${inquiry.receivedHoursAgo} hours`;
    await db.query("update public.bookings set created_at = now() - $2::interval where id = $1", [
      id,
      received,
    ]);
    await db.query(
      "update public.booking_status_history set changed_at = now() - $2::interval where booking_id = $1",
      [id, received],
    );

    if (inquiry.path.length || inquiry.assign || inquiry.note) {
      // Staff-side changes run as the demo owner, as they would in the admin.
      await db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claims', $1, true)", [
          JSON.stringify({ sub: owner.id, role: "authenticated" }),
        ]);
        for (const status of inquiry.path) {
          await tx.query("update public.bookings set status = $2 where id = $1", [id, status]);
        }
        if (inquiry.assign)
          await tx.query("update public.bookings set assigned_to = $2 where id = $1", [id, manager.id]);
        if (inquiry.note) {
          await tx.query(
            "insert into public.booking_notes (booking_id, author_id, body) values ($1, $2, $3)",
            [id, owner.id, inquiry.note],
          );
        }
      });
      // Spread the staff steps over the hours after the inquiry arrived.
      await db.query(
        `with ordered as (
           select id, row_number() over (order by id) as n
           from public.booking_status_history where booking_id = $1 and from_status is not null)
         update public.booking_status_history h
         set changed_at = b.created_at + o.n * interval '5 hours'
         from ordered o, public.bookings b
         where h.id = o.id and b.id = $1`,
        [id],
      );
      await db.query(
        `update public.booking_notes n set created_at = b.created_at + interval '7 hours'
         from public.bookings b where n.booking_id = b.id and b.id = $1`,
        [id],
      );
    }
  }
};
