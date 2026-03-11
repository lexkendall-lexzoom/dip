-- DipDays core Supabase schema
-- Safe to run multiple times.

create extension if not exists "pgcrypto";

create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  name text,
  city text,
  country text,
  lat double precision,
  lng double precision,
  website text,
  description text,
  ritual_type text,
  status text default 'pending_review',
  created_at timestamptz default now()
);

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
