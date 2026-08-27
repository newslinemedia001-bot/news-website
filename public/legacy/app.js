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
const REFRESH_MS = 10 * 60 * 1000;
const BREAKING_INTERVAL_MS = 5 * 1000;
let breakingTimer = null;
let breakingStories = [];
let breakingIndex = 0;

const $ = (id) => document.getElementById(id);

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function extractImageFromHtml(value = "") {
  const match = String(value).match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1]?.trim() || "";
}

function imageFor(item) {
  return (
    item?.image_url ||
    item?.thumbnail ||
    item?.enclosure?.link ||
    item?.enclosure?.url ||
    extractImageFromHtml(item?.description || item?.content || item?.summary || "") ||
    ""
  ).trim();
}

function hasImage(item) {
  const image = imageFor(item);
  return Boolean(image) && /^https?:\/\//i.test(image);
}

function withImages(items) {
  return items.filter(hasImage);
}

function rssId(item) {
  return btoa(
    unescape(encodeURIComponent(item.guid || item.link || item.title)),
  )
    .replaceAll("/", "_")
    .replaceAll("+", "-")
    .replaceAll("=", "");
}

async function fetchRssSource(source) {
  const response = await fetch(RSS_API + encodeURIComponent(source.feed));

  if (!response.ok) throw new Error(source.name);

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
}

