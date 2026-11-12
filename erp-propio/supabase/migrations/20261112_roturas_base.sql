-- Gestor de Roturas · FASE 1: base (tarea 32). Sustituye a la app RAX-OS «Devoluciones y Roturas».
--
-- Mercancía rota o dañada que se reclama al proveedor: Almacén registra la «petición de abono»,
-- Compras decide (reclamar o destruir), el proveedor abona / compensa con género / rechaza, y
-- Almacén confirma la destrucción. Decisiones de Rober (11-12/11/2026):
--   · 10 estados (antes 16). Recambio = compensación con género (un solo camino).
--   · El ERP hace él mismo la baja del Almacén 06 y el traspaso 06→04: nadie teclea números de
--     traspaso ni se manda Excel ni correo a Gerencia.
--   · Los abonos quedan «pendientes de contabilizar» (la contabilidad se sustituirá por CONTANET).
--
-- Esta fase crea las tablas, el historial inmutable y la máquina de estados. Los pasos que mueven
-- stock (cuadre de abono/compensación, «abonado» y destrucción) están marcados «solo_proceso»:
-- el cambio de estado genérico los rechaza hasta que existan sus funciones propias (fases 3 y 5).
--
-- Seguridad: nadie escribe en las tablas desde el navegador; todo pasa por funciones que
-- comprueban el permiso en el servidor. Tres permisos:
--   /gestor-roturas       Compras → Gestor de Roturas (decidir, reclamar, cuadrar, anular)
--   /roturas-peticion     Almacén → Petición de Abono (registrar la rotura)
--   /roturas-destruccion  Almacén → Confirmar Destrucción

create schema if not exists roturas_privado;
revoke all on schema roturas_privado from public, anon, authenticated;

-- ---------------------------------------------------------------- Permisos
insert into public.permiso (codigo, descripcion, modulo, tipo, orden) values
  ('/gestor-roturas', 'Gestor de Roturas (reclamaciones a proveedores)', 'Compras', 'menu', 96),
  ('/roturas-peticion', 'Petición de Abono (registrar una rotura)', 'Almacén', 'menu', 97),
  ('/roturas-destruccion', 'Confirmar Destrucción de roturas', 'Almacén', 'menu', 98)
on conflict (codigo) do nothing;
insert into public.rol_permiso (rol_id, permiso_codigo)
select r.id, p.c from public.rol r, (values ('/gestor-roturas'), ('/roturas-peticion'), ('/roturas-destruccion')) p(c)
 where r.codigo = 'GERENCIA'
on conflict do nothing;

-- ---------------------------------------------------------------- Estados y transiciones
create table if not exists public.rotura_estado (
  codigo text primary key,
  nombre text not null,
  orden integer not null,
  final boolean not null default false,
  color text not null
);
insert into public.rotura_estado (codigo, nombre, orden, final, color) values
  ('PENDIENTE_COMPRAS',   'Pendiente de Compras',        10, false, '#c8641a'),
  ('ABONO_PROVEEDOR',     'Reclamado al proveedor',      20, false, '#1d3a8a'),
  ('SEPARADO_PROVEEDOR',  'Separado para el proveedor',  30, false, '#7b3fb0'),
  ('PENDIENTE',           'Pendiente de respuesta',      40, false, '#8a5a00'),
  ('RECHAZADO',           'Rechazado por el proveedor',  50, false, '#c42b1c'),
  ('OBSOLETO_DESTRUIR',   'Obsoleto: destruir',          60, false, '#6d6d6d'),
  ('ABONADO_DESTRUIR',    'Abonado: destruir',           70, false, '#237523'),
  ('COMPENSADO_DESTRUIR', 'Compensado: destruir',        80, false, '#0f766e'),
  ('ABONADO',             'Abonado (retirado)',          90, true,  '#237523'),
  ('DESTRUIDO',           'Destruido',                  100, true,  '#333333')
on conflict (codigo) do nothing;

