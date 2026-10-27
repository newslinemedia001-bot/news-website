import type { MetadataRoute } from "next";
import { articlePath, getIndexableStories } from "./seo";

const SITE_URL = "https://newsight.co.ke";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const stories = await getIndexableStories();

  const articleUrls = stories.map((story) => ({
    url: `${SITE_URL}${articlePath(story.kind, story.id, story.title)}`,
    lastModified: story.date ? new Date(story.date) : undefined,
    changeFrequency: "hourly" as const,
    priority: 0.8,
  }));

  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "always",
      priority: 1,
    },
    ...articleUrls,
  ];
}
