# Newsight Technical SEO

This build adds a server-rendered technical SEO foundation for `https://newsight.co.ke`.

## Included

- Server-rendered homepage title, description, canonical URL, robots directives and Open Graph/Twitter metadata.
- Server-rendered Organization + WebSite JSON-LD on the homepage.
- Server-rendered `NewsArticle` JSON-LD on article pages.
- Dynamic `/sitemap.xml` containing the homepage and indexable article URLs.
- Dynamic `/news-sitemap.xml` containing stories from the last 48 hours.
- `/robots.txt` with sitemap declarations and private-area exclusions.
- `noindex` directives for login, signup, dashboard and admin pages.
- Canonical URLs for article pages.
- Large-image/snippet crawl directives.
- Security headers in `next.config.mjs`.
- Netlify build configuration using `npm run build` and `.next`.
- All seven active RSS sources are included consistently in the SEO story loader.

## After deployment

1. Confirm these URLs return successfully:
   - `https://newsight.co.ke/robots.txt`
   - `https://newsight.co.ke/sitemap.xml`
   - `https://newsight.co.ke/news-sitemap.xml`
2. Open the homepage with **View Source / Ctrl+U** and confirm the title, description, canonical, Open Graph and JSON-LD are present in the initial HTML.
3. Open an article and confirm its canonical URL, Open Graph metadata and `NewsArticle` JSON-LD are present in View Source.
4. Add `https://newsight.co.ke/sitemap.xml` to Google Search Console and Bing Webmaster Tools.
5. Validate article structured data with Google's Rich Results Test.

## Important

This does not guarantee a #1 ranking. It makes the site substantially easier for crawlers and search engines to discover, understand and canonicalize.

## Google News setup

See `README-GOOGLE-NEWS.md` for the dedicated Google News sitemap, Search Console submission steps, 48-hour freshness handling, and Publisher Center notes.