async function loadRssStories() {
  const results = await Promise.allSettled(RSS_SOURCES.map(fetchRssSource));

  const stories = results
    .filter((result) => result.status === "fulfilled")
    .flatMap((result) => result.value);

  const seen = new Set();

  return stories
    .filter((item) => {
      const key = item.guid || item.link || item.title;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .filter(hasImage)
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
}

async function loadCommunityStories() {
  const { data, error } = await supabase
    .from("news")
    .select(
      "id,title,summary,content,image_url,category,published_at,created_at,author_id",
    )
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(40);

  if (error) {
    console.warn("Community stories:", error.message);
    return [];
  }

  const authorIds = [...new Set(data.map((item) => item.author_id).filter(Boolean))];
  let authorNames = new Map();

  if (authorIds.length) {
    const { data: authors, error: authorError } = await supabase
      .from("users")
      .select("id,full_name")
      .in("id", authorIds);

    if (!authorError && Array.isArray(authors)) {
      authorNames = new Map(
        authors
          .filter((author) => author.id && author.full_name)
          .map((author) => [String(author.id), String(author.full_name)]),
      );
    }
  }

  return withImages(
    data.map((item) => ({
      ...item,
      kind: "community",
      sourceName: authorNames.get(String(item.author_id)) || "Newsight Community",
      pubDate: item.published_at || item.created_at,
    })),
  );
}

function communityUrl(item) {
  return `/article?kind=community&id=${encodeURIComponent(item.id)}`;
}

function rssUrl(item) {
  return `/article?kind=rss&id=${encodeURIComponent(rssId(item))}`;
}

function card(item) {
  const url = item.kind === "community" ? communityUrl(item) : rssUrl(item);

  return `
    <article class="news-card">
      <img src="${escapeHtml(imageFor(item))}" alt="" loading="lazy"
           onerror="handleImageError(this)">
      <div class="news-card-body">
        <div class="card-source">${escapeHtml(item.sourceName)}</div>
        <h3><a href="${url}">${escapeHtml(item.title || "Untitled")}</a></h3>
        <p>${escapeHtml(clean(item.description || item.summary || item.content).slice(0, 150))}…</p>
        <div class="card-footer">
          <span>${escapeHtml(formatDate(item.pubDate))}</span>
          <a href="${url}">Read story →</a>
        </div>
      </div>
    </article>`;
}

function classify(item) {
  if (item.kind === "community") {
    return (item.category || "Kenya").toLowerCase();
  }

  const text =
    `${item.title || ""} ${clean(item.description || "")}`.toLowerCase();

  if (/sport|football|athletics|rugby|marathon|premier league/.test(text))
    return "sports";
  if (
    /business|economy|market|finance|bank|trade|tax|company|shilling/.test(text)
  )
    return "business";
  if (
    /technology|tech|ai |artificial intelligence|cyber|digital|software|internet/.test(
      text,
    )
  )
    return "technology";
  if (/music|film|entertainment|celebrity|fashion|lifestyle/.test(text))
    return "entertainment";
  if (
    /international|world|tanzania|uganda|rwanda|usa|china|europe|africa/.test(
      text,
    )
  )
    return "international";
  if (
    /county|nairobi|mombasa|kisumu|nakuru|kiambu|garissa|mandera|machakos/.test(
      text,
    )
  )
    return "county";

  return "kenya";
}

function renderGrid(elementId, items, limit = 6) {
  const element = $(elementId);
  if (!element) return;

  element.innerHTML =
    items.slice(0, limit).map(card).join("") ||
    `<div class="empty-inline">No stories available.</div>`;
}

async function updateAuthArea() {
  const area = $("authArea");
  const { data } = await supabase.auth.getUser();

  if (data.user) {
    area.innerHTML = `
      <a href="/dashboard.html" class="sign-in">Dashboard</a>
      <button id="homeLogout" class="sign-up" type="button">Sign out</button>`;

    $("homeLogout").addEventListener("click", async () => {
      await supabase.auth.signOut();
      window.location.reload();
    });
  } else {
    area.innerHTML = `
      <a href="/login.html" class="sign-in">Sign in</a>
      <a href="/signup.html" class="sign-up">Sign up</a>`;
  }
}

function stopBreakingSlideshow() {
  if (breakingTimer) {
    clearInterval(breakingTimer);
    breakingTimer = null;
  }
}

function renderBreakingSlide() {
  const element = $("breakingText");
  if (!element || !breakingStories.length) return;

  const item = breakingStories[breakingIndex];
  const url = item.kind === "community" ? communityUrl(item) : rssUrl(item);

  element.innerHTML = `<a class="breaking-link" href="${url}" aria-label="Breaking news: ${escapeHtml(item.title || "Untitled")}">${escapeHtml(item.title || "Untitled")}</a>`;

  element.classList.remove("breaking-slide-in");
  void element.offsetWidth;
  element.classList.add("breaking-slide-in");
}

function startBreakingSlideshow(items) {
  stopBreakingSlideshow();
  breakingStories = withImages(items).slice(0, 5);
  breakingIndex = 0;

  if (!breakingStories.length) {
    const element = $("breakingText");
    if (element) element.textContent = "No breaking news with images available.";
    return;
  }

  renderBreakingSlide();

  if (breakingStories.length > 1) {
    breakingTimer = setInterval(() => {
      breakingIndex = (breakingIndex + 1) % breakingStories.length;
      renderBreakingSlide();
    }, BREAKING_INTERVAL_MS);
  }
}

async function renderHome() {
  $("today").textContent = new Intl.DateTimeFormat("en-KE", {
    dateStyle: "full",
  }).format(new Date());

  const [rssStories, communityStories] = await Promise.all([
    loadRssStories(),
    loadCommunityStories(),
  ]);

  const allStories = withImages([...rssStories, ...communityStories]).sort(
    (a, b) => new Date(b.pubDate) - new Date(a.pubDate),
  );

  if (!allStories.length) {
    $("leadStory").innerHTML = `
      <div class="empty-state">
        <h2>No news available</h2>
        <p>Check your RSS sources or Supabase connection.</p>
      </div>`;
    return;
  }

  const lead = allStories[0];
  const side = allStories.slice(1, 4);

  $("leadStory").innerHTML = `
    <img id="lead-img" src="${escapeHtml(imageFor(lead))}" alt="" onerror="this.onerror=null;this.src='https://newsight.co.ke/assets/logo/logo.png'">
    <div class="lead-content">
      <div class="card-source">${escapeHtml(lead.sourceName)}</div>
      <h1><a href="${lead.kind === "community" ? communityUrl(lead) : rssUrl(lead)}">${escapeHtml(lead.title)}</a></h1>
      <p>${escapeHtml(clean(lead.description || lead.summary || lead.content).slice(0, 250))}</p>
      <a href="${lead.kind === "community" ? communityUrl(lead) : rssUrl(lead)}" class="read-more">
        Read story →
      </a>
    </div>`;

  // Open Graph/Twitter metadata is generated server-side by index.php
  // before the page is sent to the browser. The frontend only renders news.
  $("sideStories").innerHTML = side
    .map(
      (item) => `
    <a class="side-story" href="${item.kind === "community" ? communityUrl(item) : rssUrl(item)}">
      <img src="${escapeHtml(imageFor(item))}" alt="">
      <div>
        <div class="side-source">${escapeHtml(item.sourceName)}</div>
        <h3><span>${escapeHtml(item.title)}</span></h3>
        <span>${escapeHtml(formatDate(item.pubDate))}</span>
      </div>
    </a>`,
    )
    .join("");

  startBreakingSlideshow(allStories);

  const groups = {
    kenya: [],
    county: [],
    business: [],
    sports: [],
    technology: [],
    entertainment: [],
    international: [],
  };

  allStories.forEach((item) => {
    const group = classify(item);
    if (groups[group]) groups[group].push(item);
  });

  renderGrid("kenyaGrid", groups.kenya);
  renderGrid("countyGrid", groups.county);
  renderGrid("businessGrid", groups.business);
  renderGrid("sportsGrid", groups.sports);
  renderGrid("technologyGrid", groups.technology);
  renderGrid("entertainmentGrid", groups.entertainment);
  renderGrid("internationalGrid", groups.international);
  renderGrid("communityGrid", communityStories);

  $("recentList").innerHTML = allStories
    .slice(0, 10)
    .map(
      (item) => `
    <a class="recent-item" href="${item.kind === "community" ? communityUrl(item) : rssUrl(item)}">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.sourceName)}</span>
    </a>`,
    )
    .join("");

  $("sourcesList").innerHTML = RSS_SOURCES.map(
    (source) => `
    <a class="source-link" href="${source.site}" target="_blank" rel="noopener noreferrer">
      ${escapeHtml(source.name)} →
    </a>`,
  ).join("");

  updateAuthArea();
}

$("searchForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const query = $("searchInput").value.trim().toLowerCase();
  if (!query) return;

  const [rssStories, communityStories] = await Promise.all([
    loadRssStories(),
    loadCommunityStories(),
  ]);

  const results = withImages([...rssStories, ...communityStories]).filter((item) =>
    `${item.title} ${clean(item.description || item.summary || item.content)}`
      .toLowerCase()
      .includes(query),
  );

  $("kenyaGrid").innerHTML =
    results.map(card).join("") ||
    `<div class="empty-inline">No matching stories found.</div>`;

  window.location.hash = "kenya";
});

$("menuToggle").addEventListener("click", () => {
  $("mainNav").classList.toggle("mobile-open");
});

supabase.auth.onAuthStateChange(() => {
  updateAuthArea().catch(console.error);
});

renderHome().catch((error) => {
  console.error(error);
  $("breakingText").textContent = "Unable to load some news feeds.";
});

setInterval(() => {
  renderHome().catch(console.error);
}, REFRESH_MS);

// Function to handle image error and remove parent container
function handleImageError(imgElement) {
  // Finds the closest wrapper div (e.g., .image-wrapper, .post-thumb) and removes it
  const parentContainer = imgElement.closest(
    ".post-thumb, .image-container, .img-div",
  );
  if (parentContainer) {
    parentContainer.remove();
  } else {
    imgElement.remove(); // Fallback if no specific parent wrapper is found
  }
}