create table if not exists public.rotura_transicion (
  origen text not null references public.rotura_estado (codigo),
  destino text not null references public.rotura_estado (codigo),
  permiso text not null references public.permiso (codigo),
  -- true = este paso mueve stock o documentos: solo lo hace su función propia, no el cambio genérico.
  solo_proceso boolean not null default false,
  primary key (origen, destino)
);
insert into public.rotura_transicion (origen, destino, permiso, solo_proceso) values
  ('PENDIENTE_COMPRAS',   'ABONO_PROVEEDOR',     '/gestor-roturas', false),
  ('PENDIENTE_COMPRAS',   'SEPARADO_PROVEEDOR',  '/gestor-roturas', false),
  ('PENDIENTE_COMPRAS',   'OBSOLETO_DESTRUIR',   '/gestor-roturas', false),
  ('ABONO_PROVEEDOR',     'SEPARADO_PROVEEDOR',  '/gestor-roturas', false),
  ('ABONO_PROVEEDOR',     'PENDIENTE',           '/gestor-roturas', false),
  ('ABONO_PROVEEDOR',     'RECHAZADO',           '/gestor-roturas', false),
  ('ABONO_PROVEEDOR',     'ABONADO',             '/gestor-roturas', true),
  ('ABONO_PROVEEDOR',     'ABONADO_DESTRUIR',    '/gestor-roturas', true),
  ('ABONO_PROVEEDOR',     'COMPENSADO_DESTRUIR', '/gestor-roturas', true),
  ('SEPARADO_PROVEEDOR',  'PENDIENTE',           '/gestor-roturas', false),
  ('SEPARADO_PROVEEDOR',  'RECHAZADO',           '/gestor-roturas', false),
  ('SEPARADO_PROVEEDOR',  'ABONADO',             '/gestor-roturas', true),
  ('SEPARADO_PROVEEDOR',  'ABONADO_DESTRUIR',    '/gestor-roturas', true),
  ('SEPARADO_PROVEEDOR',  'COMPENSADO_DESTRUIR', '/gestor-roturas', true),
  ('PENDIENTE',           'SEPARADO_PROVEEDOR',  '/gestor-roturas', false),
  ('PENDIENTE',           'RECHAZADO',           '/gestor-roturas', false),
  ('PENDIENTE',           'ABONADO',             '/gestor-roturas', true),
  ('PENDIENTE',           'ABONADO_DESTRUIR',    '/gestor-roturas', true),
  ('PENDIENTE',           'COMPENSADO_DESTRUIR', '/gestor-roturas', true),
  -- Lección de RAX-OS: ningún estado «ya resuelto» se queda sin salida hacia la destrucción.
  ('RECHAZADO',           'OBSOLETO_DESTRUIR',   '/gestor-roturas', false),
  ('RECHAZADO',           'DESTRUIDO',           '/roturas-destruccion', true),
  ('OBSOLETO_DESTRUIR',   'DESTRUIDO',           '/roturas-destruccion', true),
  ('ABONADO_DESTRUIR',    'DESTRUIDO',           '/roturas-destruccion', true),
  ('COMPENSADO_DESTRUIR', 'DESTRUIDO',           '/roturas-destruccion', true)
on conflict (origen, destino) do nothing;

-- ---------------------------------------------------------------- Expedientes
create table if not exists public.rotura_contador (
  anio integer primary key,
  ultimo integer not null default 0
);

