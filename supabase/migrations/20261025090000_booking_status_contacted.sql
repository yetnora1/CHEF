-- =============================================================================
-- Chief Harena · Stage 2 · Add the "contacted" step to the inquiry lifecycle
-- =============================================================================
-- Lifecycle (labels in the admin UI):
--   new → in_review (Reviewed) → contacted → quoted (Proposal sent)
--       → confirmed → completed;   declined / cancelled from any open state.
-- Kept in its own migration: Postgres cannot use a new enum value inside the
-- transaction that adds it, and the next migration's functions reference it.
-- =============================================================================

alter type public.booking_status add value if not exists 'contacted' after 'in_review';
