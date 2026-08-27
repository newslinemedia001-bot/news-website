import type { Metadata } from "next";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://kdmbspupunfrwkvcosov.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkbWJzcHVwdW5mcndrdmNvc292Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NjEzODQsImV4cCI6MjEwMzIzNzM4NH0.FG02U5z3cxdsdmEctL3HM1jmEjri-OQndFymfjhQ1NA";
const RSS_API = "https://api.rss2json.com/v1/api.json?rss_url=";
const SITE_URL = "https://newsight.co.ke/";
const FALLBACK_IMAGE = "https://newsight.co.ke/assets/logo/logo_icon.png";

const RSS_SOURCES = [
  ["The Standard Kenya", "https://www.standardmedia.co.ke/rss/kenya.php"],
  ["Kenya News Agency", "https://www.kenyanews.go.ke/feed/"],
  ["KBC Digital", "https://www.kbc.co.ke/feed/"],
  ["K24 Digital", "https://k24.digital/feed"],
  ["BBC News Kenya", "https://feeds.bbci.co.uk/news/topics/c40rjmqdlzzt/rss.xml"],
  ["Tukio", "https://tukio.co.ke/feed/"],
  ["Capital FM Kenya", "https://www.capitalfm.co.ke/news/feed/"],
] as const;

type Story = {
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
  is_featured?: boolean;
  featured?: boolean;
  featured_article?: boolean;
  kind?: "rss" | "community";
};

function clean(value = "") {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function imageFor(item?: Story | null) {
  if (!item) return "";
  const html = item.description || item.content || item.summary || "";
  const embedded = html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || "";
  const value = item.image_url || item.thumbnail || item.enclosure?.link || item.enclosure?.url || embedded;
  return String(value || "").trim();
}

function hasImage(item?: Story | null) {
  return /^https?:\/\//i.test(imageFor(item));
}

async function getRssStories(): Promise<Story[]> {
  const results = await Promise.allSettled(RSS_SOURCES.map(async ([name, feed]) => {
    const response = await fetch(RSS_API + encodeURIComponent(feed), { next: { revalidate: 300 } });
    if (!response.ok) throw new Error(`RSS failed: ${name}`);
    const data = await response.json();
    if (data.status !== "ok") throw new Error(`RSS failed: ${name}`);
    return (data.items || []).map((item: any) => ({ ...item, kind: "rss", pubDate: item.pubDate || item.pubdate || item.published || item.date || "" }));
  }));
  return results.flatMap((result) => result.status === "fulfilled" ? result.value : []).filter(hasImage);
}

async function getCommunityStories(): Promise<Story[]> {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/news?select=id,title,summary,content,image_url,category,published_at,created_at,author_id,is_featured,featured,featured_article&status=eq.published&order=published_at.desc.nullslast&limit=40`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }, next: { revalidate: 300 } },
    );
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data.map((item: any) => ({ ...item, kind: "community", pubDate: item.published_at || item.created_at || "" })).filter(hasImage) : [];
  } catch {
    return [];
  }
}

export async function getFeaturedStory(): Promise<Story | null> {
  const [rss, community] = await Promise.all([getRssStories(), getCommunityStories()]);
  const stories = [...rss, ...community].sort((a, b) => new Date(b.pubDate || 0).getTime() - new Date(a.pubDate || 0).getTime());
  const explicitlyFeatured = stories.find((story) => story.is_featured === true || story.featured === true || story.featured_article === true);
  return explicitlyFeatured || stories[0] || null;
}

export async function getHomeMetadata(): Promise<Metadata> {
  const story = await getFeaturedStory();
  const title = story?.title ? `${clean(story.title)} | Newsight` : "Newsight - Kenya News & Latest Updates";
  const description = clean(story?.description || story?.summary || story?.content || "Stay informed with the latest news from Kenya and around the world.").slice(0, 300);
  const image = imageFor(story) || FALLBACK_IMAGE;

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    alternates: { canonical: SITE_URL },
    openGraph: {
      type: "website",
      title,
      description,
      url: SITE_URL,
      siteName: "Newsight",
      images: [{ url: image, width: 1200, height: 630, alt: clean(story?.title || "Newsight") }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}
