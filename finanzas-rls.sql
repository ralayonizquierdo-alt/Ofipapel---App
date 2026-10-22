-- ═══════════════════════════════════════════════════════════════════════════
-- Finanzas (Index.html) — cerrar el acceso a Supabase "App Bancos"
-- Proyecto: agjmciudnnginqybnogh          DT-23, `.claude/rax/DEUDA_TECNICA.md`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ─── Qué arregla ───────────────────────────────────────────────────────────
-- Hoy las tablas `registros` y `app_sync` tienen una política `allow_all` para
-- el rol `public` (`USING true WITH CHECK true`). RLS está activado pero no
-- restringe nada: comprobado en vivo el 2026-08-28, se leen los saldos
-- bancarios reales con solo la clave pública que va dentro de Index.html, y
-- también se puede escribir.
--
-- ─── ANTES DE EJECUTAR ESTO: cerrar el alta de usuarios ────────────────────
-- Este script exige `authenticated`, es decir "tener sesión". Eso solo protege
-- de verdad si nadie puede crearse una sesión por su cuenta. Comprobado en
-- vivo: hoy el alta está ABIERTA y auto-confirmada — cualquiera puede
-- registrarse con un correo `@ofipapel.internal` inventado y quedar
-- `authenticated` al instante. Si se ejecuta este script sin cerrar antes el
-- alta, no se gana absolutamente nada.
--
--   Supabase → Authentication → Sign In / Providers → Email
--   → "Allow new users to sign up"  →  DESACTIVAR
--
-- Desactivarlo no afecta a las cuentas que ya existen: siguen entrando igual.
-- Solo impide que se creen cuentas nuevas desde fuera. Las altas legítimas se
-- siguen haciendo desde el panel de gestión de usuarios de la propia app
-- (netlify/functions/admin-users.js, que usa la service-role key y no pasa por
-- aquí) o desde el panel de Supabase.
--
-- (El registro anónimo ya está desactivado en este proyecto — comprobado:
--  `anonymous_provider_disabled`. Es la diferencia con Firebase, donde estaba
--  abierto y por eso `auth != null` no protegía nada.)
--
-- ─── Por qué es seguro para la app ─────────────────────────────────────────
-- Verificado leyendo el código: `initSupabase()` solo se llama desde
-- `_completeLogin()`, así que Index.html no hace NI UNA petición a Supabase
-- antes de iniciar sesión. No hay ninguna lectura previa que se pueda quedar
-- sin permisos, que es justo lo que rompió la pantalla de fichar (DT-29).
--
-- ─── Cómo ejecutarlo ───────────────────────────────────────────────────────
-- Supabase → SQL Editor → pegar todo → Run.
-- Es idempotente: se puede ejecutar varias veces sin efecto añadido.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. RLS activado en las dos tablas de la app ────────────────────────────
alter table public.registros enable row level security;
alter table public.app_sync  enable row level security;

-- ── 2. Fuera las políticas viejas ──────────────────────────────────────────
-- Se borran TODAS las políticas existentes de estas dos tablas en vez de
-- nombrar `allow_all` a mano: así el resultado es el mismo se llame como se
-- llame la política que hay puesta hoy, y no queda ninguna suelta que vuelva
-- a abrir la puerta más adelante.
do $$
declare pol record;
begin
  for pol in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public' and tablename in ('registros', 'app_sync')
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- ── 3. Una política por tabla, solo para sesiones reales ───────────────────
-- `to authenticated` (no `to public`): el rol `anon`, que es el que lleva la
-- clave pública de Index.html cuando nadie ha iniciado sesión, queda fuera.
create policy "authenticated_all_registros" on public.registros
  for all to authenticated using (true) with check (true);

create policy "authenticated_all_app_sync" on public.app_sync
  for all to authenticated using (true) with check (true);

-- ── 4. Permisos de tabla ───────────────────────────────────────────────────
-- RLS y los GRANT son dos puertas independientes: hacen falta las dos. Sin
-- esto, `anon` conservaría el permiso de tabla aunque ninguna política le
-- dejara pasar — inofensivo hoy, pero es la trampa que ya apareció en
-- joe-app (DT-24).
revoke all on public.registros from anon;
revoke all on public.app_sync  from anon;
grant select, insert, update, delete on public.registros to authenticated;
grant select, insert, update, delete on public.app_sync  to authenticated;

-- ── 5. Comprobación ────────────────────────────────────────────────────────
-- Debe devolver exactamente dos filas, ambas con roles = {authenticated}.
select tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public' and tablename in ('registros', 'app_sync')
order by tablename;

-- ¿Hay más tablas en este proyecto además de estas dos? Si esta consulta
-- devuelve algo más, avísame: habría que revisarlas igual.
select table_name
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by table_name;
