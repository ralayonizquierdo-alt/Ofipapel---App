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

-- Meu Coisinhas
create table if not exists coisinhas (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('nota','recordatorio','compra')),
  title text not null,
  content text,
  reminder_date date,
  done boolean default false,
  created_at timestamptz default now()
);

-- RLS (Row Level Security)
-- La app no tiene pantalla de login con usuario real: usa inicio de sesión
-- anónimo de Supabase (src/lib/supabase.ts abre una sesión anónima al
-- arrancar). Esto NO distingue entre personas, pero exige una sesión válida
-- — bloquea el acceso directo a la REST API usando solo la clave anon
-- pública (sin pasar por la app). Requiere activar "Allow anonymous
-- sign-ins" en Supabase > Authentication > Sign In / Providers.
alter table events enable row level security;
alter table hospital_shifts enable row level security;
alter table limon_records enable row level security;
alter table spotify_playlists enable row level security;
alter table business_tasks enable row level security;
alter table coisinhas enable row level security;

drop policy if exists "authenticated_all_events" on events;
create policy "authenticated_all_events" on events
  for all to authenticated using (true) with check (true);
drop policy if exists "authenticated_all_hospital_shifts" on hospital_shifts;
create policy "authenticated_all_hospital_shifts" on hospital_shifts
  for all to authenticated using (true) with check (true);
drop policy if exists "authenticated_all_limon_records" on limon_records;
create policy "authenticated_all_limon_records" on limon_records
  for all to authenticated using (true) with check (true);
drop policy if exists "authenticated_all_spotify_playlists" on spotify_playlists;
create policy "authenticated_all_spotify_playlists" on spotify_playlists
  for all to authenticated using (true) with check (true);
drop policy if exists "authenticated_all_business_tasks" on business_tasks;
create policy "authenticated_all_business_tasks" on business_tasks
  for all to authenticated using (true) with check (true);
drop policy if exists "authenticated_all_coisinhas" on coisinhas;
create policy "authenticated_all_coisinhas" on coisinhas
  for all to authenticated using (true) with check (true);

-- ACTUALIZACIÓN: añadir columnas para distinción hospital/centro de salud
-- Ejecuta esto en Supabase > SQL Editor si la tabla ya existía:
--   alter table hospital_shifts add column work_center text not null default 'hospital';
--   alter table hospital_shifts add column floor text;

-- ACTUALIZACIÓN: hora de alarma en recordatorios
-- Ejecuta cada línea por separado en Supabase > SQL Editor:
--   alter table limon_records add column if not exists next_time text;
--   alter table coisinhas add column if not exists reminder_time text;
--   alter table business_tasks add column if not exists due_time text;

-- Permisos: solo el rol authenticated (sesión anónima incluida) puede operar.
-- Se retira el acceso directo del rol anon.
revoke select, insert, update, delete on table events from anon;
revoke select, insert, update, delete on table hospital_shifts from anon;
revoke select, insert, update, delete on table limon_records from anon;
revoke select, insert, update, delete on table spotify_playlists from anon;
revoke select, insert, update, delete on table business_tasks from anon;
revoke select, insert, update, delete on table coisinhas from anon;

grant select, insert, update, delete on table events to authenticated;
grant select, insert, update, delete on table hospital_shifts to authenticated;
grant select, insert, update, delete on table limon_records to authenticated;
grant select, insert, update, delete on table spotify_playlists to authenticated;
grant select, insert, update, delete on table business_tasks to authenticated;
grant select, insert, update, delete on table coisinhas to authenticated;
