# mukta-mama

Rent tracker for rooms and shops. Log in, add rooms or shops with their rent and advance, and mark rent as paid each month (the paid date is saved automatically).

## Features

- Email and password login (Supabase Auth)
- Dashboard: rooms/shops count, monthly rent, collected, due, advance held
- Rooms & Shops: add, edit rent and advance, delete
- Rent: monthly Paid / Due table with filter for rooms or shops
- Responsive, with a full-screen hamburger menu on mobile

## Tech stack

Next.js (App Router), React, Ant Design, Supabase, deployed on Vercel.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a Supabase project, then run [supabase/schema.sql](supabase/schema.sql) in the Supabase SQL editor. It is safe to run more than once.

3. In Supabase, go to Authentication → Users and create your login user (email and password). There is no sign-up page.

4. Create `.env.local` in the project root:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=your-project-url
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   ```

5. Start the dev server and open <http://localhost:3000>:

   ```bash
   npm run dev
   ```

## Scripts

| Command         | Description              |
| --------------- | ------------------------ |
| `npm run dev`   | Start the dev server     |
| `npm run build` | Production build         |
| `npm run start` | Run the production build |
| `npm run lint`  | Run ESLint               |

## Deploy

Connect this GitHub repo to a Vercel project (Settings → Git). Add the two Supabase variables above under Settings → Environment Variables. Every push to `main` then deploys automatically.
