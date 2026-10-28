import type { Metadata } from "next";
import Script from "next/script";
import { getHomeMetadata } from "./seo";
import "./globals.css";

/*
 * Page-level SEO tags (title, description, canonical, robots, Open Graph,
 * Twitter) come from Next's metadata system: getHomeMetadata() below for the
 * homepage, overridden by each page's own generateMetadata (e.g. article
 * pages emit their own canonical URL).
 *
 * They used to ALSO be written manually into this <head>, which put the
 * homepage's tags - including `canonical = https://newsight.co.ke/` - on
 * every article page. Two conflicting canonicals/titles per page told Google
 * that all articles were duplicates of the homepage, so article URLs were
 * barely indexed (12 indexed pages vs hundreds of stories).
 */
export async function generateMetadata(): Promise<Metadata> {
  return getHomeMetadata();
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://newsight.co.ke/#organization",
        name: "Newsight",
        url: "https://newsight.co.ke/",
        logo: { "@type": "ImageObject", url: "https://newsight.co.ke/assets/logo/logo_icon.png" },
      },
      {
        "@type": "WebSite",
        "@id": "https://newsight.co.ke/#website",
        url: "https://newsight.co.ke/",
        name: "Newsight",
        publisher: { "@id": "https://newsight.co.ke/#organization" },
        inLanguage: "en-KE",
      },
    ],
  };

  return (
    <html lang="en">
      <head>
        {/* Site-wide structured data only; per-page tags are rendered by Next. */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
        <link rel="icon" href="https://newsight.co.ke/assets/logo/logo_icon.png" />
        <Script
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5672747362546507"
          strategy="afterInteractive"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
