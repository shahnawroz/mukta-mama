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
  paid_at timestamptz not null default now()
);

-- A month can have several payments (part payments). Older installs had one per month.
alter table public.payments drop constraint if exists payments_room_id_month_key;
create index if not exists payments_room_month_idx on public.payments (room_id, month);

alter table public.payments add column if not exists paid_by text;
-- Part of the rent settled from the tenant's advance (not cash received).
alter table public.payments add column if not exists advance_applied numeric not null default 0;

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

-- Utilities: electricity, gas, water... (table keeps its original name)
create table if not exists public.electricity_deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  meter_number text not null,
  amount numeric not null,
  deposit_date date not null default current_date,
  invoice_path text,
  created_at timestamptz not null default now()
);

-- What kind of bill it is, typed by the admin (Electricity, Gas, Water...).
alter table public.electricity_deposits add column if not exists utility_type text not null default 'Electricity';
-- Gas or water bills may have no meter number.
alter table public.electricity_deposits alter column meter_number drop not null;

alter table public.electricity_deposits enable row level security;

drop policy if exists "own electricity" on public.electricity_deposits;
create policy "own electricity" on public.electricity_deposits for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Private bucket for invoice images; files live under <user id>/...
insert into storage.buckets (id, name, public)
  values ('invoices', 'invoices', false)
  on conflict (id) do nothing;

drop policy if exists "own invoices" on storage.objects;
create policy "own invoices" on storage.objects for all to authenticated
  using (bucket_id = 'invoices' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'invoices' and (storage.foldername(name))[1] = auth.uid()::text);

-- Bank transfers (cash on hand = rent collected - transfers)
create table if not exists public.bank_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  amount numeric not null check (amount > 0),
  transfer_date date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

alter table public.bank_transfers enable row level security;

drop policy if exists "own bank transfers" on public.bank_transfers;
create policy "own bank transfers" on public.bank_transfers for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Expenses paid from cash (cash on hand = rent collected - bank transfers - expenses)
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  amount numeric not null check (amount > 0),
  expense_date date not null default current_date,
  note text not null,
  created_at timestamptz not null default now()
);

alter table public.expenses enable row level security;

drop policy if exists "own expenses" on public.expenses;
create policy "own expenses" on public.expenses for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Advance returned to tenants or used against rent (log only, not part of cash on hand). room_id is kept nullable so the log
-- survives if the room is deleted later.
create table if not exists public.advance_returns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete set null,
  room_label text not null,
  amount numeric not null check (amount > 0),
  return_date date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

alter table public.advance_returns enable row level security;

drop policy if exists "own advance returns" on public.advance_returns;
create policy "own advance returns" on public.advance_returns for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.advance_returns add column if not exists kind text not null default 'refund'
  check (kind in ('refund', 'applied')); -- refund = paid out of cash, applied = deducted from rent
alter table public.advance_returns add column if not exists payment_id uuid
  references public.payments(id) on delete cascade;

-- Advance is security money held separately; it does not count as cash on hand.
drop table if exists public.advance_receipts;

-- Advance moved into cash on hand or the bank, so the owner can spend it.
create table if not exists public.advance_moves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  amount numeric not null check (amount > 0),
  destination text not null check (destination in ('cash', 'bank')),
  move_date date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

alter table public.advance_moves enable row level security;

drop policy if exists "own advance moves" on public.advance_moves;
create policy "own advance moves" on public.advance_moves for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Where a cash refund of advance came from: 'advance' = money not moved yet, 'cash' = cash on hand.
alter table public.advance_returns add column if not exists paid_from text not null default 'advance'
  check (paid_from in ('advance', 'cash'));

-- Which room or shop an advance move came from (older moves have none).
alter table public.advance_moves add column if not exists room_id uuid
  references public.rooms(id) on delete set null;
alter table public.advance_moves add column if not exists room_label text;

-- A utility bill can have both a meter number and a holding number.
alter table public.electricity_deposits add column if not exists holding_number text;

-- One bill (one meter / holding number) can cover several rooms and shops.
alter table public.electricity_deposits add column if not exists room_ids uuid[] not null default '{}';
update public.electricity_deposits set room_ids = array[room_id] where room_ids = '{}';
