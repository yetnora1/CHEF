-- =============================================================================
-- Chief Harena · Stage 3 · "In review" step for content
-- =============================================================================
-- Editorial workflow (labels in the admin UI):
--   draft ⇄ in_review (Ready for review) → published → archived
-- Kept in its own migration: Postgres cannot use a new enum value inside the
-- transaction that adds it, and the next migrations' functions reference it.
-- =============================================================================

alter type public.publication_status add value if not exists 'in_review' after 'draft';
