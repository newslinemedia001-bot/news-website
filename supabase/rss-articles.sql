-- ============================================================
-- NEWSIGHT RSS ARTICLE ARCHIVE
-- Run this entire file ONCE in the Supabase SQL Editor:
--   https://supabase.com/dashboard/project/kdmbspupunfrwkvcosov/sql/new
-- ============================================================
--
-- Why this exists:
-- RSS feeds only expose the newest ~30 stories per source. When a story
-- rolls out of the feed, its article URL starts returning 404 and every
-- link Google already indexed dies with it. This table archives every RSS
-- story the site has ever fetched, so old article URLs, sitemap entries and
-- Google results keep working forever.

create extension if not exists pgcrypto;

create table if not exists public.rss_articles (
  -- The public article id used in /news/rss/<id>/<slug>.
  id            text primary key,
  -- Original feed identifiers, kept verbatim so the id above can be
  -- recomputed from an archived row exactly as it is from a live item.
  guid          text,
  link          text,
  title         text not null,
  description   text,
  content       text,
  image_url     text,
  source_name   text,
  source_site   text,
  pub_date      timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create index if not exists rss_articles_pub_date_idx
  on public.rss_articles (pub_date desc);

create index if not exists rss_articles_last_seen_idx
  on public.rss_articles (last_seen_at desc);

create index if not exists rss_articles_source_idx
  on public.rss_articles (source_name);

-- ------------------------------------------------------------ RLS
alter table public.rss_articles enable row level security;

-- The archive is public content: anyone may read it.
drop policy if exists "rss articles are publicly readable" on public.rss_articles;
create policy "rss articles are publicly readable"
on public.rss_articles
for select
to anon, authenticated
using (true);

-- No insert/update/delete policy on purpose: only the server-side
-- service_role key can write, so the public anon key cannot modify it.
