import type { Metadata } from "next";
import { getHomeMetadata } from "./seo";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  return getHomeMetadata();
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const metadata = await getHomeMetadata();
  const title = typeof metadata.title === "string" ? metadata.title : "Newsight - Kenya News & Latest Updates";
  const description = metadata.description || "Stay informed with the latest news from Kenya and around the world.";
  const og = metadata.openGraph;
  const image = typeof og?.images?.[0] === "string" ? og.images[0] : og?.images?.[0]?.url || "https://newsight.co.ke/assets/logo/logo_icon.png";

  return (
    <html lang="en">
      <head>
        {/* Explicit server-rendered tags: these are present in View Source / Ctrl+U. */}
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={image} />
        <meta property="og:url" content="https://newsight.co.ke/" />
        <meta property="og:site_name" content="Newsight" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={image} />
        <link rel="canonical" href="https://newsight.co.ke/" />
        <link rel="icon" href="https://newsight.co.ke/assets/logo/logo_icon.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
