-- =============================================================================
-- Chief Harena · Stage 2.5 · service_role executes only the inquiry functions
-- =============================================================================
-- Supabase's default privileges grant EXECUTE on every new public function to
-- service_role. Stage 1 revoked get_my_access, assign_role and revoke_role from
-- public, anon and authenticated only, so the server secret key could still call
-- them (found on PostgreSQL 17 after `supabase db push`). Each one refuses or
-- returns nothing without auth.uid(), which a service_role token never carries:
-- this restores the documented rule (service_role executes only submit_inquiry,
-- consume_rate_limit, claim_notifications and complete_notification) rather than
-- closing an exploitable path. tests/integration/db/schema.test.ts lists every
-- function each API role may execute.
-- =============================================================================

revoke execute on function
  public.get_my_access(),
  public.assign_role(uuid, public.app_role),
  public.revoke_role(uuid, public.app_role)
from service_role;
