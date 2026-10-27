-- =============================================================================
-- Chef Harena · Stage 3.7 · Permissions for website contact messages
-- =============================================================================
-- Kept in its own migration: Postgres cannot use a new enum value inside the
-- transaction that adds it, and the next migration grants and checks them.
--   messages.read   see the contact-message inbox
--   messages.write  mark a message handled or move it back to new
-- =============================================================================

alter type public.app_permission add value if not exists 'messages.read' after 'bookings.delete';
alter type public.app_permission add value if not exists 'messages.write' after 'messages.read';
