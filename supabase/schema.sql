-- Pantry Tracker database schema.
-- Paste this whole file into Supabase → SQL Editor → Run. Safe to run again after updates.

create extension if not exists pgcrypto;

-- ───────────────────────── Tables ─────────────────────────

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our Kitchen',
  invite_code text not null unique default encode(gen_random_bytes(6), 'hex'),
  categories jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  display_name text,
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- Kinds of things you buy; also the household's barcode memory.
create table if not exists public.products (
  id uuid primary key,
  household_id uuid not null references public.households on delete cascade,
  barcode text,
  name text not null,
  brand text,
  package_size text,
  image_url text,
  category text not null,
  default_location text not null check (default_location in ('pantry', 'fridge', 'freezer')),
  tracking text not null check (tracking in ('count', 'level')),
  source text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists products_household_updated on public.products (household_id, updated_at, id);
create index if not exists products_household_barcode on public.products (household_id, barcode);

-- One row per physical package.
create table if not exists public.inventory_units (
  id uuid primary key,
  household_id uuid not null references public.households on delete cascade,
  product_id uuid not null references public.products on delete cascade,
  location text not null check (location in ('pantry', 'fridge', 'freezer')),
  level real not null default 1 check (level > 0 and level <= 1),
  opened_at timestamptz,
  use_by date,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists units_household_updated on public.inventory_units (household_id, updated_at, id);

-- Phase 2: "always keep stocked".
alter table public.products add column if not exists staple boolean not null default false;

create table if not exists public.shopping_items (
  id uuid primary key,
  household_id uuid not null references public.households on delete cascade,
  product_id uuid references public.products on delete set null,
  name text not null,
  category text not null,
  note text,
  source text not null check (source in ('manual', 'staple', 'ran_out', 'recipe')),
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists shopping_household_updated on public.shopping_items (household_id, updated_at, id);

-- The server clock decides updated_at, so sync cursors don't depend on phone clocks.
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists touch on public.households;
create trigger touch before insert or update on public.households
  for each row execute function public.touch_updated_at();
drop trigger if exists touch on public.products;
create trigger touch before insert or update on public.products
  for each row execute function public.touch_updated_at();
drop trigger if exists touch on public.inventory_units;
create trigger touch before insert or update on public.inventory_units
  for each row execute function public.touch_updated_at();
drop trigger if exists touch on public.shopping_items;
create trigger touch before insert or update on public.shopping_items
  for each row execute function public.touch_updated_at();

-- ───────────────────────── Access rules ─────────────────────────
-- Members of a household can see and change everything in it, and nothing else.

create or replace function public.is_member(hid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.household_members m where m.household_id = hid and m.user_id = auth.uid()
  )
$$;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.products enable row level security;
alter table public.inventory_units enable row level security;
alter table public.shopping_items enable row level security;

drop policy if exists "members read" on public.households;
create policy "members read" on public.households for select using (public.is_member(id));
drop policy if exists "members update" on public.households;
create policy "members update" on public.households for update using (public.is_member(id)) with check (public.is_member(id));

drop policy if exists "members read" on public.household_members;
create policy "members read" on public.household_members for select using (public.is_member(household_id));
drop policy if exists "leave" on public.household_members;
create policy "leave" on public.household_members for delete using (user_id = auth.uid());

drop policy if exists "members all" on public.products;
create policy "members all" on public.products for all
  using (public.is_member(household_id)) with check (public.is_member(household_id));

drop policy if exists "members all" on public.inventory_units;
create policy "members all" on public.inventory_units for all
  using (public.is_member(household_id)) with check (public.is_member(household_id));

grant select, update on public.households to authenticated;
grant select, delete on public.household_members to authenticated;
drop policy if exists "members all" on public.shopping_items;
create policy "members all" on public.shopping_items for all
  using (public.is_member(household_id)) with check (public.is_member(household_id));

grant select, insert, update, delete on public.products, public.inventory_units, public.shopping_items to authenticated;

-- ───────────────────────── Create / join ─────────────────────────

create or replace function public.create_household(p_name text, p_display_name text default null)
returns public.households
language plpgsql security definer set search_path = public as $$
declare
  h public.households;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  insert into public.households (name) values (coalesce(nullif(trim(p_name), ''), 'Our Kitchen')) returning * into h;
  insert into public.household_members (household_id, user_id, display_name) values (h.id, auth.uid(), p_display_name);
  return h;
end $$;

create or replace function public.join_household(p_code text, p_display_name text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  hid uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  select id into hid from public.households where invite_code = lower(trim(p_code));
  if hid is null then
    raise exception 'That invite link is not valid';
  end if;
  insert into public.household_members (household_id, user_id, display_name)
    values (hid, auth.uid(), p_display_name)
    on conflict (household_id, user_id) do nothing;
  return hid;
end $$;

revoke execute on function public.create_household(text, text) from public, anon;
revoke execute on function public.join_household(text, text) from public, anon;
grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.join_household(text, text) to authenticated;

-- ───────────────────────── Live updates ─────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array['households', 'products', 'inventory_units', 'shopping_items'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
