-- Alquileres — Schema Supabase
-- Ejecuta este SQL en Supabase > SQL Editor (proyecto nuevo o reutilizado).
--
-- Antes esta app vivía solo en localStorage del navegador: sin este esquema,
-- borrar el navegador o cambiar de equipo borraba todas las reservas, cobros
-- y reparaciones. Esto centraliza los datos en Supabase para que persistan y
-- se compartan entre dispositivos.

create table if not exists apartments (
  id text primary key,
  name text not null,
  bedrooms integer not null,
  type text not null check (type in ('1BR','2BR','2BR_ATICO','3BR')),
  active boolean not null default true,
  notes text
);

create table if not exists prices (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  season text not null check (season in ('VERANO','INVIERNO')),
  apartment_type text not null check (apartment_type in ('1BR','2BR','2BR_ATICO','3BR')),
  price_1week numeric not null default 0,
  price_2weeks numeric not null default 0,
  price_3weeks numeric not null default 0,
  price_1month numeric not null default 0,
  cleaning_fee numeric not null default 0
);

create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  apartment_id text not null references apartments(id),
  guest_name text,
  check_in date not null,
  check_out date not null,
  nights integer not null,
  stay_type text not null check (stay_type in ('1semana','2semanas','3semanas','1mes','directo','otro')),
  channel text not null check (channel in ('directo','inmobiliaria','booking','web')),
  base_price numeric not null default 0,
  cleaning_fee numeric not null default 0,
  discount_pct numeric not null default 0,
  total numeric not null default 0,
  status text not null default 'confirmada' check (status in ('confirmada','cancelada','completada')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id) on delete cascade,
  amount numeric not null default 0,
  payment_date date,
  entry_number text,
  received boolean not null default false,
  payment_method text check (payment_method in ('efectivo','transferencia','otro')),
  created_at timestamptz not null default now()
);

create table if not exists repairs (
  id uuid primary key default gen_random_uuid(),
  apartment_id text not null references apartments(id),
  repair_date date,
  item text not null,
  supplier text,
  document text,
  amount numeric,
  entry_number text,
  created_at timestamptz not null default now()
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  apartment_id text not null references apartments(id),
  expense_date date,
  expense_type text not null check (expense_type in ('lavanderia','limpieza','luz','agua','impuestos','otro')),
  description text not null,
  supplier text,
  amount numeric not null default 0,
  entry_number text,
  created_at timestamptz not null default now()
);

create table if not exists offer_prices (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  month integer not null,
  apartment_type text not null check (apartment_type in ('1BR','2BR','2BR_ATICO','3BR')),
  price_1week numeric not null default 0,
  price_2weeks numeric not null default 0,
  price_3weeks numeric not null default 0,
  price_1month numeric not null default 0,
  cleaning_fee numeric not null default 0,
  label text not null
);

-- Marca de qué "seeds" (datos de arranque/migración) ya se han aplicado,
-- para no duplicarlos si varios dispositivos abren la app antes de que
-- todos compartan los mismos datos.
create table if not exists seed_flags (
  key text primary key,
  applied_at timestamptz not null default now()
);

-- RLS: activado pero con política abierta, porque hoy alquileres/ no tiene
-- ningún login (a diferencia de joe-app, que es de un solo uso personal, o
-- de Index.html, que al menos tiene un login aunque sea débil). Con la clave
-- pública (anon) cualquiera que la vea en el código fuente puede leer/escribir
-- estas tablas mientras no haya autenticación real delante — mismo tipo de
-- riesgo que P1-1/P1-2 en .claude/rax/DEUDA_TECNICA.md, documentado ahí como
-- pendiente. Dejar RLS activado (aunque con política abierta) permite
-- endurecer las políticas más adelante sin tener que activar RLS desde cero.
alter table apartments enable row level security;
alter table prices enable row level security;
alter table reservations enable row level security;
alter table payments enable row level security;
alter table repairs enable row level security;
alter table expenses enable row level security;
alter table offer_prices enable row level security;
alter table seed_flags enable row level security;

create policy "anon_all_apartments" on apartments for all to anon using (true) with check (true);
create policy "anon_all_prices" on prices for all to anon using (true) with check (true);
create policy "anon_all_reservations" on reservations for all to anon using (true) with check (true);
create policy "anon_all_payments" on payments for all to anon using (true) with check (true);
create policy "anon_all_repairs" on repairs for all to anon using (true) with check (true);
create policy "anon_all_expenses" on expenses for all to anon using (true) with check (true);
create policy "anon_all_offer_prices" on offer_prices for all to anon using (true) with check (true);
create policy "anon_all_seed_flags" on seed_flags for all to anon using (true) with check (true);

grant select, insert, update, delete on table apartments to anon;
grant select, insert, update, delete on table prices to anon;
grant select, insert, update, delete on table reservations to anon;
grant select, insert, update, delete on table payments to anon;
grant select, insert, update, delete on table repairs to anon;
grant select, insert, update, delete on table expenses to anon;
grant select, insert, update, delete on table offer_prices to anon;
grant select, insert, update, delete on table seed_flags to anon;
