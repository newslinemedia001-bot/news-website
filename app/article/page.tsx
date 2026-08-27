import type { Metadata } from "next";
import ArticleClient from "./ArticleClient";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://kdmbspupunfrwkvcosov.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkbWJzcHVwdW5mcndrdmNvc292Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NjEzODQsImV4cCI6MjEwMzIzNzM4NH0.FG02U5z3cxdsdmEctL3HM1jmEjri-OQndFymfjhQ1NA";

const RSS_API = "https://api.rss2json.com/v1/api.json?rss_url=";
const FALLBACK_IMAGE = "https://newsight.co.ke/assets/logo/logo.png";
const SITE_URL = "https://newsight.co.ke";

const RSS_SOURCES = [
  ["The Standard Kenya", "https://www.standardmedia.co.ke/rss/kenya.php", "https://www.standardmedia.co.ke"],
  ["Kenya News Agency", "https://www.kenyanews.go.ke/feed/", "https://www.kenyanews.go.ke"],
  ["KBC Digital", "https://www.kbc.co.ke/feed/", "https://www.kbc.co.ke"],
  ["K24 Digital", "https://k24.digital/feed", "https://k24.digital"],
  ["BBC News Kenya", "https://feeds.bbci.co.uk/news/topics/c40rjmqdlzzt/rss.xml", "https://www.bbc.com/news/topics/c40rjmqdlzzt"],
  ["Tukio", "https://tukio.co.ke/feed/", "https://tukio.co.ke"],
  ["Capital FM Kenya", "https://www.capitalfm.co.ke/news/feed/", "https://www.capitalfm.co.ke/news"],
] as const;

type Article = {
  id?: string;
  title?: string;
  description?: string;
  summary?: string;
  content?: string;
  image_url?: string;
  thumbnail?: string;
  enclosure?: { link?: string; url?: string };
  guid?: string;
  link?: string;
  pubDate?: string;
  published_at?: string;
  created_at?: string;
  category?: string;
  sourceName?: string;
  sourceSite?: string;
  originalUrl?: string;
  kind?: "rss" | "community";
};

function rssId(item: Article): string {
  const value = item.guid || item.link || item.title || "";
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replaceAll("/", "_")
    .replaceAll("+", "-")
    .replaceAll("=", "");
}

function clean(value = ""): string {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractImageFromHtml(value = ""): string {
  const match = String(value).match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1]?.trim() || "";
}

function imageFor(item?: Article | null): string {
  return (
    item?.image_url ||
    item?.thumbnail ||
    item?.enclosure?.link ||
    item?.enclosure?.url ||
    extractImageFromHtml(item?.description || item?.content || item?.summary || "") ||
    FALLBACK_IMAGE
  );
}

function hasImage(item?: Article | null): boolean {
  const image = imageFor(item);
  return Boolean(image) && image !== FALLBACK_IMAGE && /^https?:\/\//i.test(image);
}

async function loadRss(): Promise<Article[]> {
  const results = await Promise.allSettled(
    RSS_SOURCES.map(async ([name, feed, site]) => {
      const response = await fetch(RSS_API + encodeURIComponent(feed), {
        next: { revalidate: 600 },
      });

      if (!response.ok) throw new Error(`${name}: RSS request failed`);

      const data = await response.json();
      if (data.status !== "ok") throw new Error(`${name}: RSS API failed`);

      return (data.items || []).map((item: Article) => ({
        ...item,
        kind: "rss" as const,
        sourceName: name,
        sourceSite: site,
        originalUrl: item.link,
        pubDate: item.pubDate || "",
      }));
    }),
  );

  const stories = results
    .filter((result): result is PromiseFulfilledResult<Article[]> => result.status === "fulfilled")
    .flatMap((result) => result.value);

  const seen = new Set<string>();
  return stories
    .filter((item) => hasImage(item))
    .filter((item) => {
      const key = item.guid || item.link || item.title;
      if (!key || seen.has(String(key))) return false;
      seen.add(String(key));
      return true;
    })
    .sort((a, b) => new Date(b.pubDate || 0).getTime() - new Date(a.pubDate || 0).getTime());
}

async function loadCommunityArticle(id: string): Promise<Article | null> {
  const params = new URLSearchParams({
    select: "id,title,summary,content,image_url,category,published_at,created_at,author_id",
    id: `eq.${id}`,
    status: "eq.published",
  });

  const response = await fetch(`${SUPABASE_URL}/rest/v1/news?${params.toString()}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    next: { revalidate: 600 },
  });

  if (!response.ok) {
    console.error("Supabase article request failed:", response.status);
    return null;
  }

  const data = await response.json();
  const item = Array.isArray(data) ? data[0] : null;
  if (!item) return null;

  let authorName = "";

  if (item.author_id) {
    const authorParams = new URLSearchParams({
      select: "full_name",
      id: `eq.${item.author_id}`,
    });

    const authorResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/users?${authorParams.toString()}`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        next: { revalidate: 600 },
      },
    );

    if (authorResponse.ok) {
      const authors = await authorResponse.json();
      authorName = authors?.[0]?.full_name || "";
    }
  }

  return {
    ...item,
    kind: "community",
    sourceName: authorName || "Newsight Community",
    pubDate: item.published_at || item.created_at || "",
  };
}

async function findArticle(kind: string | undefined, id: string | undefined): Promise<Article | null> {
  if (!id) return null;

  if (kind === "community") {
    return loadCommunityArticle(id);
  }

  const stories = await loadRss();
  return stories.find((story) => rssId(story) === id) || null;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; id?: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const article = await findArticle(params.kind, params.id);
  const title = article?.title ? `${clean(article.title)} | Newsight` : "Story not found | Newsight";
  const description = clean(
    article?.description || article?.summary || article?.content || "Read the latest story on Newsight.",
  ).slice(0, 300);
  const image = imageFor(article);
  const canonical = params.id
    ? `${SITE_URL}/article?kind=${encodeURIComponent(params.kind || "rss")}&id=${encodeURIComponent(params.id)}`
    : `${SITE_URL}/article`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      title,
      description,
      url: canonical,
      siteName: "Newsight",
      locale: "en_KE",
      images: [{ url: image, width: 1200, height: 630, alt: clean(article?.title || "Newsight") }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function ArticlePage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; id?: string }>;
}) {
  const params = await searchParams;
  const article = await findArticle(params.kind, params.id);

  return <ArticleClient article={article} />;
}
