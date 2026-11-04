# ADR 0005 — Staff usernames and self-service sign-in details

- **Status:** accepted
- **Date:** 2026-11-04

The owner asked for staff to change their own email and password from the admin, to create a
username, and to sign in with it. Supabase Auth signs in by email or phone only, and ADR 0001 §5 keeps
sign-in in the browser. This records how the two fit together.

## 1. Signing in by username happens on the server

**Context.** The password grant needs an email address, so something must turn a username into one. A
function a browser can call would hand anyone who guesses a username that person's email address, and
would reveal which usernames exist, ending the form's "no account enumeration" property.

**Decision.** `public.staff_login_email` can be executed by `service_role` only, and is called from
`src/features/bookings/server/store.ts`, still the only user of the secret key. A Server Action
(`signInWithUsernameAction`) takes the username and password, looks the address up and signs in with the
session client, whose cookies reach the browser. The browser never receives the address.

An unknown username signs in against a reserved `.invalid` address, so it takes the same steps and gets
the same answer as a wrong password. A username that could not exist is answered the same way without
asking the server.

**Consequences.**

- The password passes through our server for username sign-ins (it went straight to Supabase before).
  It is not logged or stored.
- Supabase Auth's per-IP limit sees the server rather than the visitor, so the action has its own limits:
  10 tries per username and 20 per client IP in 15 minutes, hashed in `consume_rate_limit`. Those limits
  can be used to lock a known username out for 15 minutes, and many IPs could still use up Auth's limit
  for the server.
- **Signing in by email stays as ADR 0001 §5 decided**, directly from the browser, unaffected by either:
  it is the way in when username sign-in is limited.
- A response that took longer for a known account is still possible, because Auth hashes the password
  only for an account it finds. This is the same on the email path, and the limits above bound it.

## 2. Changing a password or email needs the current password

**Decision.** Both actions first sign in again with the current password, on the session's own client, so
a session left open on a shared computer cannot take the account over, and so the session counts as
recent for Auth's secure password change. Attempts are limited per account (10 in 15 minutes).

A new password must have at least 12 characters with upper case, lower case and a number, checked in the
code, because a hosted project does not apply `config.toml`. Changing it ends the account's other sessions.

## 3. Email changes go through Supabase Auth's confirmation

**Decision.** `auth.updateUser({ email })`: the address changes once the link sent to it is opened (and,
with secure email change, the one sent to the old address). The landing route shows one of three fixed
messages and never the text in the link, which anyone could write.

**Rejected:** changing the address directly with the secret key's Auth admin rights. It would work without
any email service, but the application deliberately does not use those rights (SECURITY_MODEL.md), and a
mistyped address would lock the owner out with nothing proving they own the new one.

**Consequences.** On the hosted project this needs two dashboard settings the code cannot set: the Site URL
and Redirect URLs must include the live site, and Supabase's built-in email service reaches only
organisation members and sends about two emails an hour, so other addresses need custom SMTP. Without
that, the form says that the email could not be sent, and the owner can change the address in the dashboard.

**A password change cancels a waiting email change.** This is Auth's rule, for safety: the old password may be
what asked for the change. Auth clears the link and when it was sent, but keeps the new address, so a stored
address does not mean a change is waiting (`emailChangeStatus` in `src/features/account/rules.ts`). The owner hit
this on the first day: they requested a change, changed the password 81 seconds later, and the old address stayed
with nothing to say why. The password form now warns first and says what it cancelled, the email form says the
change did not finish and offers the address again, and while a link really is waiting every admin page says why
the old address still shows. The change is not requested again automatically, which would undo Auth's rule.

## 4. Audit

Usernames change in our own table, so a trigger records it. Passwords and email addresses live in Supabase
Auth, so `public.record_account_change` records them, against the signed-in account only and for those two
kinds only. No entry holds a password, an address or a username.
