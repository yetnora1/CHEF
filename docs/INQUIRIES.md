# Event inquiries (Stage 2)

A visitor's inquiry is **not a booking**. The system records the request, acknowledges receipt with a
reference, and lets authorised staff work it through an explicit lifecycle. Nothing tells a customer
that a date is available or an event is confirmed.

## Flow

```
Browser (/en/book, /am/book)
  │  client-side validation (same Zod schema as the server), idempotency key, Turnstile token
  ▼
Server action submitInquiryAction  (src/features/bookings/submit-action.ts)
  │  Next.js: same-origin check (CSRF), 64 KB body limit
  │  processInquirySubmission (src/features/bookings/server/submission.ts):
  │    1. configuration check → "not open yet" if storage or CAPTCHA is missing (fail closed)
  │    2. honeypot field
  │    3. validation + normalisation (server is authoritative)
  │    4. per-IP rate limits (Postgres, shared by all instances)
  │    5. Turnstile verification (Cloudflare unreachable ⇒ rejected); each solved token is accepted once
  │    6. per-mailbox and site-wide rate limits (only verified requests count)
  │    7. public.submit_inquiry(...) with the server secret key
  │    8. email delivery queued with after() (optional)
  ▼
Postgres
     public.submit_inquiry  (SECURITY DEFINER; executable only by service_role)
       status = new, unassigned, source = website, consent time = now()
       idempotent replay by submission key · possible-duplicate hint
       status history row (trigger) · outbox rows if email is enabled
```

The response contains only a status and, on success, the public reference (`CH-` + 10 hex
characters, random, non-sequential). Database errors, internal ids and submitted values are never
echoed back.

## Form fields

| Field              | Rules                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| Full name          | required, 2–160 characters                                                                                      |
| Email              | required, valid address, ≤ 254, lower-cased                                                                     |
| Preferred contact  | email · phone call · messaging app                                                                              |
| Phone              | optional; required for phone/messaging; `+`, digits, spaces, `().-`; 7–15 digits (no country assumption)        |
| Event type         | wedding/celebration · corporate · conference/summit · private dining · culinary experience for visitors · other |
| Event date         | optional; tomorrow (Addis Ababa time) to ~3 years ahead                                                         |
| Guests             | required whole number, 1–10,000                                                                                 |
| Location / venue   | optional, ≤ 300                                                                                                 |
| Requested services | required, 3–2,000                                                                                               |
| Additional notes   | optional, ≤ 3,000                                                                                               |
| Consent            | required; links to the privacy notice; time stored                                                              |

Text is NFC-normalised; control characters, zero-width spaces and bidirectional overrides are
removed. Markup is stored as plain text and always rendered escaped (React in the admin, explicit
escaping in emails), never interpreted. **No budget field**: there are no approved price bands or
currency, and a budget question would imply pricing the business has not set.

## Duplicates and retries

- The browser creates a random **submission key** for each inquiry and reuses it for retries. Sending
  the same key with the same content returns the original reference (`is_replay`) without creating a
  second inquiry. The same key with different content is refused ("reload to send a new inquiry").
- If the connection drops, the form says it cannot tell whether the inquiry arrived and asks the
  visitor to send again, which is safe because of the key.
- A different key is always a new inquiry: repeat customers are never rejected. If the same email
  asked about the same event type and date within 7 days, staff see a "possible duplicate" hint.

## Abuse protection

| Control             | Detail                                                                                                                                                         | Status                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| CAPTCHA             | Cloudflare Turnstile, verified server-side with action `inquiry` (and, in production, the hostname of `NEXT_PUBLIC_SITE_URL`); each solved token accepted once | Verified with Cloudflare's **test** keys (siteverify and widget); **not with a live widget** |
| Rate limits         | see below                                                                                                                                                      | Implemented in Postgres; tested on PGlite and e2e                                            |
| Honeypot            | hidden `website` field                                                                                                                                         | Implemented                                                                                  |
| Body size           | server actions ≤ 64 KB                                                                                                                                         | Configured                                                                                   |
| Field limits        | schema + database constraints                                                                                                                                  | Tested                                                                                       |
| Privacy of counters | IP and email are HMAC-hashed with a key derived from the server secret; windows expire within a day                                                            | Tested                                                                                       |

### Rate limits

| Phase          | Bucket     | Limit                | Why here                                       |
| -------------- | ---------- | -------------------- | ---------------------------------------------- |
| before CAPTCHA | client IP  | 5 / 10 min, 20 / day | cheap filter; also caps calls to Cloudflare    |
| after CAPTCHA  | mailbox    | 3 / hour             | case and `+tag` variants count as one address  |
| after CAPTCHA  | whole site | 300 / hour           | ceiling on stored inquiries and outgoing email |

Only requests that solved a challenge are charged to the mailbox and site-wide budgets, so junk
traffic cannot lock a customer (or everyone) out without solving CAPTCHAs. A rejected request still
counts against its IP.

