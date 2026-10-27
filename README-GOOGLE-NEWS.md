# Newsight — Google News / News Sitemap Setup

This build adds a dedicated Google News sitemap at:

`https://newsight.co.ke/news-sitemap.xml`

## What is implemented

- Dedicated Google News sitemap separate from the normal sitemap.
- Only articles published within the previous 48 hours are included.
- The newest stories are listed first.
- The route caps the sitemap at 1,000 URLs.
- Each entry contains the required News sitemap fields:
  - `<news:publication><news:name>Newsight</news:name>`
  - `<news:publication><news:language>en</news:language>`
  - `<news:publication_date>` in W3C/ISO-8601 format
  - `<news:title>`
- Article URLs use the permanent `/news/{kind}/{id}/{slug}` format.
- `robots.txt` advertises both `/sitemap.xml` and `/news-sitemap.xml`.
- The regular sitemap continues to contain the broader indexable URL set.
- Article pages expose server-rendered headlines, dates, bylines, canonical URLs and NewsArticle structured data.

## Google Search Console

After deploying, add the property for:

`https://newsight.co.ke`

Then submit both:

`https://newsight.co.ke/sitemap.xml`

`https://newsight.co.ke/news-sitemap.xml`

Google recommends a separate News sitemap for news content because it can help Google News discover recent articles faster. News sitemaps should be kept current and contain only articles from the previous two days.

## Google News / Publisher Center

Google now automatically considers eligible web content for Google News; a publisher does not need to submit an application merely to become eligible. Publisher Center can still be used for available publication-management features, but it is not a guarantee of inclusion or ranking.

## Important content-policy note

Newsight currently displays stories from RSS sources as well as original/community stories. A News sitemap technically exposes those displayed article URLs, but inclusion in Google News is not guaranteed. Google evaluates content using automated systems and its News/Search policies. For the strongest long-term news visibility, prioritize original Newsight reporting, clear bylines and dates, transparent publisher/contact information, and meaningful value beyond republished source material.

## Verification checklist

1. Open `/robots.txt` and confirm both sitemaps are listed.
2. Open `/sitemap.xml` and confirm permanent `/news/...` URLs appear.
3. Open `/news-sitemap.xml` and verify:
   - XML loads without an error.
   - Only recent articles are present.
   - `news:name` is `Newsight`.
   - `news:language` is `en`.
   - `news:publication_date` is ISO-8601.
   - `news:title` matches the article H1/title.
4. In Search Console, submit both sitemap URLs.
5. Use URL Inspection on a recently published article and request indexing if appropriate.
6. Monitor Search Console indexing and News/Discover performance reports as data accumulates.
