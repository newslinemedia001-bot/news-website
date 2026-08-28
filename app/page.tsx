import fs from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import HomeClient from "./HomeClient";

/* =========================================================
   CONFIGURATION
========================================================= */

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://kdmbspupunfrwkvcosov.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkbWJzcHVwdW5mcndrdmNvc292Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NjEzODQsImV4cCI6MjEwMzIzNzM4NH0.FG02U5z3cxdsdmEctL3HM1jmEjri-OQndFymfjhQ1NA";

const RSS_API =
  "https://api.rss2json.com/v1/api.json?rss_url=";

/*
 * This image is ONLY used when the featured story
 * doesn't have a usable image.
 */
const FALLBACK_IMAGE =
  "https://newsight.co.ke/assets/logo/newsight-featured.png";

/*
 * Newsight favicon.
 * This is separate from the Open Graph featured image.
 */
const FAVICON =
  "https://newsight.co.ke/assets/logo/logo_icon.png";

/*
 * Your production homepage.
 */
const SITE_URL = "https://newsight.co.ke/";

/* =========================================================
   RSS SOURCES
========================================================= */

const RSS_SOURCES = [
  ["The Standard Kenya", "https://www.standardmedia.co.ke/rss/kenya.php", "https://www.standardmedia.co.ke"],
  ["Kenya News Agency", "https://www.kenyanews.go.ke/feed/", "https://www.kenyanews.go.ke"],
  ["KBC Digital", "https://www.kbc.co.ke/feed/", "https://www.kbc.co.ke"],
  ["K24 Digital", "https://k24.digital/feed", "https://k24.digital"],
  ["BBC News Kenya", "https://feeds.bbci.co.uk/news/topics/c40rjmqdlzzt/rss.xml", "https://www.bbc.com/news/topics/c40rjmqdlzzt"],
  ["Tukio", "https://tukio.co.ke/feed/", "https://tukio.co.ke"],
  ["Capital FM Kenya", "https://www.capitalfm.co.ke/news/feed/", "https://www.capitalfm.co.ke/news"],
] as const;

/* =========================================================
   TYPES
========================================================= */

type Story = {
  id?: string | number;

  title?: string;

  description?: string;

  summary?: string;

  content?: string;

  image_url?: string;

  thumbnail?: string;

  enclosure?: {
    link?: string;
    url?: string;
  };

  guid?: string;

  link?: string;

  pubDate?: string;

  published_at?: string;

  created_at?: string;

  category?: string;

  kind?: "rss" | "community";

  sourceName?: string;

  sourceSite?: string;

  users?: {
    full_name?: string;
  };
};

/* =========================================================
   CLEAN HTML / TEXT
========================================================= */

function clean(value = ""): string {
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/* =========================================================
   IMAGE SELECTION
========================================================= */

function extractImageFromHtml(value = ""): string {
  const match = String(value).match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1]?.trim() || "";
}

function imageFor(item?: Story | null): string {
  if (!item) return "";
  return (
    item.image_url ||
    item.thumbnail ||
    item.enclosure?.link ||
    item.enclosure?.url ||
    extractImageFromHtml(item.description || item.content || item.summary || "") ||
    ""
  ).trim();
}

function hasImage(item?: Story | null): boolean {
  const image = imageFor(item);
  return Boolean(image) && /^https?:\/\//i.test(image);
}

/* =========================================================
   RSS LOADER
========================================================= */

