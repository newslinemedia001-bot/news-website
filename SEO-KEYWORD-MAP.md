# Newsight Keyword Map & SEO Workflow

Adapted from the 8-step keyword → mapping → architecture → schema → copy →
launch workflow, applied to `https://newsight.co.ke` (a Kenyan news aggregator
running on Next.js + Netlify, fed by RSS and Supabase community posts).

## Baseline (Google Search Console, last 3 months)

| Metric | Value | Reading |
| --- | --- | --- |
| Clicks | 6 | Low, but from only 30 impressions |
| Impressions | 30 | The real problem: too few pages indexed |
| Average CTR | 20% | Healthy — when the result shows, people click |
| Average position | 8.3 | Ranking is fine; coverage is not |
| Indexed pages | 12 | 20 pages not indexed |
| Top pages | homepage (4 clicks) + 4 article URLs | Only fresh articles ever got indexed |

**Conclusion:** this is not a "rank higher" problem and not really a "write
better titles" problem. It is a **coverage + retention** problem:

1. Only ~12 URLs ever got indexed because article URLs started 404ing the
   moment their story rolled out of the RSS feed (each feed carries ~30 items).
   Google drops URLs that stop resolving, so the site could never accumulate
   indexed pages — and impressions scale with indexed pages.
2. Fix: **every RSS story is now archived in Supabase** (`public.rss_articles`,
   migration in `supabase/rss-articles.sql`). Old article URLs, sitemap entries
   and Google results stay alive indefinitely, so indexed pages accumulate
   instead of churning.

## Step 1 — Keyword research (clusters with real intent)

Grouped by how Kenyan readers actually search, mapped to intent:

| Cluster | Example queries | Intent |
| --- | --- | --- |
| National news | kenya news today, news in kenya, kenya latest news | Informational, high volume |
| County news | nairobi news today, mombasa county news, kiambu news | Informational, local |
| Business | kenya business news, shilling exchange rate, kRA tax news, nse shares | Informational / commercial |
| Sports | premier league results, kenya marathon, afcon qualifiers, kogalo | Informational, event-driven |
| Technology | kenya fintech news, safaricom data, ai news kenya | Informational |
| Entertainment | kenya music news, gospel artists, nollywood/kenyan film, fashion | Informational |
| International | world news today, tanzania/uganda news, china us | Informational |
| Breaking / person queries | "ruto news", "<event> kenya" | Informational, spike traffic |
| Branded | newsight, newsight kenya | Navigational (currently 1 impression) |

## Step 2 — Keyword map → where each cluster lives

| Cluster | Primary target on Newsight | Supporting |
| --- | --- | --- |
| National news | Homepage lead + `#kenya` grid | Article pages, `/sitemap.xml` |
| County news | `#county` grid | Article pages from county-tagged stories |
| Business | `#business` grid (Capital FM Business feed) | Article pages |
| Sports | `#sports` grid (Capital FM Sports feed) | Article pages |
| Technology | `#technology` grid | Article pages |
| Entertainment | `#entertainment` grid (Standard Entertainment feed) | Article pages |
| International | `#international` grid (BBC feed) | Article pages |
| Community posts | `#community` grid (Supabase `news` table) | Author pages (future) |
| Long-tail / breaking | `/news/rss/<id>/<slug>` article pages | `news-sitemap.xml` (48h) |

Priority order for growing impressions: **article pages first** (they are the
long tail — 30 impressions came from only 4 article URLs), then section grids.

## Step 3 — Site architecture (current, keep it)

- `/` — homepage, one H1 (lead story), section H2s, `Organization + WebSite` schema.
- `/news/rss/<id>/<slug>` — RSS article pages: canonical URL, slug `301` to the
  canonical slug, `NewsArticle + BreadcrumbList` schema, related/latest rail.
- `/news/community/<id>/<slug>` — community article pages, same schema.
- `/sitemap.xml` — homepage + every indexable article (now includes archived
  stories, so it grows instead of shrinking).
- `/news-sitemap.xml` — last 48 hours only (Google News requirement).
- `/robots.txt` — sitemap declarations, login/admin excluded.
- `/login.html`, `/signup.html`, `/dashboard.html`, `/admin.html` — `noindex`.

## Step 4 — Data model (Supabase)

- `public.news` — community posts (status/approval workflow).
- `public.rss_articles` — RSS archive (new): `id` (public article id), original
  `guid`/`link`, `title`, `description`, `content`, `image_url`, `source_name`,
  `pub_date`, `first_seen_at`, `last_seen_at`. RLS allows public read, service
  role only write. Upserts merge on `id`, so a story is stored once and never
  replaced by a newer one.

## Step 5 — Templates & copy rules

- Title: `<headline> | Newsight` — headline first (what the searcher typed), brand last.
- Meta description: first meaningful sentence of the story, ≤ 300 chars, no keyword stuffing.
- H1: one per page — the lead headline on home, the article headline on articles.
- Section headings H2, card titles H3.
- Every RSS article carries a visible credit + link to the original reporting
  (`Read the original article →`) — required for E-E-A-T and for not passing
  off aggregated copy as your own.

## Step 6 — Schema markup (what is implemented)

| Page | Schema |
| --- | --- |
| Homepage | `Organization`, `WebSite` (JSON-LD in `app/layout.tsx`) |
| Article | `NewsArticle` (headline, image, datePublished/dateModified, author, publisher, isAccessibleForFree) + `BreadcrumbList` (`app/news/[kind]/[id]/[slug]/page.tsx`) |
| Sitemaps | `/sitemap.xml`, `/news-sitemap.xml` (Google News) |

Not added on purpose: `FAQPage` and `Product` schema — add FAQ schema only
where real question/answer content exists on the page; fabricated schema is a
manual-action risk. Same for `LocalBusiness`: Newsight has no physical location.

## Step 7 — E-E-A-T / AI-crawler readability

- Original source link + publisher credit on every aggregated article.
- Named authors on community posts; organization publisher on RSS posts.
- Server-rendered title, description, canonical, robots, OG/Twitter tags and
  JSON-LD are all present in the initial HTML (View Source), so AI answer
  engines that fetch raw HTML can read them without executing JavaScript.

## Step 8 — Launch checklist

1. Run `supabase/rss-articles.sql` once in the Supabase SQL Editor (creates the archive).
2. Deploy, then confirm `https://newsight.co.ke/sitemap.xml` lists hundreds of
   article URLs instead of a handful.
3. In Search Console → Pages: triage the **20 not-indexed** pages (expect
   login/admin `noindex` and old 404s; old 404s stop appearing once the archive is live).
4. Validate a homepage and an article URL in the Rich Results Test
   (NewsArticle + BreadcrumbList should both pass).
5. Submit the sitemap to Bing Webmaster Tools / IndexNow as well, and keep
   publishing frequency steady — impressions scale with indexed pages × freshness.
