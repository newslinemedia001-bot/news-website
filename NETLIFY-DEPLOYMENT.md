# Netlify deployment

This is a Next.js App Router project. Deploy it through a Git-connected Netlify site (not as a static drag-and-drop ZIP).

Build command:
`npm run build`

Publish directory:
`.next`

The repository includes an explicit `@netlify/plugin-nextjs` runtime entry in `netlify.toml` so Next.js SSR, App Router routes, API routes and dynamic article pages are handled correctly.

After deployment, test:
- `/`
- `/login.html`
- `/admin.html`
- `/robots.txt`
- `/sitemap.xml`
- `/news-sitemap.xml`
