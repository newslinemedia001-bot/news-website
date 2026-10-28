import { fetchRssItems } from "../../rss";
import { loadArchivedRss, mergeWithArchive } from "../../rss-store";

/*
 * Serves parsed RSS stories to the legacy browser scripts
 * (`public/legacy/app.js`). Those scripts run in the browser, where a
 * direct fetch of the publisher feeds would be blocked by CORS, and
 * api.rss2json.com (the previous proxy) now returns a Cloudflare 403.
 */
export const revalidate = 300;

export async function GET() {
  try {
    const live = await fetchRssItems();

    /*
     * Archived stories fill the gaps the live feeds no longer cover, so
     * homepage grids keep rendering stories whose feed slot has rolled over.
     */
    const archived = await loadArchivedRss({ limit: 300 });
    const items = mergeWithArchive(live, archived);

    if (!items.length) {
      return Response.json({ status: "error", items: [] }, { status: 502 });
    }

    return Response.json({ status: "ok", items });
  } catch (error) {
    console.error("RSS route failed:", error);
    return Response.json({ status: "error", items: [] }, { status: 502 });
  }
}