-- Gestor de Roturas · FASE 3 (base de datos): el stock lo mueve el ERP, solo (Rober, 12/11/2026).
--
--   Al REGISTRAR la rotura ........ traspaso del almacén donde estaba → Almacén 06 (roturas).
--   Al DESTRUIR un obsoleto/rechazado  baja del 06 (regularización).
--   Abono cuadrado / «Abonado» ..... baja del 06 (devolución a proveedor)        → fase 5
--   Compensación con género ........ traspaso 06 → 04 (entra el reemplazo)        → fase 5
--   Destruir un abonado/compensado . sin movimiento: el 06 ya se dio de baja al cuadrar.
--   ANULAR un expediente ........... se devuelve del 06 al almacén de donde salió.
--
-- Cada movimiento queda en movimiento_stock con origen «rotura» y el id del expediente, así que se
-- ve en los listados de movimientos y en la auditoría. No se crea un documento de traspaso aparte:
-- el propio expediente es el documento.

create or replace function roturas_privado.almacen_roturas() returns text language sql immutable as $$ select '06'::text $$;
create or replace function roturas_privado.almacen_venta() returns text language sql immutable as $$ select '04'::text $$;

/** Un apunte de stock de un expediente. p_sentido: 1 entra, -1 sale. */
create or replace function roturas_privado.mover(p_expediente bigint, p_almacen text, p_sentido integer, p_tipo text, p_observaciones text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_x public.rotura_expediente; v_coste numeric;
begin
  select * into v_x from public.rotura_expediente where id = p_expediente;
  select coalesce(nullif(a.precio_medio_compra, 0), nullif(a.coste_neto, 0)) into v_coste from public.articulo a where a.codigo_interno = v_x.articulo_codigo;
  insert into public.movimiento_stock (tipo_movimiento, sentido, almacen_codigo, articulo_codigo, cantidad, costo_unitario,
                                       documento_origen_tipo, documento_origen_numero, empleado_codigo, observaciones)
  values (p_tipo, p_sentido, p_almacen, v_x.articulo_codigo, v_x.cantidad, v_coste, 'rotura', p_expediente,
          public.fn_empleado_actual(), v_x.numero || ' · ' || p_observaciones);
end $$;

/** Traspaso entre dos almacenes: sale de uno y entra en el otro. */
create or replace function roturas_privado.traspasar(p_expediente bigint, p_origen text, p_destino text, p_observaciones text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_origen = p_destino then return; end if;
  perform roturas_privado.mover(p_expediente, p_origen, -1, 'traspaso', p_observaciones);
  perform roturas_privado.mover(p_expediente, p_destino, 1, 'traspaso', p_observaciones);
end $$;

-- Alta: igual que en la fase 1 y, además, pasa las unidades al Almacén 06.
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
    nullif(p ->> 'fecha_compra', '')::date,
    coalesce(nullif(p ->> 'importe_estimado', '')::numeric,
             round(v_cantidad * coalesce(nullif(v_art.precio_medio_compra, 0), nullif(v_art.coste_neto, 0)), 2)),
    nullif(btrim(p ->> 'observaciones'), ''), coalesce((p ->> 'creado_offline')::boolean, false),
    case when coalesce((p ->> 'creado_offline')::boolean, false) then now() end, v_clave, v_quien
  ) returning id into v_id;
  insert into public.rotura_historial (expediente_id, estado_anterior, estado_nuevo, empleado_codigo, observaciones)
  values (v_id, null, 'PENDIENTE_COMPRAS', v_quien, 'Petición de abono registrada');
  perform roturas_privado.traspasar(v_id, v_almacen, roturas_privado.almacen_roturas(), 'Rotura registrada: pasa al almacén de roturas');
  return jsonb_build_object('id', v_id, 'numero', v_numero, 'repetido', false);
end $$;

-- Anular: además de marcarlo, devuelve las unidades del 06 al almacén de donde salieron.
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
  -- Solo si en su día se movió al 06 (los migrados de RAX-OS no llevan movimiento propio).
  if exists (select 1 from public.movimiento_stock m where m.documento_origen_tipo = 'rotura' and m.documento_origen_numero = p_id) then
    perform roturas_privado.traspasar(p_id, roturas_privado.almacen_roturas(), v_x.almacen_codigo, 'Expediente anulado: vuelve a su almacén');
  end if;
  return jsonb_build_object('id', p_id, 'numero', v_x.numero, 'anulado', true);
end $$;

/** Almacén confirma la destrucción física de uno o varios expedientes. Devuelve cuántos y cuáles. */
create or replace function public.fn_rotura_destruir(p_ids bigint[], p_observaciones text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_x public.rotura_expediente; v_quien text := public.fn_empleado_actual(); v_hechos text[] := '{}';
begin
  if not public.fn_puede('/roturas-destruccion') then raise exception 'Sin permiso para confirmar destrucciones.' using errcode = '42501'; end if;
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'No has marcado ningún expediente.' using errcode = '22023'; end if;
  for v_x in select * from public.rotura_expediente where id = any (p_ids) order by id for update loop
    if v_x.anulado_en is not null then raise exception '% está anulado.', v_x.numero using errcode = '22023'; end if;
    if v_x.estado not in ('OBSOLETO_DESTRUIR', 'ABONADO_DESTRUIR', 'COMPENSADO_DESTRUIR', 'RECHAZADO') then
      raise exception '% no está pendiente de destruir (está en «%»).', v_x.numero, v_x.estado using errcode = '22023';
    end if;
    -- Obsoletos y rechazados siguen en el 06: se dan de baja ahora. Los abonados y compensados ya
    -- salieron del 06 al cuadrar el documento del proveedor.
    if v_x.estado in ('OBSOLETO_DESTRUIR', 'RECHAZADO')
       and exists (select 1 from public.movimiento_stock m where m.documento_origen_tipo = 'rotura' and m.documento_origen_numero = v_x.id) then
      perform roturas_privado.mover(v_x.id, roturas_privado.almacen_roturas(), -1, 'regularizacion', 'Destruido como obsoleto');
    end if;
    update public.rotura_expediente set estado = 'DESTRUIDO' where id = v_x.id;
    insert into public.rotura_historial (expediente_id, estado_anterior, estado_nuevo, empleado_codigo, observaciones)
    values (v_x.id, v_x.estado, 'DESTRUIDO', v_quien, coalesce(nullif(btrim(p_observaciones), ''), 'Destrucción confirmada por Almacén'));
    v_hechos := v_hechos || v_x.numero;
  end loop;
  if cardinality(v_hechos) <> cardinality(p_ids) then raise exception 'Alguno de los expedientes marcados no existe.' using errcode = '22023'; end if;
  return jsonb_build_object('destruidos', cardinality(v_hechos), 'numeros', to_jsonb(v_hechos));
end $$;

revoke execute on function public.fn_rotura_destruir(bigint[], text) from public, anon;
grant execute on function public.fn_rotura_destruir(bigint[], text) to authenticated, service_role;
revoke execute on function roturas_privado.mover(bigint, text, integer, text, text), roturas_privado.traspasar(bigint, text, text, text),
  roturas_privado.almacen_roturas(), roturas_privado.almacen_venta() from public, anon, authenticated;
