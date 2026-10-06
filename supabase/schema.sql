-- PRABAL HOUSING — listings database
-- Run this once in Supabase: SQL Editor → New query → paste → Run.

-- 1. Listings ---------------------------------------------------------------
create table if not exists public.properties (
    id             uuid primary key default gen_random_uuid(),
    title          text not null check (char_length(title) between 1 and 120),
    developer      text check (char_length(developer) <= 120),
    configurations text[] not null default '{}',
    price_lakhs    numeric check (price_lakhs is null or price_lakhs >= 0),
    price_onwards  boolean not null default false,
    location       text not null check (char_length(location) between 1 and 120),
    city           text not null default 'Pune',
    image_url      text,
    image_path     text,
    status         text not null default 'available'
                   check (status in ('available', 'new_launch', 'closed')),
    featured       boolean not null default false,
    rera           text check (char_length(rera) <= 60),
    sort_order     integer not null default 0,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end $$;

drop trigger if exists properties_touch on public.properties;
create trigger properties_touch before update on public.properties
    for each row execute function public.touch_updated_at();

-- 2. Who may edit: only users listed here ----------------------------------
create table if not exists public.admins (
    user_id    uuid primary key references auth.users (id) on delete cascade,
    created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- 3. Row-level security -----------------------------------------------------
alter table public.properties enable row level security;
alter table public.admins enable row level security;

drop policy if exists "Listings are public" on public.properties;
create policy "Listings are public" on public.properties
    for select using (true);

drop policy if exists "Admins add listings" on public.properties;
create policy "Admins add listings" on public.properties
    for insert to authenticated with check (public.is_admin());

drop policy if exists "Admins edit listings" on public.properties;
create policy "Admins edit listings" on public.properties
    for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins delete listings" on public.properties;
create policy "Admins delete listings" on public.properties
    for delete to authenticated using (public.is_admin());

drop policy if exists "Admins see themselves" on public.admins;
create policy "Admins see themselves" on public.admins
    for select to authenticated using (user_id = auth.uid());

-- 4. Photo storage (public read, admin write, 5 MB max, images only) --------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-images', 'property-images', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

drop policy if exists "Property photos are public" on storage.objects;
create policy "Property photos are public" on storage.objects
    for select using (bucket_id = 'property-images');

drop policy if exists "Admins upload photos" on storage.objects;
create policy "Admins upload photos" on storage.objects
    for insert to authenticated with check (bucket_id = 'property-images' and public.is_admin());

drop policy if exists "Admins replace photos" on storage.objects;
create policy "Admins replace photos" on storage.objects
    for update to authenticated using (bucket_id = 'property-images' and public.is_admin());

drop policy if exists "Admins delete photos" on storage.objects;
create policy "Admins delete photos" on storage.objects
    for delete to authenticated using (bucket_id = 'property-images' and public.is_admin());
