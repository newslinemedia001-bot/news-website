import { permanentRedirect, notFound } from "next/navigation";
import { articleUrl, findArticle } from "../article-data";

export default async function LegacyArticleRedirect({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; id?: string }>;
}) {
  const params = await searchParams;
  if (!params.kind || !params.id) notFound();
  const article = await findArticle(params.kind, params.id);
  if (!article) notFound();
  const kind = params.kind === "community" ? "community" : "rss";
  permanentRedirect(articleUrl(kind, String(params.id), article.title || "news"));
}
