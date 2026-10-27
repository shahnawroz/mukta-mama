-- Run this in the Supabase SQL editor. Safe to run more than once.
-- "rooms" holds both rooms and shops (see the kind column).

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  room_number text not null,
  rent numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table public.rooms add column if not exists kind text not null default 'room'
  check (kind in ('room', 'shop'));

alter table public.rooms add column if not exists advance numeric not null default 0;

alter table public.rooms drop constraint if exists rooms_user_id_room_number_key;
create unique index if not exists rooms_user_kind_number_key
  on public.rooms (user_id, kind, room_number);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  month date not null, -- first day of the month
  amount numeric not null,
  paid_at timestamptz not null default now(),
  unique (room_id, month)
);

alter table public.rooms enable row level security;
alter table public.payments enable row level security;

drop policy if exists "own rooms" on public.rooms;
create policy "own rooms" on public.rooms for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own payments" on public.payments;
create policy "own payments" on public.payments for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- One-time: copy any shops added with the earlier version into rooms, then drop the old tables.
do $$
begin
  if to_regclass('public.shops') is not null then
    insert into public.rooms (user_id, kind, room_number, rent)
      select user_id, 'shop', shop_number, rent from public.shops
      on conflict do nothing;
    drop table if exists public.shop_payments;
    drop table public.shops;
  end if;
end $$;
