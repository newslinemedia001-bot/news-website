# Newsight SEO-Friendly Article URLs

This version adds stable, descriptive article URLs while preserving the previous query-string URLs.

## New URL format

- RSS: `/news/rss/<rss-id>/<article-title-slug>`
- Community: `/news/community/<supabase-id>/<article-title-slug>`

Example:

`https://newsight.co.ke/news/community/123e4567-e89b-12d3-a456-426614174000/kenya-announces-new-economic-plan`

The ID keeps the URL stable and unique while the title slug makes the URL readable and useful for search engines.

## Old URLs

Existing URLs such as:

`/article?kind=community&id=...`

and

`/article?kind=rss&id=...`

are resolved server-side and permanently redirected to the new URL. This preserves existing links and gives Google a strong redirect signal for the new canonical URL.

## Canonicals and sitemaps

- Article pages use the new SEO URL as their canonical.
- `/sitemap.xml` now contains the new article URLs.
- `/news-sitemap.xml` now contains the new article URLs.
- If a title slug is changed or an incorrect slug is requested, the article page permanently redirects to the current canonical slug.

## Deployment

Deploy this version as the Next.js project. No database migration is required for the URL change.

After deployment, test:

- `/sitemap.xml`
- `/news-sitemap.xml`
- one new `/news/...` article URL
- one old `/article?kind=...&id=...` URL and confirm it redirects to `/news/...`

Then resubmit the sitemap in Google Search Console if needed.
