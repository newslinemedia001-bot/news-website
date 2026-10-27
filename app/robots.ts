import type { MetadataRoute } from "next";

const SITE_URL = "https://newsight.co.ke";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin.html",
          "/dashboard.html",
          "/login.html",
          "/signup.html",
          "/api/",
          "/_next/",
        ],
      },
    ],
    sitemap: [
      `${SITE_URL}/sitemap.xml`,
      `${SITE_URL}/news-sitemap.xml`,
    ],
    host: SITE_URL,
  };
}
