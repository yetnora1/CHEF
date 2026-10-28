<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## CHEF SIS project rules

Read `docs/ARCHITECTURE.md` and `docs/SECURITY_MODEL.md` before changing routes, auth or data access.

- Every protected admin page, layout and server action calls `authorizeAdmin(permission)` from
  `src/lib/auth/staff-session.ts`; the proxy redirect is not a security boundary.
- Schema changes only via `supabase/migrations/*.sql`: revoke defaults from `anon`/`authenticated`,
  grant minimally, enable RLS, revoke EXECUTE on new private functions, `search_path = ''` on
  SECURITY DEFINER. Run `npm run test:db`.
- Permission changes need a migration **and** `src/lib/permissions/matrix.ts` (tested for drift).
- Interface strings go in both `src/messages/en.json` and `am.json` (parity is tested). Business
  content is per-locale data, never message keys. Never invent business facts or label English as Amharic.
- The Supabase secret key is used only in `src/features/bookings/server/store.ts`, and `service_role`
  may only execute the functions granted to it (see `docs/INQUIRIES.md`). Never add a general
  service-role client or grant it table access.
- Use semantic design tokens from `src/app/globals.css`, never raw colours.
- Before handing off, run `npm run verify` and `npm run test:e2e`.