Each verified token is also recorded (a keyed hash, one day) and accepted only once. The server sends
Cloudflare the submission key as `idempotency_key`, and Cloudflare answers a token resent with the
same key with its first result, so without this one solved challenge could be replayed to drain the
shared budgets. The form requests a fresh token after every attempt, so visitors never hit this.

Windows are fixed and aligned to the clock, so a burst that crosses a window boundary can reach up
to twice a limit (a known gap; sliding windows are a hardening work item in
[VERIFICATION.md](VERIFICATION.md#7-work-items-not-done-in-this-stage)).

### CAPTCHA modes

| Environment      | Turnstile keys                             | `INQUIRY_LOCAL_CAPTCHA_BYPASS` | Result                                                             |
| ---------------- | ------------------------------------------ | ------------------------------ | ------------------------------------------------------------------ |
| production build | real pair                                  | any                            | verified, including the hostname of `NEXT_PUBLIC_SITE_URL`         |
| production build | real pair, no valid `NEXT_PUBLIC_SITE_URL` | any                            | **form closed** (`site-url-not-configured`)                        |
| production build | Cloudflare test keys                       | any                            | **form closed** (test keys refused)                                |
| production build | missing                                    | any                            | **form closed**                                                    |
| development      | real or test pair                          | any                            | verified                                                           |
| development      | missing                                    | `true`                         | accepted without CAPTCHA, with a visible "development mode" notice |
| development      | missing                                    | unset                          | form closed                                                        |

"Production" means `NODE_ENV=production`, which every `next build`/`next start` sets, so the bypass
cannot be switched on in a deployed build.

### Client IP

Per-IP limits read the client address from `CLIENT_IP_HEADER`. A client can send any header it
likes, so the value is only trustworthy if a proxy you control **sets** it:

- **Production requires `CLIENT_IP_HEADER`.** Without it the form is closed
  (`client-ip-header-not-configured`); there is no default that a client could control.
- Single-value headers set by the edge are simplest, e.g. `cf-connecting-ip` when Cloudflare proxies
  straight to the app. Check your platform's documentation for the header it guarantees.
- For list headers such as `x-forwarded-for`, the **rightmost** entries are the ones your proxies
  appended; anything to their left came from the client. `CLIENT_IP_TRUSTED_HOPS` (1–5, default 1)
  is the number of proxies you control: hops = 1 uses the last entry, hops = 2 the one before it.
  Cloudflare, for example, appends to an existing `X-Forwarded-For` rather than replacing it.
- `next start` exposed directly to the internet passes the client's own `X-Forwarded-For` through, so
  do not use that header without a proxy in front.
- Outside production the default is `x-forwarded-for` (local development and tests).

A missing or malformed value puts the request in a shared "unknown" bucket rather than skipping the
limit.

## Email (optional)

With `RESEND_API_KEY`, `INQUIRY_EMAIL_FROM` and `INQUIRY_NOTIFY_TO` set, each new inquiry queues two
messages in `private.notification_outbox` **in the same transaction** as the inquiry:

- **Customer acknowledgement** in the inquiry language: reference, event type, date and guest count,
  and an explicit statement that it is not a booking confirmation. Anyone can type any address into
  the form, so the message contains **no free text from the submission**, not even the name: it
  cannot be used to send a chosen message to a third party.
- **Staff alert** to the configured business addresses: reference, event summary and an admin link;
  no customer contact details.

Delivery runs after the response (`after()`), claims rows with `FOR UPDATE SKIP LOCKED`, sends with
the outbox id as the provider idempotency key, and records `sent`/`failed`. Failures never affect the
stored inquiry and are retried up to 5 attempts by later runs or by a scheduler calling
`/api/internal/notifications` with `Authorization: Bearer $CRON_SECRET` (the endpoint is a 404 when
email or the secret is not configured).

In production, email also requires an `https` `NEXT_PUBLIC_SITE_URL` (staff alerts link to the admin
inbox); otherwise email stays off and the server logs `site-url-required`.

The website never says an email was sent: delivery happens after the response, so there is no
evidence at that moment. Without email configuration, inquiries are stored and nothing is queued.

**Status:** templates, outbox and delivery are unit- and DB-tested with mocked HTTP. Stage 2.5 also
ran the outbox, retry endpoint and failure path against real PostgreSQL 17 and the real Resend API
with an invalid key (messages marked `failed`, retried up to 5 attempts, inquiries kept). Sending
through a real Resend account (verified domain, deliverability) has not been tested. Messages that
reach 5 failed attempts raise no alert: monitor them (query in
[VERIFICATION.md](VERIFICATION.md#before-launch)).

## Lifecycle

```
new ─▶ in_review (Reviewed) ─▶ contacted ─▶ quoted (Proposal sent) ─▶ confirmed ─▶ completed
 │          │                    ▲   │            │                       │
 │          └──────────────▶ quoted  └────────────┘ (back to contacted)   └─▶ cancelled
 └─▶ contacted
any open state ─▶ declined | cancelled          declined | cancelled ─▶ in_review (reopen)
```

Enforced in the database (`private.is_allowed_booking_transition`, a trigger on `bookings.status`)
and mirrored in `src/features/bookings/status.ts` (tested pair by pair). The admin offers only valid
next steps and asks for confirmation before confirmed, completed, declined and cancelled. Every
change writes a status-history row (with an optional note) and an audit-log entry without personal
data.

## Who can do what

|                                                 | Owner | Admin | Event manager | Content editor | Analyst |
| ----------------------------------------------- | :---: | :---: | :-----------: | :------------: | :-----: |
| See inquiries                                   |  all  |  all  | assigned only |       –        |    –    |
| Change status / add notes                       |  all  |  all  | assigned only |       –        |    –    |
| Assign / reassign                               |   ✓   |   ✓   |       –       |       –        |    –    |
| Delete (privacy erasure, database only for now) |   ✓   |   –   |       –       |       –        |    –    |
| Aggregate counts (no personal data)             |   ✓   |   ✓   |  own counts   |       –        |    ✓    |

Nobody edits a submitted inquiry directly: staff roles have no INSERT or UPDATE privilege on
`bookings`, so status, assignment and notes change only through the audited functions, and the
customer's own fields stay exactly as submitted. Deleting an inquiry (privacy erasure) writes a
`booking.erased` audit entry with the reference only.

Missing and forbidden inquiries look the same (404-style "not found" in the admin; the database
raises `P0002` for both, which PostgREST sends as HTTP 500), so references cannot be probed. Internal notes are visible exactly to the people who can see the inquiry and are never shown
to customers.

## What the server secret key can do

The secret key (`SUPABASE_SECRET_KEY`, the `service_role` role) has no table privileges on any
inquiry or contact-message table. Through its five functions it can create inquiries and contact
messages, consume rate-limit counters, and claim and complete queued notifications (which return the
customer's address for acknowledgements). It cannot list, read, change or delete inquiries or
messages. It is still a Supabase secret key with full Auth
admin rights, so it must stay in the host's secret store; rotate it if it leaks.

## Contact messages

The form on `/[locale]/contact` is for questions that are not an event inquiry: name, email, optional
phone and subject, a message (10–3,000 characters) and consent. It opens and closes with the inquiry
form (same configuration) and runs the same pipeline with two differences:

- its rate limits use their own `contact:` buckets (same limits), so sending one form never uses up
  the other's budget; a solved CAPTCHA token is still accepted only once across both forms;
- the Turnstile widget uses action `contact`, and the server refuses a token minted for `inquiry`
  (and the other way round).

`public.submit_contact_message` (service_role only) stores the message with a `CM-` reference and is
idempotent per submission key, like inquiries. **No email is sent**: owners and admins
(`messages.read`) see new messages in `/admin/messages` and in the Overview's "Needs attention", reply
by email or phone, and mark each one handled (`messages.write`, audited). Other roles cannot see
messages. There is no delete button yet; erase a message in the database if a sender asks.

Before launch, the privacy notice (written for inquiries) should also describe contact messages; the
form's consent links to it.

## Enabling the form in production

1. Apply the migrations to the production Supabase project (`npx supabase db push`).
2. Create a Cloudflare Turnstile widget for the production hostname; set
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`.
3. Set `SUPABASE_SECRET_KEY` in the host's secret store (never `NEXT_PUBLIC_`).
4. Set `CLIENT_IP_HEADER` to a header your platform sets (required; see "Client IP"), and
   `CLIENT_IP_TRUSTED_HOPS` if it is a list header behind more than one proxy you control. Set
   `NEXT_PUBLIC_SITE_URL` to the `https` origin (required: CAPTCHA tokens must match its hostname,
   so serve the form on one hostname and redirect the other, e.g. `www`).
5. Optional email: verify a sending domain in Resend; set `RESEND_API_KEY`, `INQUIRY_EMAIL_FROM`,
   `INQUIRY_NOTIFY_TO`; optionally `CRON_SECRET` plus a scheduled call to the retry endpoint.
6. Have Chef Harena complete the privacy-notice review items, and get it legally reviewed.
7. Rebuild and deploy, then submit a test inquiry and check it in `/admin/bookings`.

## Testing locally

- Without Docker or keys: `INQUIRY_LOCAL_CAPTCHA_BYPASS=true` plus a reachable Supabase (hosted dev
  project) and its secret key, then `npm run dev`.
- With a widget: use Cloudflare's test keys (see README) to exercise the real Turnstile flow locally.
- Automated: `npm run test:db` (SQL and RLS), `npm test` (pipeline, CAPTCHA, email) and
  `npm run test:e2e` (form and admin workflow against the Supabase test double).
- Real database: `npm run test:db:pg` (the same SQL suites plus concurrency on a disposable
  PostgreSQL server) and the opt-in PostgREST HTTP suite; see [VERIFICATION.md](VERIFICATION.md).