async function loadRss(): Promise<Story[]> {
  const results = await Promise.allSettled(
    RSS_SOURCES.map(
      async ([name, feed, site]): Promise<Story[]> => {
        const response = await fetch(
          RSS_API + encodeURIComponent(feed),
          {
            /*
             * Cache for 10 minutes.
             */
            next: {
              revalidate: 600,
            },
          },
        );

        if (!response.ok) {
          throw new Error(
            `RSS request failed: ${name}`,
          );
        }

        const data = await response.json();

        if (data.status !== "ok") {
          throw new Error(
            `RSS API failed: ${name}`,
          );
        }

        return (data.items || []).map(
          (item: any): Story => ({
            ...item,

            kind: "rss",

            sourceName: name,

            sourceSite: site,

            pubDate:
              item.pubDate ||
              item.pubdate ||
              item.published ||
              item.date ||
              "",
          }),
        );
      },
    ),
  );

  /*
   * Keep only successful feeds.
   */
  const stories = results
    .filter(
      (
        result,
      ): result is PromiseFulfilledResult<Story[]> =>
        result.status === "fulfilled",
    )
    .flatMap(
      (result) => result.value,
    );

  /*
   * Remove duplicate RSS stories.
   */
  const seen = new Set<string>();

  return stories.filter((item) => {
    if (!hasImage(item)) return false;

    const key =
      item.guid ||
      item.link ||
      item.title;

    if (!key) {
      return false;
    }

    if (seen.has(String(key))) {
      return false;
    }

    seen.add(String(key));

    return true;
  });
}

/* =========================================================
   SUPABASE COMMUNITY NEWS
========================================================= */

async function loadCommunity(): Promise<Story[]> {
  try {
    const url =
      `${SUPABASE_URL}/rest/v1/news` +
      `?select=id,title,summary,content,image_url,category,published_at,created_at,author_id` +
      `&status=eq.published` +
      `&order=published_at.desc.nullslast` +
      `&limit=40`;

    const response = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,

        Authorization:
          `Bearer ${SUPABASE_ANON_KEY}`,
      },

      /*
       * Refresh community news every 10 minutes.
       */
      next: {
        revalidate: 600,
      },
    });

    if (!response.ok) {
      console.error(
        "Supabase request failed:",
        response.status,
      );

      return [];
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      return [];
    }

    // Resolve author names separately instead of relying on a Supabase
    // foreign-key embed. This keeps the news query working even when the
    // relationship is not exposed in the REST schema.
    const authorIds = Array.from(
      new Set(
        data
          .map((item: any) => item.author_id)
          .filter(Boolean),
      ),
    );

    const authorNames = new Map<string, string>();

    if (authorIds.length > 0) {
      const authorResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/users?select=id,full_name&id=in.(${authorIds.join(",")})`,
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
        if (Array.isArray(authors)) {
          authors.forEach((author: any) => {
            if (author.id && author.full_name) {
              authorNames.set(String(author.id), String(author.full_name));
            }
          });
        }
      }
    }

    return data
      .map(
        (item: any): Story => ({
          ...item,
          kind: "community",
          sourceName:
            authorNames.get(String(item.author_id)) ||
            "Newsight Community",
          pubDate:
            item.published_at ||
            item.created_at ||
            "",
        }),
      )
      .filter(hasImage);
  } catch (error) {
    console.error(
      "Community stories error:",
      error,
    );

    return [];
  }
}

/* =========================================================
   LOAD ALL NEWS
========================================================= */

async function loadAllStories(): Promise<Story[]> {
  const [rssStories, communityStories] =
    await Promise.all([
      loadRss(),
      loadCommunity(),
    ]);

  return [
    ...rssStories,
    ...communityStories,
  ].sort((a, b) => {
    const dateA = new Date(
      a.pubDate || 0,
    ).getTime();

    const dateB = new Date(
      b.pubDate || 0,
    ).getTime();

    return dateB - dateA;
  });
}

/* =========================================================
   GET FEATURED / LEAD STORY
========================================================= */

async function getLeadStory(): Promise<Story | null> {
  const stories = await loadAllStories();

  if (!stories.length) {
    return null;
  }

  return stories[0];
}

/* =========================================================
   HOMEPAGE
========================================================= */

export default async function HomePage() {
  /*
   * Keep your existing HTML frontend.
   */
  const bodyHtml =
    await fs.readFile(
      path.join(
        process.cwd(),
        "public",
        "legacy",
        "home-body.html",
      ),
      "utf8",
    );

  return (
    <HomeClient
      bodyHtml={bodyHtml}
    />
  );
}