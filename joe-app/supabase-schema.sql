-- Joe's App — Schema Supabase
-- Ejecuta este SQL en Supabase > SQL Editor

-- Eventos del calendario
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  start_time timestamptz not null,
  end_time timestamptz,
  category text not null default 'personal',
  location text,
  reminder_minutes integer default 30,
  is_all_day boolean default false,
  recurrence text,
  created_at timestamptz default now()
);

-- Turnos hospital
create table if not exists hospital_shifts (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  shift_type text not null check (shift_type in ('morning','afternoon','night','free')),
  location text not null default '',
  notes text,
  created_at timestamptz default now()
);

-- Registros de Limón
create table if not exists limon_records (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('vet','food','medication','note','weight')),
  title text not null,
  description text,
  date date not null,
  next_date date,
  value text,
  created_at timestamptz default now()
);

-- Playlists Spotify
create table if not exists spotify_playlists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  spotify_uri text not null,
  embed_url text not null,
  created_at timestamptz default now()
);

-- Tareas empresa
create table if not exists business_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  due_date date,
  priority text not null default 'medium' check (priority in ('high','medium','low')),
  done boolean default false,
  created_at timestamptz default now()
);

-- RLS (Row Level Security) — desactivado para uso personal, una sola usuaria
alter table events disable row level security;
alter table hospital_shifts disable row level security;
alter table limon_records disable row level security;
alter table spotify_playlists disable row level security;
alter table business_tasks disable row level security;
