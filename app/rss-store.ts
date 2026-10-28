/*
 * RSS ARTICLE ARCHIVE (Supabase)
 *
 * Feeds only carry the newest ~30 stories per source. When a story rolls
 * out of the feed its article URL starts returning 404, which kills every
 * link Google already indexed. Every fetched story is therefore upserted
 * into `public.rss_articles` (see supabase/rss-articles.sql) and read back
 * whenever the live feeds no longer contain it.
 *
 * Server-only: uses the service role key for writes. Never import this
 * from a client component.
 ========================================================= */

import {
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
} from "./config/server-config";
import type { RssItem } from "./rss";

const TABLE = "rss_articles";

/* Writes are throttled so every page render does not hammer the database. */
const WRITE_INTERVAL_MS = 5 * 60 * 1000;

let lastWriteAt = 0;
let tableMissing = false;

type ArchivedRow = {
  id?: string;
  guid?: string | null;
  link?: string | null;
  title?: string | null;
  description?: string | null;
  content?: string | null;
  image_url?: string | null;
  source_name?: string | null;
  source_site?: string | null;
  pub_date?: string | null;
};

/*
 * Same id algorithm as `rssId()` in seo.ts / article-data.ts:
 * base64(guid || link || title), URL-safe. Duplicated here (rather than
 * imported) because seo.ts imports ./rss and a shared import would create
 * a module cycle.
 */
function stableId(item: {
  guid?: string;
  link?: string;
  title?: string;
}): string {
  const value = item.guid || item.link || item.title || "";
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replaceAll("/", "_")
    .replaceAll("+", "-")
    .replaceAll("=", "");
}

function toIso(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function text(value: unknown, max = 4000): string {
  const value_ = String(value ?? "").trim();
  if (!value_) return "";
  return value_.length > max ? value_.slice(0, max) : value_;
}

function mapRow(row: ArchivedRow): RssItem | null {
  if (!row?.title) return null;
  return {
    kind: "rss",
    guid: row.guid || "",
    link: row.link || "",
    title: String(row.title),
    description: row.description || "",
    content: row.content || "",
    image_url: row.image_url || "",
    pubDate: row.pub_date || "",
    sourceName: row.source_name || "Newsight",
    sourceSite: row.source_site || "",
    originalUrl: row.link || "",
  };
}

/* Lists only need card fields; the article body is large. */
const SELECT_COLUMNS =
  "guid,link,title,description,image_url,source_name,source_site,pub_date";

/* Single-article lookups need the body too. */
const SELECT_COLUMNS_FULL =
  "guid,link,title,description,content,image_url,source_name,source_site,pub_date";

/* =========================================================
   WRITE
========================================================= */

/*
 * Upserts everything the feeds just returned. Merging on the primary key
 * means a story already stored is refreshed (last_seen_at) but its original
 * row - and therefore its URL - is never replaced by a newer story.
 * Never throws: a database problem must not break page rendering.
 */
export async function archiveRssItems(items: RssItem[]): Promise<void> {
  if (!items.length || tableMissing) return;

  /* Skip during `next build`; pages archive on their first live render. */
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const now = Date.now();
  if (now - lastWriteAt < WRITE_INTERVAL_MS) return;
  lastWriteAt = now;

  const rows = items
    .map((item) => ({
      id: stableId(item),
      guid: text(item.guid, 1000),
      link: text(item.link, 2000),
      title: text(item.title, 500),
      description: text(item.description, 4000),
      content: text(item.content, 20000),
      image_url: text(item.image_url, 2000),
      source_name: text(item.sourceName, 200),
      source_site: text(item.sourceSite, 500),
      pub_date: toIso(item.pubDate),
    }))
    .filter((row) => row.id && row.title);

  if (!rows.length) return;

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    });

    if (response.ok) return;

    const detail = (await response.text()).slice(0, 300);

    if (response.status === 404) {
      tableMissing = true;
      console.warn(
        "[rss-archive] public.rss_articles does not exist yet - run supabase/rss-articles.sql in the Supabase SQL Editor.",
      );
      return;
    }

    console.warn(`[rss-archive] write failed (${response.status}):`, detail);
  } catch (error) {
    console.warn("[rss-archive] write failed:", error);
  }
}

/* =========================================================
   READ
========================================================= */

export type ArchiveOptions = {
  limit?: number;
  /* Full article HTML is only needed when rendering one article page. */
  includeContent?: boolean;
};

/*
 * Newest archived stories. Returns [] when the table has not been created
 * yet, so the site keeps working exactly as before the archive exists.
 */
export async function loadArchivedRss(
  options: ArchiveOptions = {},
): Promise<RssItem[]> {
  const { limit = 300, includeContent = false } = options;

  try {
    const params = new URLSearchParams({
      select: includeContent ? SELECT_COLUMNS_FULL : SELECT_COLUMNS,
      order: "pub_date.desc.nullslast",
      limit: String(limit),
    });

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?${params.toString()}`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        next: { revalidate: 600 },
      },
    );

    if (!response.ok) return [];

    const data = await response.json();
    if (!Array.isArray(data)) return [];

    return data
      .map((row: ArchivedRow) => mapRow(row))
      .filter((item: RssItem | null): item is RssItem => Boolean(item))
      .map((item: RssItem) =>
        includeContent ? item : { ...item, content: "" },
      );
  } catch {
    return [];
  }
}

/*
 * Single archived story lookup, used when the live feeds no longer carry
 * an article whose URL is already indexed by Google.
 */
export async function findArchivedRss(id: string): Promise<RssItem | null> {
  if (!id) return null;

  try {
    const params = new URLSearchParams({
      select: SELECT_COLUMNS_FULL,
      id: `eq.${id}`,
      limit: "1",
    });

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?${params.toString()}`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        next: { revalidate: 600 },
      },
    );

    if (!response.ok) return null;

    const data = await response.json();
    const row = Array.isArray(data) ? data[0] : null;
    return row ? mapRow(row) : null;
  } catch {
    return null;
  }
}

/* =========================================================
   MERGE
========================================================= */

function keyOf(item: {
  guid?: string;
  link?: string;
  title?: string;
}): string {
  return String(item.guid || item.link || item.title || "");
}

/*
 * Live stories win, archived stories fill the gaps. Used everywhere a list
 * is rendered so a section can never go empty just because a feed rolled
 * over, while the newest headlines always stay on top.
 */
export function mergeWithArchive<T extends { guid?: string; link?: string; title?: string }>(
  live: T[],
  archived: T[],
): T[] {
  const seen = new Set(live.map(keyOf).filter(Boolean));
  return [
    ...live,
    ...archived.filter((item) => {
      const key = keyOf(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  ];
}
