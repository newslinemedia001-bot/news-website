import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import ArticleClient from "../../../../ArticleClient";
import { articleUrl, clean, FALLBACK_IMAGE, findArticle, imageFor, SITE_URL } from "../../../../article-data";
import { slugify } from "../../../../seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ kind: string; id: string; slug: string }>;
}): Promise<Metadata> {
  const route = await params;
  const article = await findArticle(route.kind, route.id);
  const title = article?.title ? `${clean(article.title)} | Newsight` : "Story not found | Newsight";
  const description = clean(
    article?.description || article?.summary || article?.content || "Read the latest story on Newsight.",
  ).slice(0, 300);
  const image = imageFor(article);
  const canonical = article
    ? `${SITE_URL}${articleUrl(route.kind === "community" ? "community" : "rss", route.id, article.title || route.slug)}`
    : `${SITE_URL}${articleUrl(route.kind === "community" ? "community" : "rss", route.id, route.slug)}`;

  if (!article) {
    return {
      title,
      description,
      robots: { index: false, follow: true },
    };
  }

  return {
    title,
    description,
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
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
  params,
}: {
  params: Promise<{ kind: string; id: string; slug: string }>;
}) {
  const route = await params;
  if (route.kind !== "rss" && route.kind !== "community") notFound();
  const article = await findArticle(route.kind, route.id);

  if (!article) notFound();

  const canonicalSlug = slugify(article.title || "news");
  if (route.slug !== canonicalSlug) {
    permanentRedirect(articleUrl(route.kind, route.id, article.title || "news"));
  }

  const title = clean(article.title || "Newsight article");
  const description = clean(article.description || article.summary || article.content || "Read the latest story on Newsight.").slice(0, 300);
  const image = imageFor(article) || FALLBACK_IMAGE;
  const datePublished = article.pubDate || article.published_at || article.created_at || new Date().toISOString();
  const canonical = `${SITE_URL}${articleUrl(route.kind === "community" ? "community" : "rss", route.id, article.title || route.slug)}`;
  const author = article.kind === "community" ? (article.sourceName || "Newsight Community") : (article.sourceName || "Newsight");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: title,
    description,
    image: [image],
    datePublished,
    dateModified: datePublished,
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    author: { "@type": article.kind === "community" ? "Person" : "Organization", name: author },
    publisher: {
      "@type": "Organization",
      name: "Newsight",
      url: `${SITE_URL}/`,
      logo: { "@type": "ImageObject", url: "https://newsight.co.ke/assets/logo/logo_icon.png" },
    },
    isAccessibleForFree: true,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <ArticleClient article={article} />
    </>
  );
}