create table if not exists public.rotura_expediente (
  id bigint generated always as identity primary key,
  numero text not null unique,                       -- EXP-2026-000123 (mismo formato que RAX-OS)
  fecha date not null default current_date,
  estado text not null default 'PENDIENTE_COMPRAS' references public.rotura_estado (codigo),
  articulo_codigo text not null references public.articulo (codigo_interno),
  articulo_referencia text,                          -- referencia del proveedor, tal como estaba al registrar
  articulo_descripcion text not null,                -- descripción tal como estaba al registrar
  proveedor_codigo text not null references public.proveedor (codigo),
  almacen_codigo text not null references public.almacen (codigo),  -- dónde está físicamente
  cantidad numeric(14, 3) not null check (cantidad > 0),
  motivo text not null,
  descripcion text,                                  -- detalle del desperfecto
  origen_rotura text not null check (origen_rotura in ('REPARTO', 'PROVEEDOR', 'TIENDA', 'ALMACEN')),
  procedencia text,
  empleado_solicitante_codigo text references public.empleado (codigo),
  empleado_entrega text,                             -- quien entrega la mercancía rota (puede no tener usuario)
  fecha_compra date,
  importe_estimado numeric(14, 2),
  observaciones text,
  reclamacion_enviada_en timestamptz,
  -- Cuadre del documento del proveedor (fase 5)
  tipo_cuadre text check (tipo_cuadre in ('ABONO', 'COMPENSACION_GENERO')),
  lote_cuadre bigint,
  compensacion_observaciones text,
  pendiente_contabilizar boolean not null default false,
  -- Registro sin cobertura (móvil de Almacén)
  creado_offline boolean not null default false,
  sincronizado_en timestamptz,
  clave_cliente uuid unique,                         -- evita duplicados si el móvil reenvía la misma rotura
  -- Borrado lógico: un expediente nunca se borra
  anulado_en timestamptz,
  anulado_motivo text,
  -- Migración desde RAX-OS (Firestore)
  origen_id text unique,
  estado_origen text,
  creado_por text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists rotura_expediente_estado_idx on public.rotura_expediente (estado) where anulado_en is null;
create index if not exists rotura_expediente_proveedor_idx on public.rotura_expediente (proveedor_codigo, estado);
create index if not exists rotura_expediente_articulo_idx on public.rotura_expediente (articulo_codigo);

create table if not exists public.rotura_historial (
  id bigint generated always as identity primary key,
  expediente_id bigint not null references public.rotura_expediente (id),
  estado_anterior text references public.rotura_estado (codigo),
  estado_nuevo text not null references public.rotura_estado (codigo),
  empleado_codigo text,
  observaciones text,
  en timestamptz not null default now()
);
create index if not exists rotura_historial_expediente_idx on public.rotura_historial (expediente_id, en);

create table if not exists public.rotura_documento (
  id bigint generated always as identity primary key,
  expediente_id bigint not null references public.rotura_expediente (id),
  tipo text not null check (tipo in ('FOTO', 'PDF', 'EMAIL', 'FACTURA', 'ALBARAN', 'EXCEL', 'ABONO', 'OTRO')),
  nombre text not null,
  ruta text not null,                                -- ruta dentro del almacenamiento privado (fase 2)
  creado_por text,
  creado_en timestamptz not null default now()
);
create index if not exists rotura_documento_expediente_idx on public.rotura_documento (expediente_id);

-- El historial no se toca nunca: ni cambios ni borrados.
create or replace function roturas_privado.historial_inmutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'El historial de un expediente de roturas no se puede modificar ni borrar.' using errcode = '42501';
end $$;
create or replace trigger trg_rotura_historial_inmutable before update or delete on public.rotura_historial
  for each row execute function roturas_privado.historial_inmutable();

-- Un expediente no se borra (se anula), y su número no cambia.
create or replace function roturas_privado.expediente_guardas() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un expediente de roturas no se borra: se anula.' using errcode = '42501';
  end if;
  if new.numero is distinct from old.numero then
    raise exception 'El número de un expediente no se puede cambiar.' using errcode = '42501';
  end if;
  new.actualizado_en := now();
  return new;
end $$;
create or replace trigger trg_rotura_expediente_guardas before update or delete on public.rotura_expediente
  for each row execute function roturas_privado.expediente_guardas();

-- ---------------------------------------------------------------- Seguridad por filas
alter table public.rotura_estado enable row level security;
alter table public.rotura_transicion enable row level security;
alter table public.rotura_contador enable row level security;       -- sin políticas: solo las funciones
alter table public.rotura_expediente enable row level security;
alter table public.rotura_historial enable row level security;
alter table public.rotura_documento enable row level security;

create or replace function public.fn_rotura_ve() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.fn_puede('/gestor-roturas') or public.fn_puede('/roturas-peticion') or public.fn_puede('/roturas-destruccion')
$$;

do $$
declare t text;
begin
  foreach t in array array['rotura_estado', 'rotura_transicion', 'rotura_expediente', 'rotura_historial', 'rotura_documento'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_lee') then
      execute format('create policy %I on public.%I for select to authenticated using (public.fn_rotura_ve())', t || '_lee', t);
    end if;
  end loop;
end $$;

-- Solo lectura desde el navegador: las altas y los cambios van por las funciones de abajo.
grant select on public.rotura_estado, public.rotura_transicion, public.rotura_expediente,
                public.rotura_historial, public.rotura_documento to authenticated;

create or replace trigger trg_auditoria_rotura_expediente after insert or update or delete on public.rotura_expediente
  for each row execute function public.fn_auditoria_trigger();
create or replace trigger trg_auditoria_rotura_historial after insert or update or delete on public.rotura_historial
  for each row execute function public.fn_auditoria_trigger();
create or replace trigger trg_auditoria_rotura_documento after insert or update or delete on public.rotura_documento
  for each row execute function public.fn_auditoria_trigger();

-- ---------------------------------------------------------------- Funciones
-- Número correlativo por año, sin huecos por carreras (bloquea la fila del año).
create or replace function roturas_privado.siguiente_numero() returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_anio integer := extract(year from current_date)::integer; v_n integer;
begin
  insert into public.rotura_contador (anio, ultimo) values (v_anio, 1)
  on conflict (anio) do update set ultimo = public.rotura_contador.ultimo + 1
  returning ultimo into v_n;
  return 'EXP-' || v_anio || '-' || lpad(v_n::text, 6, '0');
end $$;

/** Almacén registra una rotura (petición de abono). Devuelve { id, numero }. */
create or replace function public.fn_rotura_crear(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_quien text := public.fn_empleado_actual();
  v_art public.articulo;
  v_id bigint; v_numero text;
  v_clave uuid := nullif(p ->> 'clave_cliente', '')::uuid;
  v_cantidad numeric := nullif(p ->> 'cantidad', '')::numeric;
  v_proveedor text := nullif(btrim(p ->> 'proveedor_codigo'), '');
  v_almacen text := nullif(btrim(p ->> 'almacen_codigo'), '');
  v_origen text := upper(nullif(btrim(p ->> 'origen_rotura'), ''));
  v_motivo text := nullif(btrim(p ->> 'motivo'), '');
begin
  if not (public.fn_puede('/roturas-peticion') or public.fn_puede('/gestor-roturas')) then
    raise exception 'Sin permiso para registrar roturas.' using errcode = '42501';
  end if;
  -- El móvil sin cobertura puede reenviar la misma rotura: no se duplica.
  if v_clave is not null then
    select id, numero into v_id, v_numero from public.rotura_expediente where clave_cliente = v_clave;
    if found then return jsonb_build_object('id', v_id, 'numero', v_numero, 'repetido', true); end if;
  end if;
  select * into v_art from public.articulo where codigo_interno = nullif(btrim(p ->> 'articulo_codigo'), '');
  if not found then raise exception 'El artículo no existe.' using errcode = '22023'; end if;
  v_proveedor := coalesce(v_proveedor, v_art.proveedor_habitual_codigo);
  if v_proveedor is null or not exists (select 1 from public.proveedor where codigo = v_proveedor) then
    raise exception 'Falta el proveedor (o no existe).' using errcode = '22023';
  end if;
  if v_almacen is null or not exists (select 1 from public.almacen where codigo = v_almacen) then
    raise exception 'Falta el almacén donde está la mercancía (o no existe).' using errcode = '22023';
  end if;
  if v_cantidad is null or v_cantidad <= 0 then raise exception 'La cantidad tiene que ser mayor que cero.' using errcode = '22023'; end if;
  if v_motivo is null then raise exception 'Falta el motivo de la rotura.' using errcode = '22023'; end if;
  if v_origen is null or v_origen not in ('REPARTO', 'PROVEEDOR', 'TIENDA', 'ALMACEN') then
    raise exception 'Origen de la rotura no válido.' using errcode = '22023';
  end if;

  v_numero := roturas_privado.siguiente_numero();
  insert into public.rotura_expediente (
    numero, articulo_codigo, articulo_referencia, articulo_descripcion, proveedor_codigo, almacen_codigo, cantidad, motivo,
    descripcion, origen_rotura, procedencia, empleado_solicitante_codigo, empleado_entrega, fecha_compra, importe_estimado,
    observaciones, creado_offline, sincronizado_en, clave_cliente, creado_por
  ) values (
    v_numero, v_art.codigo_interno, nullif(btrim(p ->> 'articulo_referencia'), ''), coalesce(v_art.descripcion, v_art.codigo_interno),
    v_proveedor, v_almacen, v_cantidad, v_motivo,
    nullif(btrim(p ->> 'descripcion'), ''), v_origen, nullif(btrim(p ->> 'procedencia'), ''),
    coalesce(nullif(btrim(p ->> 'empleado_solicitante_codigo'), ''), v_quien), nullif(btrim(p ->> 'empleado_entrega'), ''),
    nullif(p ->> 'fecha_compra', '')::date, nullif(p ->> 'importe_estimado', '')::numeric,
    nullif(btrim(p ->> 'observaciones'), ''), coalesce((p ->> 'creado_offline')::boolean, false),
    case when coalesce((p ->> 'creado_offline')::boolean, false) then now() end, v_clave, v_quien
  ) returning id into v_id;
  insert into public.rotura_historial (expediente_id, estado_anterior, estado_nuevo, empleado_codigo, observaciones)
  values (v_id, null, 'PENDIENTE_COMPRAS', v_quien, 'Petición de abono registrada');
  return jsonb_build_object('id', v_id, 'numero', v_numero, 'repetido', false);
end $$;

/** Estados a los que el usuario puede mover un expediente desde su estado actual (para los botones). */
create or replace function public.fn_rotura_destinos(p_id bigint) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('estado', t.destino, 'nombre', e.nombre, 'solo_proceso', t.solo_proceso) order by e.orden), '[]'::jsonb)
    from public.rotura_expediente x
    join public.rotura_transicion t on t.origen = x.estado
    join public.rotura_estado e on e.codigo = t.destino
   where x.id = p_id and x.anulado_en is null and public.fn_rotura_ve() and public.fn_puede(t.permiso)
$$;

/** Cambio de estado SIN movimiento de stock. Valida la transición y el permiso en el servidor. */
create or replace function public.fn_rotura_cambiar_estado(p_id bigint, p_destino text, p_observaciones text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_x public.rotura_expediente; v_t public.rotura_transicion; v_quien text := public.fn_empleado_actual();
begin
  select * into v_x from public.rotura_expediente where id = p_id for update;
  if not found then raise exception 'El expediente no existe.' using errcode = '22023'; end if;
  if v_x.anulado_en is not null then raise exception 'El expediente está anulado.' using errcode = '22023'; end if;
  select * into v_t from public.rotura_transicion where origen = v_x.estado and destino = p_destino;
  if not found then
    raise exception 'No se puede pasar de «%» a «%».', v_x.estado, p_destino using errcode = '22023';
  end if;
  if not public.fn_puede(v_t.permiso) then raise exception 'Sin permiso para este cambio de estado.' using errcode = '42501'; end if;
  if v_t.solo_proceso then
    raise exception 'Este paso mueve stock o documentos: se hace desde su pantalla (cuadre, abonado o destrucción).' using errcode = '22023';
  end if;
  update public.rotura_expediente set estado = p_destino where id = p_id;
  insert into public.rotura_historial (expediente_id, estado_anterior, estado_nuevo, empleado_codigo, observaciones)
  values (p_id, v_x.estado, p_destino, v_quien, nullif(btrim(p_observaciones), ''));
  return jsonb_build_object('id', p_id, 'numero', v_x.numero, 'estado', p_destino);
end $$;

/** Anula un expediente (borrado lógico, con motivo). Solo Compras, y solo si no está en un estado final. */
create or replace function public.fn_rotura_anular(p_id bigint, p_motivo text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_x public.rotura_expediente; v_quien text := public.fn_empleado_actual();
begin
  if not public.fn_puede('/gestor-roturas') then raise exception 'Sin permiso para anular expedientes.' using errcode = '42501'; end if;
  if nullif(btrim(p_motivo), '') is null then raise exception 'Hay que indicar el motivo de la anulación.' using errcode = '22023'; end if;
  select * into v_x from public.rotura_expediente where id = p_id for update;
  if not found then raise exception 'El expediente no existe.' using errcode = '22023'; end if;
  if v_x.anulado_en is not null then raise exception 'El expediente ya está anulado.' using errcode = '22023'; end if;
  if exists (select 1 from public.rotura_estado where codigo = v_x.estado and final) or v_x.tipo_cuadre is not null then
    raise exception 'No se puede anular un expediente ya resuelto o cuadrado.' using errcode = '22023';
  end if;
  update public.rotura_expediente set anulado_en = now(), anulado_motivo = btrim(p_motivo) where id = p_id;
  insert into public.rotura_historial (expediente_id, estado_anterior, estado_nuevo, empleado_codigo, observaciones)
  values (p_id, v_x.estado, v_x.estado, v_quien, 'ANULADO: ' || btrim(p_motivo));
  return jsonb_build_object('id', p_id, 'numero', v_x.numero, 'anulado', true);
end $$;

-- Solo con sesión (lo nuevo ya nace cerrado a «anon» desde el hardening del 08/11).
revoke execute on function public.fn_rotura_ve(), public.fn_rotura_crear(jsonb), public.fn_rotura_destinos(bigint),
  public.fn_rotura_cambiar_estado(bigint, text, text), public.fn_rotura_anular(bigint, text) from public, anon;
grant execute on function public.fn_rotura_ve(), public.fn_rotura_crear(jsonb), public.fn_rotura_destinos(bigint),
  public.fn_rotura_cambiar_estado(bigint, text, text), public.fn_rotura_anular(bigint, text) to authenticated, service_role;
revoke execute on function roturas_privado.siguiente_numero() from public, anon, authenticated;

-- Defensa en profundidad: aunque RLS ya lo impide (no hay políticas de escritura), se quita también
-- el permiso de escritura directa. Todo cambio pasa por las funciones.
revoke insert, update, delete, truncate on public.rotura_estado, public.rotura_transicion, public.rotura_contador,
  public.rotura_expediente, public.rotura_historial, public.rotura_documento from authenticated, anon;
revoke all on public.rotura_contador from authenticated, anon;
