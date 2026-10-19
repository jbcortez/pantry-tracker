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

-- Phase 3: recipes.
alter table public.households add column if not exists recipe_notes text not null default '';

create table if not exists public.recipes (
  id uuid primary key,
  household_id uuid not null references public.households on delete cascade,
  title text not null,
  summary text not null default '',
  time_minutes integer,
  servings integer,
  ingredients jsonb not null default '[]'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  source text not null,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists recipes_household_updated on public.recipes (household_id, updated_at, id);

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
drop trigger if exists touch on public.recipes;
create trigger touch before insert or update on public.recipes
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
alter table public.recipes enable row level security;

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

drop policy if exists "members all" on public.recipes;
create policy "members all" on public.recipes for all
  using (public.is_member(household_id)) with check (public.is_member(household_id));

grant select, insert, update, delete on public.products, public.inventory_units, public.shopping_items, public.recipes to authenticated;

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

-- ───────────────────────── Claude connector ─────────────────────────
-- Each household can create keys that let Claude (connector or CLI) read the kitchen,
-- save recipes and add to the shopping list. Only a hash of each key is stored.

alter table public.recipes drop constraint if exists recipes_source_check;
alter table public.recipes add constraint recipes_source_check check (source in ('ai', 'url', 'manual', 'claude'));

create table if not exists public.agent_keys (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  key_hash text not null unique,
  label text not null default 'Claude',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
alter table public.agent_keys enable row level security;
drop policy if exists "members read" on public.agent_keys;
create policy "members read" on public.agent_keys for select using (public.is_member(household_id));
revoke all on public.agent_keys from anon, authenticated;
grant select (id, household_id, label, created_at, last_used_at, revoked_at) on public.agent_keys to authenticated;

-- pgcrypto lives in the "extensions" schema on Supabase.
create or replace function public.create_agent_key(p_household uuid, p_label text default 'Claude')
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  k text;
begin
  if not public.is_member(p_household) then
    raise exception 'Not a member of this household';
  end if;
  k := 'pantry_' || encode(gen_random_bytes(24), 'hex');
  insert into public.agent_keys (household_id, key_hash, label)
    values (p_household, encode(digest(k, 'sha256'), 'hex'), coalesce(nullif(trim(p_label), ''), 'Claude'));
  return k;
end $$;

create or replace function public.revoke_agent_key(p_id uuid)
returns void
language sql security definer set search_path = public as $$
  update public.agent_keys set revoked_at = now()
  where id = p_id and public.is_member(household_id) and revoked_at is null
$$;

create or replace function public.agent_household(p_key text)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  k public.agent_keys;
begin
  select * into k from public.agent_keys
  where key_hash = encode(digest(coalesce(p_key, ''), 'sha256'), 'hex') and revoked_at is null;
  if k.id is null then
    raise exception 'Invalid or revoked Pantry key' using errcode = '28000';
  end if;
  if k.last_used_at is null or k.last_used_at < now() - interval '1 hour' then
    update public.agent_keys set last_used_at = now() where id = k.id;
  end if;
  return k.household_id;
end $$;

create or replace function public.agent_check(p_key text)
returns text
language sql security definer set search_path = public as $$
  select name from public.households where id = public.agent_household(p_key)
$$;

-- Everything Claude needs in one read: the household, what's on the shelves, the list, saved recipe titles.
create or replace function public.agent_snapshot(p_key text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  hid uuid := public.agent_household(p_key);
begin
  return jsonb_build_object(
    'household', (select jsonb_build_object('name', h.name, 'recipe_notes', h.recipe_notes, 'categories', h.categories)
                  from public.households h where h.id = hid),
    'products', coalesce((select jsonb_agg(to_jsonb(p)) from public.products p
                          where p.household_id = hid and p.deleted_at is null), '[]'::jsonb),
    'units', coalesce((select jsonb_agg(to_jsonb(u)) from public.inventory_units u
                       where u.household_id = hid and u.deleted_at is null), '[]'::jsonb),
    'shopping', coalesce((select jsonb_agg(to_jsonb(s)) from public.shopping_items s
                          where s.household_id = hid and s.deleted_at is null and s.checked_at is null), '[]'::jsonb),
    'recipes', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title) order by r.title)
                         from public.recipes r where r.household_id = hid and r.deleted_at is null), '[]'::jsonb)
  );
end $$;

create or replace function public.agent_save_recipe(p_key text, p_recipe jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  hid uuid := public.agent_household(p_key);
  rid uuid := gen_random_uuid();
begin
  if coalesce(trim(p_recipe->>'title'), '') = '' then
    raise exception 'A recipe needs a title';
  end if;
  if jsonb_typeof(p_recipe->'ingredients') <> 'array' or jsonb_typeof(p_recipe->'steps') <> 'array' then
    raise exception 'ingredients and steps must be lists';
  end if;
  insert into public.recipes (id, household_id, title, summary, time_minutes, servings, ingredients, steps, source, source_url)
  values (
    rid, hid, trim(p_recipe->>'title'), coalesce(p_recipe->>'summary', ''),
    (p_recipe->>'time_minutes')::integer, (p_recipe->>'servings')::integer,
    p_recipe->'ingredients', p_recipe->'steps', 'claude', nullif(p_recipe->>'source_url', '')
  );
  return rid;
end $$;

-- Adds items not already on the list (by product or name). Returns how many were added.
create or replace function public.agent_add_to_list(p_key text, p_items jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  hid uuid := public.agent_household(p_key);
  item jsonb;
  pid uuid;
  added integer := 0;
begin
  for item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    continue when coalesce(trim(item->>'name'), '') = '';
    select p.id into pid from public.products p
      where p.id = nullif(item->>'product_id', '')::uuid and p.household_id = hid;
    continue when exists (
      select 1 from public.shopping_items s
      where s.household_id = hid and s.deleted_at is null and s.checked_at is null
        and ((pid is not null and s.product_id = pid) or lower(s.name) = lower(trim(item->>'name')))
    );
    insert into public.shopping_items (id, household_id, product_id, name, category, note, source)
    values (gen_random_uuid(), hid, pid, trim(item->>'name'), coalesce(nullif(item->>'category', ''), 'other'),
            nullif(item->>'note', ''), case when item->>'note' is not null then 'recipe' else 'manual' end);
    added := added + 1;
  end loop;
  return added;
end $$;

revoke execute on function public.agent_household(text) from public, anon, authenticated;
revoke execute on function public.create_agent_key(uuid, text) from public, anon;
revoke execute on function public.revoke_agent_key(uuid) from public, anon;
grant execute on function public.create_agent_key(uuid, text) to authenticated;
grant execute on function public.revoke_agent_key(uuid) to authenticated;
-- These check the key themselves, so the server can call them without a user session.
grant execute on function public.agent_check(text) to anon, authenticated;
grant execute on function public.agent_snapshot(text) to anon, authenticated;
grant execute on function public.agent_save_recipe(text, jsonb) to anon, authenticated;
grant execute on function public.agent_add_to_list(text, jsonb) to anon, authenticated;

-- ───────────────────────── Live updates ─────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array['households', 'products', 'inventory_units', 'shopping_items', 'recipes'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
