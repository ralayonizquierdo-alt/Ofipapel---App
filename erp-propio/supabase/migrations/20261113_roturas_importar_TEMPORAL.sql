-- TEMPORAL · Gestor de Roturas, FASE 6: traer los expedientes de la app antigua (RAX-OS, Firebase).
-- Rober, 12/11/2026: la herramienta de importar se usa UNA vez y después se quita entera. Al terminar la
-- migración hay que BORRAR: estas dos funciones, la función del servidor «rotura-importar-archivo» y
-- la pantalla src/pages/compras/roturas/ImportarRoturasPage.tsx (ver docs/ROTURAS.md, fase 6).
-- La columna rotura_documento.origen_ruta SÍ se queda: dice de dónde vino cada adjunto.

alter table public.rotura_documento add column if not exists origen_ruta text;
create unique index if not exists rotura_documento_origen_ruta_uidx on public.rotura_documento (origen_ruta) where origen_ruta is not null;

/** Estado de la app antigua (16) → estado del ERP (10). */
create or replace function roturas_privado.estado_desde_origen(p_estado text, p_tipo_cuadre text) returns text
language sql immutable as $$
  select case p_estado
    when 'EN_ESTUDIO' then 'PENDIENTE'
    when 'RETIRADO_POR_PROVEEDOR' then 'SEPARADO_PROVEEDOR'
    when 'A_ESPERA_DE_ABONO' then 'SEPARADO_PROVEEDOR'
    when 'PROVEEDOR_ENVIA_RECAMBIO' then 'PENDIENTE'
    when 'A_ESPERA_DE_RECAMBIO' then 'PENDIENTE'
    when 'CERRADO' then case when p_tipo_cuadre = 'ABONO' then 'ABONADO' else 'DESTRUIDO' end
    else p_estado end
$$;

/**
 * Trae UN expediente antiguo con su historial. Solo administradores. Se puede repetir sin duplicar
 * (origen_id). No mueve stock: el stock llega con la migración de GeminisWin.
 * p = { origen_id, numero, fecha, estado, articulo_codigo, articulo_referencia, articulo_descripcion,
 *       proveedor_codigo, almacen_codigo, cantidad, motivo, descripcion, origen_rotura, procedencia,
 *       empleado_entrega, fecha_compra, importe_estimado, observaciones, reclamacion_enviada_en,
 *       tipo_cuadre, compensacion_observaciones, creado_offline, anulado_en, anulado_motivo,
 *       creado_por, creado_en, historial: [{ estado_anterior, estado_nuevo, quien, observaciones, en }] }
 */
