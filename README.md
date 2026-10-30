# mukta-mama

Rent tracker for rooms and shops. Add rooms and shops with their rent and advance, mark rent as paid each month (the paid date is saved automatically), and keep track of cash on hand, bank transfers, expenses and prepaid electricity deposits.

## Features

- **Login:** email and password (Supabase Auth)
- **Dashboard:** cash on hand, in bank, advance held, expenses and electricity this month; Total / Paid / Due for all, rooms and shops; list of rooms and shops not yet collected this month
- **Rooms & Shops:** add, edit rent and advance, delete. "Use / return advance" deducts the advance from the last rent (rooms) or gives it back (shops)
- **Rent:** monthly Paid / Due table with a filter for rooms or shops. Every month starts as Due. Clicking Paid saves the date and who marked it
- **Income:** total collected, expenses, cash on hand and in bank. Transfer to bank deducts from cash. Monthly summary carries cash forward month to month
- **Expenses:** add what you spent and what it was for. It comes out of cash on hand
- **Utilities:** record any bill you pay for the building (electricity, gas, water, internet, garbage, maintenance or anything else). You type the bill type, the meter and holding number, pick the rooms and shops it covers, then add the amount, date and an invoice image. Bills can be filtered and totalled by type
- Responsive, with a full-screen hamburger menu on mobile

## How the money is counted

- **Cash on hand** = rent collected - bank transfers - expenses
- **Rent collected** = cash received + any part of the rent settled from the tenant's advance
- **Advance** is security money held separately. It is not part of cash on hand
- Returning an advance in cash does not change cash on hand

## Tech stack

Next.js (App Router), React, Ant Design, Supabase (Auth, Postgres, Storage), deployed on Vercel.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a Supabase project, then run [supabase/schema.sql](supabase/schema.sql) in the Supabase SQL editor. It is safe to run more than once, so run it again after pulling new changes. It also creates the private `invoices` storage bucket.

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
