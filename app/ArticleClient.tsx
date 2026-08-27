"use client";

import Script from "next/script";

export default function ArticleClient({
  bodyHtml,
}: {
  bodyHtml: string;
}) {
  return (
    <>
      <div
        dangerouslySetInnerHTML={{
          __html: bodyHtml,
        }}
      />

      <Script
        src="/legacy/app.js"
        type="module"
        strategy="afterInteractive"
      />
    </>
  );
}