/*
 * RSS SOURCES
 *
 * Feeds used to be proxied through api.rss2json.com. That service now
 * answers with a Cloudflare bot challenge (HTTP 403 + HTML) instead of
 * JSON, so every source failed and the site showed no RSS stories.
 * The feeds below are now fetched directly and parsed in this module,
 * which removes the third-party dependency entirely.
 ========================================================= */

import { archiveRssItems } from "./rss-store";

export const RSS_SOURCES = [
  ["The Standard Kenya", "https://www.standardmedia.co.ke/rss/kenya.php", "https://www.standardmedia.co.ke"],
  ["Capital FM Business", "https://www.capitalfm.co.ke/business/feed/", "https://www.capitalfm.co.ke/business"],
  ["The Star Kenya", "https://www.thestar.co.ke/feed/", "https://www.thestar.co.ke"],
  ["K24 Digital", "https://k24.digital/feed", "https://k24.digital"],
  ["BBC News Kenya", "https://feeds.bbci.co.uk/news/topics/c40rjmqdlzzt/rss.xml", "https://www.bbc.com/news/topics/c40rjmqdlzzt"],
  ["Capital FM Sports", "https://www.capitalfm.co.ke/sports/feed/", "https://www.capitalfm.co.ke/sports"],
  ["Standard Entertainment", "https://www.standardmedia.co.ke/rss/entertainment.php", "https://www.standardmedia.co.ke"],
  ["Capital FM Kenya", "https://www.capitalfm.co.ke/news/feed/", "https://www.capitalfm.co.ke/news"],
] as const;

export type RssItem = {
  title?: string;
  description?: string;
  summary?: string;
  content?: string;
  image_url?: string;
  enclosure?: { link?: string; url?: string };
  guid?: string;
  link?: string;
  pubDate?: string;
  kind: "rss";
  sourceName: string;
  sourceSite: string;
  originalUrl?: string;
};

/* =========================================================
   FETCH
========================================================= */

/*
 * Some publishers reject requests without a browser User-Agent, so the
 * request looks like an ordinary browser fetch.
 */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/*
 * Deliberately browser-like: some CDNs answer 415 to a strict
 * `application/rss+xml` Accept header.
 */
const ACCEPT =
  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

const FETCH_TIMEOUT_MS = 15000;

/* =========================================================
   XML HELPERS (RSS 2.0 + Atom)
========================================================= */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  copy: "©",
  reg: "®",
  trade: "™",
};

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (match, hex: string) => {
      const point = Number.parseInt(hex, 16);
      return Number.isFinite(point) ? String.fromCodePoint(point) : match;
    })
    .replace(/&#(\d+);/g, (match, dec: string) => {
      const point = Number.parseInt(dec, 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : match;
    })
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

function stripCdata(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return (match ? match[1] : trimmed).trim();
}

/*
 * Text content of `<tag>...</tag>` (optionally namespaced, optionally
 * wrapped in CDATA).
 */
function tagText(block: string, tag: string): string {
  const pattern = new RegExp(
    `<((?:[A-Za-z0-9_.-]+:)?${tag})(?:\\s[^>]*)?>([\\s\\S]*?)</\\1\\s*>`,
    "i",
  );
  const match = block.match(pattern);
  if (!match) return "";
  return decodeEntities(stripCdata(match[2])).trim();
}

/*
 * Value of an attribute on the first matching tag, e.g.
 * `<media:content url="https://..." />`.
 */
function tagAttr(block: string, tag: string, attribute: string): string {
  const pattern = new RegExp(
    `<((?:[A-Za-z0-9_.-]+:)?${tag})\\b[^>]*?\\b${attribute}\\s*=\\s*["']([^"']+)["']`,
    "i",
  );
  const match = block.match(pattern);
  return match ? decodeEntities(match[2].trim()) : "";
}

function firstImage(...blocks: string[]): string {
  for (const block of blocks) {
    if (!block) continue;
    const match = block.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i);
    if (match?.[1]) return decodeEntities(match[1].trim());
  }
  return "";
}

function looksLikeImage(url: string, type = ""): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  if (/^image\//i.test(type)) return true;
  return /\.(jpe?g|png|webp|gif|avif|bmp)(\?|#|$)/i.test(url);
}

function normalizeDate(value: string): string {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

/* =========================================================
   PARSING
========================================================= */

type ParsedItem = Omit<RssItem, "kind" | "sourceName" | "sourceSite" | "originalUrl">;

/*
 * Reads both RSS 2.0 (`<item>`) and Atom (`<entry>`) documents.
 */
export function parseFeed(xml: string): ParsedItem[] {
  const blocks = xml.match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)\s*>/gi) || [];

  return blocks
    .map((block): ParsedItem => {
      const title = tagText(block, "title");
      const link = tagAttr(block, "link", "href") || tagText(block, "link");
      const guid = tagText(block, "guid") || link;
      const description =
        tagText(block, "description") ||
        tagText(block, "summary") ||
        tagText(block, "subtitle");
      const content = tagText(block, "content:encoded") || tagText(block, "content");
      const pubDate =
        tagText(block, "pubDate") ||
        tagText(block, "published") ||
        tagText(block, "updated") ||
        tagText(block, "date");

      const mediaThumbnail = tagAttr(block, "media:thumbnail", "url");
      const mediaContent = tagAttr(block, "media:content", "url");
      const enclosureUrl = tagAttr(block, "enclosure", "url");
      const enclosureType = tagAttr(block, "enclosure", "type");

      const image =
        mediaThumbnail ||
        (looksLikeImage(mediaContent) ? mediaContent : "") ||
        (looksLikeImage(enclosureUrl, enclosureType) ? enclosureUrl : "") ||
        firstImage(content, description);

      return {
        title,
        link,
        guid,
        description,
        content,
        image_url: image,
        enclosure: enclosureUrl ? { url: enclosureUrl, link: enclosureUrl } : undefined,
        pubDate: normalizeDate(pubDate),
      };
    })
    .filter((item) => Boolean(item.title));
}

async function fetchFeed(name: string, feed: string): Promise<ParsedItem[]> {
  const response = await fetch(feed, {
    headers: {
      "user-agent": USER_AGENT,
      accept: ACCEPT,
    },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    next: { revalidate: 600 },
  });

  if (!response.ok) {
    throw new Error(`${name}: feed request failed (${response.status})`);
  }

  const xml = await response.text();

  const items = parseFeed(xml);
  if (!items.length) {
    throw new Error(`${name}: feed contained no items`);
  }

  return items;
}

/* =========================================================
   LOAD ALL FEEDS
========================================================= */

/*
 * Fetches every source in parallel. A source that fails is skipped so
 * one broken publisher can never blank out the whole site.
 */
export async function fetchRssItems(): Promise<RssItem[]> {
  const results = await Promise.allSettled(
    RSS_SOURCES.map(async ([name, feed, site]) => {
      const items = await fetchFeed(name, feed);
      return items.map(
        (item): RssItem => ({
          ...item,
          kind: "rss",
          sourceName: name,
          sourceSite: site,
          originalUrl: item.link,
        }),
      );
    }),
  );

  const items = results
    .filter((result): result is PromiseFulfilledResult<RssItem[]> => result.status === "fulfilled")
    .flatMap((result) => result.value);

  /*
   * Persist every fetched story. Once a story leaves the feed its URL would
   * otherwise start 404ing, breaking links Google has already indexed.
   * Throttled and failure-tolerant inside archiveRssItems.
   */
  await archiveRssItems(items);

  return items;
}