# Newsight — Next.js 16 version

This is a Next.js App Router migration of the existing Newsight project. The homepage and article route are server-rendered for metadata, while the existing HTML/CSS/JS dashboard/auth/frontend logic is preserved under `public/legacy`.

## What this fixes

- The homepage chooses the current lead story on the server.
- `generateMetadata()` sets `og:title`, `og:description`, `og:image`, Twitter/X image and title before the HTML is sent.
- Article URLs also get server-generated social metadata.
- The browser favicon remains `https://newsight.co.ke/assets/logo/logo_icon.png`.
- RSS and Supabase data are revalidated/cached for 10 minutes on the server.

## Requirements

Use Node.js 20.9+ (20.12+ is recommended by the current Next.js learning environment). Next.js 16.3.3 is used in this package and is an Active LTS release as of August 2026.

## Run locally

1. Extract the ZIP.
2. Open a terminal in the extracted folder.
3. Run:

   npm install

4. Optional: copy `.env.local.example` to `.env.local` and put your Supabase URL/anon key there.
5. Start the development server:

   npm run dev

6. Open `http://localhost:3000`.

## Test production mode

npm run build
npm start

Then open `http://localhost:3000`.

To verify server metadata, open the homepage and use View Page Source / Ctrl+U. Search for `og:image`. It should contain the server-selected lead image, not only a JavaScript-updated value in DevTools.

## GitHub + Netlify/Vercel

Push the project root (the folder containing `package.json`) to GitHub. Connect the repository to a host that supports Next.js server rendering. The host should run `npm install` and `npm run build`, then serve the Next.js application with its Next.js adapter/runtime.

Set these environment variables in the host:

NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY

The anon key is suitable for browser use when your Supabase Row Level Security policies are correctly configured. Never put a Supabase service-role key in this project.

## Existing dashboard/auth

The existing dashboard, login and signup scripts are kept under `public/legacy`. The homepage and article page use the same existing UI markup and client scripts, so this is a migration rather than a complete rewrite of your frontend.


## Roles, approvals and admin dashboard

Run `supabase/roles-and-approvals.sql` in the Supabase SQL Editor. The migration adds `users.role` (`user`, `author`, `admin`) and `news.approval_status`. Regular users can submit stories, but their stories are saved as drafts with `approval_status = pending` and therefore do not appear on the public homepage. Authors and admins publish immediately.

The admin dashboard is available at `/admin.html`. It uses secure Next.js server routes and therefore uses `SUPABASE_SERVICE_ROLE_KEY` from `app/config/server-config.ts`. Replace the placeholder in that file before deployment. The key is still server-only: never import that config into browser/client code.

After running the migration, promote your first administrator with the SQL statement shown at the bottom of the migration file.
