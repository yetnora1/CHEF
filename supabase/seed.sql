-- =============================================================================
-- CHEF SIS · local development seed
-- =============================================================================
-- Runs after migrations on `supabase db reset` (local only). Contains placeholder
-- content only: no users, no customers, no bookings, no real business claims.
--
-- Staff accounts are intentionally NOT seeded. Create one in local Studio
-- (Authentication → Add user), then make it the first owner from the SQL editor:
--   select private.bootstrap_first_owner('you@example.com');
--
-- Amharic rows are machine-drafted placeholders and stay in 'draft' until a
-- native speaker reviews them, so the public site falls back to English (marked
-- lang="en") instead of presenting unreviewed text as final.
-- =============================================================================

insert into public.services (slug, status, sort_order) values
  ('weddings', 'published', 10),
  ('corporate-events', 'published', 20),
  ('summits-and-conferences', 'published', 30),
  ('culinary-experiences', 'draft', 40)
on conflict (slug) do nothing;

insert into public.service_translations (service_id, locale, status, title, summary)
select s.id, t.locale, t.status::public.publication_status, t.title, t.summary
from (values
  ('weddings', 'en', 'published', 'Weddings',
   'Placeholder: Ethiopian menus for wedding celebrations. Final copy to be provided by CHEF SIS.'),
  ('weddings', 'am', 'draft', 'ሠርግ',
   'ጊዜያዊ ጽሑፍ፦ ለሠርግ በዓላት የኢትዮጵያ ምግብ ዝግጅት። የመጨረሻው ጽሑፍ ይቀርባል።'),
  ('corporate-events', 'en', 'published', 'Corporate events',
   'Placeholder: catering for corporate functions and receptions. Final copy to be provided.'),
  ('corporate-events', 'am', 'draft', 'የድርጅት ዝግጅቶች',
   'ጊዜያዊ ጽሑፍ፦ ለድርጅት ዝግጅቶችና ግብዣዎች የምግብ አገልግሎት። የመጨረሻው ጽሑፍ ይቀርባል።'),
  ('summits-and-conferences', 'en', 'published', 'Summits and conferences',
   'Placeholder: catering for summits and professional gatherings. Final copy to be provided.'),
  ('summits-and-conferences', 'am', 'draft', 'ጉባኤዎችና ኮንፈረንሶች',
   'ጊዜያዊ ጽሑፍ፦ ለጉባኤዎችና ለሙያዊ ስብሰባዎች የምግብ አገልግሎት። የመጨረሻው ጽሑፍ ይቀርባል።'),
  ('culinary-experiences', 'en', 'draft', 'Culinary experiences',
   'Placeholder: offering to be confirmed by CHEF SIS before publication.')
) as t (slug, locale, status, title, summary)
join public.services s on s.slug = t.slug
on conflict (service_id, locale) do nothing;
