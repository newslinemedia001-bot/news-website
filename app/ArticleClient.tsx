"use client";

import Link from "next/link";

type Article = {
  id?: string;
  title?: string;
  description?: string;
  summary?: string;
  content?: string;
  image_url?: string;
  thumbnail?: string;
  enclosure?: { link?: string; url?: string };
  pubDate?: string;
  published_at?: string;
  created_at?: string;
  category?: string;
  sourceName?: string;
  sourceSite?: string;
  originalUrl?: string;
  kind?: "rss" | "community";
};

const FALLBACK_IMAGE = "https://newsight.co.ke/assets/logo/logo.png";

function imageFor(article: Article) {
  return article.image_url || article.thumbnail || article.enclosure?.link || article.enclosure?.url || FALLBACK_IMAGE;
}

function clean(value = "") {
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

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function safeRssHtml(value = "") {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

function decodeHtml(value = "") {
  return String(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&#39;/gi, "'");
}

function renderCommunityContent(value = "") {
  const raw = decodeHtml(String(value)).replace(/\r\n?/g, "\n");

  if (/<(?:p|div|br|h[1-6]|ul|ol|li|blockquote|pre)[\s>]/i.test(raw)) {
    return <div dangerouslySetInnerHTML={{ __html: safeRssHtml(raw) }} />;
  }

  return raw.split(/\n{2,}/).map((paragraph, index) => {
    const lines = paragraph.split("\n");
    return (
      <p key={index}>
        {lines.map((line, lineIndex) => (
          <span key={lineIndex}>
            {line}
            {lineIndex < lines.length - 1 && <br />}
          </span>
        ))}
      </p>
    );
  });
}

export default function ArticleClient({ article }: { article: Article | null }) {
  if (!article) {
    return (
      <main className="container article-layout">
        <article className="article-page">
          <div className="empty-state">
            <h1>Story not found</h1>
            <p>The article link is invalid, expired, or the story is no longer published.</p>
            <Link href="/">← Back to News</Link>
          </div>
        </article>
      </main>
    );
  }

  const title = article.title || "Untitled Article";
  const description = article.description || article.summary || "";
  const content = article.content || article.description || article.summary || "";
  const date = article.pubDate || article.published_at || article.created_at;

  return (
    <main className="container article-layout">
      <article className="article-page">
        <div className="article-source">{article.sourceName || "Newsight"}</div>
        <h1>{title}</h1>
        <div className="article-date">
          {formatDate(date)}
          {article.category ? ` • ${article.category}` : ""}
        </div>

        <img
          className="article-cover"
          src={imageFor(article)}
          alt={title}
          onError={(event) => {
            const img = event.currentTarget;
            if (img.src !== FALLBACK_IMAGE) img.src = FALLBACK_IMAGE;
            else img.style.display = "none";
          }}
        />

        {description && <p className="article-summary">{clean(description)}</p>}

        <div className="article-content">
          {article.kind === "community" ? (
            renderCommunityContent(content)
          ) : (
            <div dangerouslySetInnerHTML={{ __html: safeRssHtml(content) }} />
          )}
        </div>

        {article.kind === "rss" && article.originalUrl ? (
          <div className="attribution">
            <strong>Original source</strong>
            <p>
              This story is displayed from the RSS feed of <strong>{article.sourceName}</strong>. Newsight does not claim ownership of the original reporting.
            </p>
            <a href={article.originalUrl} target="_blank" rel="noopener noreferrer">
              Read the original article →
            </a>
          </div>
        ) : (
          <div className="attribution community">
            <strong>{article.sourceName || "Newsight Community"}</strong>
            <p>This story was published by a registered Newsight user.</p>
          </div>
        )}

        <div className="article-back">
          <Link href="/">← Back to News</Link>
        </div>
      </article>

      <aside className="sidebar">
        <div className="sidebar-card">
          <div className="sidebar-title">Latest</div>
          <p>Return to the homepage to browse the latest Newsight stories.</p>
          <Link href="/">Browse latest news →</Link>
        </div>
      </aside>
    </main>
  );
}
