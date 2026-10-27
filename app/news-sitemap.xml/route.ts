import { getNewsSitemapStories, articlePath } from "../seo";

const SITE_URL = "https://newsight.co.ke";
const MAX_NEWS_URLS = 1000;

function xmlEscape(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toW3CDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

export async function GET() {
  const stories = (await getNewsSitemapStories())
    .filter((story) => Boolean(story.title && story.date))
    .map((story) => ({ ...story, date: toW3CDate(story.date) }))
    .filter((story) => Boolean(story.date))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, MAX_NEWS_URLS);

  const urls = stories
    .map(
      (story) => `
  <url>
    <loc>${xmlEscape(`${SITE_URL}${articlePath(story.kind, story.id, story.title)}`)}</loc>
    <news:news>
      <news:publication>
        <news:name>Newsight</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${xmlEscape(story.date)}</news:publication_date>
      <news:title>${xmlEscape(story.title)}</news:title>
    </news:news>
  </url>`,
    )
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${urls}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
