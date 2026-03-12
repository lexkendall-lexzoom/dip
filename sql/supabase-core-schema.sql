-- DipDays core Supabase schema
-- Safe to run multiple times.

create extension if not exists "pgcrypto";

create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  name text,
  city text,
  state text,
  country text,
  lat double precision,
  lng double precision,
  website text,
  description text,
  venue_type text,
  ritual_type text,
  categories text[] default '{}'::text[],
  features text[] default '{}'::text[],
  primary_category text,
  search_facets jsonb default '{}'::jsonb,
  search_tags text[] default '{}'::text[],
  status text default 'pending_review',
  created_at timestamptz default now()
);

alter table public.venues add column if not exists slug text;
alter table public.venues add column if not exists state text;
alter table public.venues add column if not exists venue_type text;
alter table public.venues add column if not exists categories text[] default '{}'::text[];
alter table public.venues add column if not exists features text[] default '{}'::text[];
alter table public.venues add column if not exists primary_category text;
alter table public.venues add column if not exists search_facets jsonb default '{}'::jsonb;
alter table public.venues add column if not exists search_tags text[] default '{}'::text[];

create table if not exists public.facilities (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references public.venues(id) on delete cascade,
  sauna_count integer,
  cold_plunge boolean,
  steam_room boolean,
  pool boolean,
  treatments boolean
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references public.venues(id) on delete cascade,
  source text,
  rating double precision,
  text text,
  author text,
  created_at timestamptz
);

create table if not exists public.scores (
  venue_id uuid primary key references public.venues(id) on delete cascade,
  facilities_score double precision
);
