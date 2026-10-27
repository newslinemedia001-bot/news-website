import { supabase } from "./supabase.js";

const RSS_SOURCES = [
  { name: "The Standard Kenya", feed: "https://www.standardmedia.co.ke/rss/kenya.php", site: "https://www.standardmedia.co.ke" },
  { name: "Kenya News Agency", feed: "https://www.kenyanews.go.ke/feed/", site: "https://www.kenyanews.go.ke" },
  { name: "KBC Digital", feed: "https://www.kbc.co.ke/feed/", site: "https://www.kbc.co.ke" },
  { name: "K24 Digital", feed: "https://k24.digital/feed", site: "https://k24.digital" },
  { name: "BBC News Kenya", feed: "https://feeds.bbci.co.uk/news/topics/c40rjmqdlzzt/rss.xml", site: "https://www.bbc.com/news/topics/c40rjmqdlzzt" },
  { name: "Tukio", feed: "https://tukio.co.ke/feed/", site: "https://tukio.co.ke" },
  { name: "Capital FM Kenya", feed: "https://www.capitalfm.co.ke/news/feed/", site: "https://www.capitalfm.co.ke/news" },
];

const RSS_API = "https://api.rss2json.com/v1/api.json?rss_url=";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slugify(value = "") {
  const normalized = String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-+/g, "-");
  return normalized.slice(0, 90).replace(/-+$/g, "") || "news";
}
function articleUrl(kind, id, title) { return `/news/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/${slugify(title || "news")}`; }

function articleId(item) {
  return btoa(
    unescape(encodeURIComponent(item.guid || item.link || item.title)),
  )
    .replaceAll("/", "_")
    .replaceAll("+", "-")
    .replaceAll("=", "");
}

function clean(value = "") {
  const div = document.createElement("div");
  div.innerHTML = value;
  return (div.textContent || "").replace(/\s+/g, " ").trim();
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

const NEWSIGHT_FALLBACK_IMAGE = "https://newsight.co.ke/assets/logo/logo.png";

function imageFor(item) {
  return (
    item.image_url ||
    item.thumbnail ||
    item.enclosure?.link ||
    item.enclosure?.url ||
    NEWSIGHT_FALLBACK_IMAGE
  );
}

async function loadRss() {
  const results = await Promise.allSettled(
    RSS_SOURCES.map(async (source) => {
      const response = await fetch(RSS_API + encodeURIComponent(source.feed));

      const data = await response.json();

      if (data.status !== "ok") {
        throw new Error(source.name);
      }

      return (data.items || []).map((item) => ({
        ...item,
        kind: "rss",
        sourceName: source.name,
        sourceSite: source.site,
      }));
    }),
  );

  const stories = results
    .filter((item) => item.status === "fulfilled")
    .flatMap((item) => item.value);

  const unique = [];
  const seen = new Set();

  for (const story of stories) {
    const key = story.guid || story.link || story.title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(story);
  }

  return unique.filter(hasImage).sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
}

async function findArticle() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const kind = params.get("kind");

  if (!id) return null;

  if (kind === "community") {
    const { data, error } = await supabase
      .from("news")
      .select("*")
      .eq("id", id)
      .eq("status", "published")
      .single();

    if (error) throw error;

    let sourceName = "Newsight Community";

    if (data.author_id) {
      const { data: author, error: authorError } = await supabase
        .from("users")
        .select("full_name")
        .eq("id", data.author_id)
        .maybeSingle();

      if (!authorError && author?.full_name) {
        sourceName = author.full_name;
      }
    }

    return {
      kind: "community",
      title: data.title,
      summary: data.summary,
      content: data.content,
      imageUrl: data.image_url,
      date: data.published_at || data.created_at,
      sourceName,
    };
  }

  const stories = await loadRss();
  const story = stories.find((item) => articleId(item) === id);

  if (!story) return null;

  return {
    kind: "rss",
    title: story.title,
    summary: clean(story.description),
    content: story.content || story.description,
    imageUrl: imageFor(story),
    date: story.pubDate,
    sourceName: story.sourceName,
    sourceSite: story.sourceSite,
    originalUrl: story.link,
  };
}

async function renderRecent() {
  const list = document.getElementById("articleRecentList");
  if (!list) return;

  const stories = await loadRss();

  list.innerHTML = stories
    .slice(0, 8)
    .map(
      (story) => `
    <a class="recent-item" href="${articleUrl("rss", articleId(story), story.title)}">
      <strong>${escapeHtml(story.title)}</strong>
      <span>${escapeHtml(story.sourceName)}</span>
    </a>
  `,
    )
    .join("");
}

async function init() {
  const article = document.getElementById("article");

  try {
    const story = await findArticle();

    if (!story) {
      article.innerHTML = `
        <div class="empty-state">
          <h1>Story not found</h1>
          <p>Return to the homepage and select another story.</p>
        </div>`;
      return;
    }

    document.title = `${story.title} | Newsight`;

    article.innerHTML = `
      <div class="article-source">${escapeHtml(story.sourceName)}</div>
      <h1>${escapeHtml(story.title)}</h1>
      <div class="article-date">${escapeHtml(formatDate(story.date))}</div>

      ${
        story.imageUrl
          ? `<img class="article-cover" src="${escapeHtml(story.imageUrl)}" alt="" onerror="this.onerror=null;this.src='https://newsight.co.ke/assets/logo/logo.png'">`
          : ""
      }

      <p class="article-summary">${escapeHtml(story.summary || "")}</p>

      <div class="article-content">
        ${
          story.kind === "community"
            ? escapeHtml(story.content || "").replace(/\n/g, "<br>")
            : story.content || story.summary || ""
        }
      </div>  

      ${
        story.kind === "rss"
          ? `<div class="attribution">
               <strong>Original source</strong>
               <p>
                 This story is displayed from the RSS feed of
                 <strong>${escapeHtml(story.sourceName)}</strong>.
                 Newsight does not claim ownership of the original reporting.
               </p>
               <a href="${escapeHtml(story.originalUrl)}" target="_blank" rel="noopener noreferrer">
                 Read the original article →
               </a>
             </div>`
          : `<div class="attribution community">
               <strong>Newsight Community</strong>
               <p>This story was published by a registered Newsight user.</p>
             </div>`
      }
    `;
  } catch (error) {
    console.error(error);
    article.innerHTML = `
      <div class="empty-state">
        <h1>Unable to load this story</h1>
        <p>${escapeHtml(error.message || "Please try again.")}</p>
      </div>`;
  }

  renderRecent().catch(console.error);
}

init();