create or replace function public.fn_rotura_importar(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_origen text := nullif(btrim(p ->> 'origen_id'), '');
  v_tipo text := nullif(p ->> 'tipo_cuadre', '');
  v_estado text; v_id bigint; h jsonb; v_ant text; v_nue text;
begin
  if not public.fn_es_administrador() then raise exception 'Solo un administrador puede importar expedientes.' using errcode = '42501'; end if;
  if v_origen is null then raise exception 'Falta el identificador de origen.' using errcode = '22023'; end if;
  select id into v_id from public.rotura_expediente where origen_id = v_origen;
  if found then return jsonb_build_object('id', v_id, 'nuevo', false); end if;

  v_estado := roturas_privado.estado_desde_origen(p ->> 'estado', v_tipo);
  if not exists (select 1 from public.rotura_estado where codigo = v_estado) then raise exception 'Estado desconocido: %', p ->> 'estado' using errcode = '22023'; end if;
  if not exists (select 1 from public.articulo where codigo_interno = p ->> 'articulo_codigo') then raise exception 'El artículo % no existe en el ERP.', p ->> 'articulo_codigo' using errcode = '22023'; end if;
  if not exists (select 1 from public.proveedor where codigo = p ->> 'proveedor_codigo') then raise exception 'El proveedor % no existe en el ERP.', p ->> 'proveedor_codigo' using errcode = '22023'; end if;

  insert into public.rotura_expediente (
    numero, fecha, estado, articulo_codigo, articulo_referencia, articulo_descripcion, proveedor_codigo, almacen_codigo,
    cantidad, motivo, descripcion, origen_rotura, procedencia, empleado_entrega, fecha_compra, importe_estimado, observaciones,
    reclamacion_enviada_en, tipo_cuadre, compensacion_observaciones, pendiente_contabilizar, creado_offline,
    anulado_en, anulado_motivo, origen_id, estado_origen, creado_por, creado_en)
  values (
    p ->> 'numero', coalesce(nullif(p ->> 'fecha', '')::date, current_date), v_estado, p ->> 'articulo_codigo',
    nullif(btrim(p ->> 'articulo_referencia'), ''), coalesce(nullif(btrim(p ->> 'articulo_descripcion'), ''), p ->> 'articulo_codigo'),
    p ->> 'proveedor_codigo', coalesce(nullif(btrim(p ->> 'almacen_codigo'), ''), roturas_privado.almacen_venta()),
    (p ->> 'cantidad')::numeric, coalesce(nullif(btrim(p ->> 'motivo'), ''), 'Sin motivo'), nullif(btrim(p ->> 'descripcion'), ''),
    coalesce(nullif(upper(p ->> 'origen_rotura'), ''), 'ALMACEN'), nullif(btrim(p ->> 'procedencia'), ''), nullif(btrim(p ->> 'empleado_entrega'), ''),
    nullif(p ->> 'fecha_compra', '')::date, nullif(p ->> 'importe_estimado', '')::numeric, nullif(btrim(p ->> 'observaciones'), ''),
    nullif(p ->> 'reclamacion_enviada_en', '')::timestamptz, v_tipo, nullif(btrim(p ->> 'compensacion_observaciones'), ''),
    false, coalesce((p ->> 'creado_offline')::boolean, false),
    nullif(p ->> 'anulado_en', '')::timestamptz, nullif(btrim(p ->> 'anulado_motivo'), ''), v_origen, p ->> 'estado',
    nullif(btrim(p ->> 'creado_por'), ''), coalesce(nullif(p ->> 'creado_en', '')::timestamptz, now()))
  returning id into v_id;

  if jsonb_typeof(p -> 'historial') = 'array' then
    for h in select * from jsonb_array_elements(p -> 'historial') loop
      v_ant := roturas_privado.estado_desde_origen(h ->> 'estado_anterior', v_tipo);
      v_nue := roturas_privado.estado_desde_origen(h ->> 'estado_nuevo', v_tipo);
      continue when v_nue is null or not exists (select 1 from public.rotura_estado where codigo = v_nue);
      insert into public.rotura_historial (expediente_id, estado_anterior, estado_nuevo, empleado_codigo, observaciones, en)
      values (v_id, case when exists (select 1 from public.rotura_estado where codigo = v_ant) then v_ant end, v_nue, nullif(left(btrim(h ->> 'quien'), 60), ''),
              nullif(btrim(concat_ws(' · ', nullif(btrim(h ->> 'observaciones'), ''),
                case when h ->> 'estado_nuevo' is distinct from v_nue then '(en la app antigua: ' || (h ->> 'estado_nuevo') || ')' end)), ''),
              coalesce(nullif(h ->> 'en', '')::timestamptz, now()));
    end loop;
  end if;
  return jsonb_build_object('id', v_id, 'nuevo', true);
end $$;

/** Al terminar: deja el contador de cada año en el último número de la app antigua, para seguir desde ahí. */
create or replace function public.fn_rotura_importar_fin() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; v jsonb := '{}';
begin
  if not public.fn_es_administrador() then raise exception 'Solo un administrador.' using errcode = '42501'; end if;
  for r in select substring(numero from 'EXP-(\d{4})-')::int anio, max(substring(numero from 'EXP-\d{4}-(\d+)')::int) ultimo
           from public.rotura_expediente where origen_id is not null and numero ~ '^EXP-\d{4}-\d+$' group by 1 loop
    insert into public.rotura_contador (anio, ultimo) values (r.anio, r.ultimo)
    on conflict (anio) do update set ultimo = excluded.ultimo;
    v := v || jsonb_build_object(r.anio::text, r.ultimo);
  end loop;
  return v;
end $$;

revoke execute on function public.fn_rotura_importar(jsonb), public.fn_rotura_importar_fin() from public, anon;
grant execute on function public.fn_rotura_importar(jsonb), public.fn_rotura_importar_fin() to authenticated, service_role;
revoke execute on function roturas_privado.estado_desde_origen(text, text) from public, anon, authenticated;
