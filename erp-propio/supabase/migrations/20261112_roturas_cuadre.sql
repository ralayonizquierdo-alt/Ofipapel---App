-- Gestor de Roturas · FASE 5: cuadre del documento del proveedor (Rober, 12/11/2026).
--
-- El proveedor contesta con un abono (factura rectificativa) o reponiendo el género. Compras sube
-- ese PDF, la IA lo lee y propone a qué expediente corresponde cada línea (función del servidor
-- «rotura-cuadre-ia»), y una persona lo revisa y lo confirma. Al confirmar:
--
--   ABONO ................ baja del Almacén 06 (devolución a proveedor), factura de abono del
--                          proveedor en negativo y el expediente queda «pendiente de contabilizar».
--                          Si el proveedor se llevó la mercancía → ABONADO; si no → ABONADO_DESTRUIR.
--   COMPENSACION_GENERO .. traspaso 06 → 04 (entra el género de reemplazo) → COMPENSADO_DESTRUIR.
--
-- No se programa ningún asiento (la contabilidad se sustituirá por CONTANET) ni se manda correo.

alter table public.rotura_expediente add column if not exists importe_abonado numeric(14, 2);

create table if not exists public.rotura_cuadre (
  id bigint generated always as identity primary key,
  proveedor_codigo text not null,
  tipo text not null check (tipo in ('ABONO', 'COMPENSACION_GENERO')),
  documento_numero text,
  documento_fecha date,
  base numeric(14, 2),
  igic numeric(14, 2),
  total numeric(14, 2),
  pdf_ruta text,                         -- en el almacenamiento privado «roturas»
  factura_tienda text,                   -- factura de abono creada (solo ABONO)
  factura_id bigint,
  lectura_ia jsonb,                      -- lo que leyó la IA, tal cual, para poder revisarlo después
  observaciones text,
  creado_por text,
  creado_en timestamptz not null default now()
);
alter table public.rotura_cuadre enable row level security;
revoke all on public.rotura_cuadre from anon, authenticated;
grant select on public.rotura_cuadre to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rotura_cuadre' and policyname = 'rotura_cuadre_lee') then
    create policy rotura_cuadre_lee on public.rotura_cuadre for select to authenticated using (public.fn_rotura_ve());
  end if;
end $$;
create or replace trigger trg_auditoria_rotura_cuadre after insert or update or delete on public.rotura_cuadre
  for each row execute function public.fn_auditoria_trigger();

/**
 * Confirma un cuadre. p = { tipo, proveedor_codigo, documento_numero, documento_fecha, base, igic, total,
 *   pdf_ruta, pdf_nombre, lectura_ia, observaciones, tienda,
 *   lineas: [{ expediente_id, importe, retirado }] }
 * Todo o nada: si una línea falla no se guarda nada.
 */
create or replace function public.fn_rotura_cuadrar(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_quien text := public.fn_empleado_actual();
  v_tipo text := upper(nullif(btrim(p ->> 'tipo'), ''));
  v_proveedor text := nullif(btrim(p ->> 'proveedor_codigo'), '');
  v_doc text := nullif(btrim(p ->> 'documento_numero'), '');
  v_fecha date := nullif(p ->> 'documento_fecha', '')::date;
  v_base numeric := abs(coalesce(nullif(p ->> 'base', '')::numeric, 0));
  v_igic numeric := abs(coalesce(nullif(p ->> 'igic', '')::numeric, 0));
  v_total numeric := abs(coalesce(nullif(p ->> 'total', '')::numeric, 0));
  v_ruta text := nullif(btrim(p ->> 'pdf_ruta'), '');
  v_tienda text := coalesce(nullif(btrim(p ->> 'tienda'), ''), '01');
  v_cuadre bigint; v_factura bigint; v_linea jsonb; v_x public.rotura_expediente;
  v_destino text; v_importe numeric; v_suma numeric := 0; v_numeros text[] := '{}'; v_primero bigint;
  v_ids bigint[] := '{}';
begin
  if not public.fn_puede('/gestor-roturas') then raise exception 'Sin permiso para cuadrar abonos.' using errcode = '42501'; end if;
  if v_tipo is null or v_tipo not in ('ABONO', 'COMPENSACION_GENERO') then raise exception 'Indica si es un abono o una compensación con género.' using errcode = '22023'; end if;
  if v_proveedor is null then raise exception 'Falta el proveedor.' using errcode = '22023'; end if;
  if jsonb_typeof(p -> 'lineas') <> 'array' or jsonb_array_length(p -> 'lineas') = 0 then raise exception 'No has elegido ningún expediente.' using errcode = '22023'; end if;
  if v_tipo = 'ABONO' and v_doc is null then raise exception 'Falta el número del abono del proveedor.' using errcode = '22023'; end if;
  if v_tipo = 'ABONO' and v_total = 0 then raise exception 'Falta el total del abono.' using errcode = '22023'; end if;
  if v_tipo = 'ABONO' and v_base = 0 then v_base := v_total - v_igic; end if;

  select min((l ->> 'expediente_id')::bigint) into v_primero from jsonb_array_elements(p -> 'lineas') l;
  if v_ruta is not null and not exists (select 1 from storage.objects o where o.bucket_id = 'roturas' and o.name = v_ruta and (storage.foldername(o.name))[1] = v_primero::text) then
    raise exception 'El PDF del proveedor no está guardado donde debe.' using errcode = '22023';
  end if;

  insert into public.rotura_cuadre (proveedor_codigo, tipo, documento_numero, documento_fecha, base, igic, total, pdf_ruta, lectura_ia, observaciones, creado_por)
  values (v_proveedor, v_tipo, v_doc, v_fecha, nullif(v_base, 0), nullif(v_igic, 0), nullif(v_total, 0), v_ruta, p -> 'lectura_ia', nullif(btrim(p ->> 'observaciones'), ''), v_quien)
  returning id into v_cuadre;

  for v_linea in select * from jsonb_array_elements(p -> 'lineas') loop
    select * into v_x from public.rotura_expediente where id = (v_linea ->> 'expediente_id')::bigint for update;
    if not found then raise exception 'Uno de los expedientes no existe.' using errcode = '22023'; end if;
    if v_x.id = any (v_ids) then raise exception '% está dos veces en el cuadre.', v_x.numero using errcode = '22023'; end if;
    v_ids := v_ids || v_x.id;
    if v_x.anulado_en is not null then raise exception '% está anulado.', v_x.numero using errcode = '22023'; end if;
    if v_x.proveedor_codigo <> v_proveedor then raise exception '% es de otro proveedor.', v_x.numero using errcode = '22023'; end if;
    if v_x.tipo_cuadre is not null then raise exception '% ya está cuadrado.', v_x.numero using errcode = '22023'; end if;
    v_destino := case when v_tipo = 'COMPENSACION_GENERO' then 'COMPENSADO_DESTRUIR'
                      when coalesce((v_linea ->> 'retirado')::boolean, false) then 'ABONADO' else 'ABONADO_DESTRUIR' end;
    if not exists (select 1 from public.rotura_transicion t where t.origen = v_x.estado and t.destino = v_destino) then
      raise exception '% está en «%» y desde ahí no se puede cuadrar.', v_x.numero, v_x.estado using errcode = '22023';
    end if;
    v_importe := abs(coalesce(nullif(v_linea ->> 'importe', '')::numeric, 0));
    v_suma := v_suma + v_importe;

    -- Stock: solo si el expediente movió stock al registrarse (los traídos de la app antigua no).
    if exists (select 1 from public.movimiento_stock m where m.documento_origen_tipo = 'rotura' and m.documento_origen_numero = v_x.id) then
      if v_tipo = 'ABONO' then
        perform roturas_privado.mover(v_x.id, roturas_privado.almacen_roturas(), -1, 'devolucion_proveedor', 'Abono ' || coalesce(v_doc, ''));
      else
        perform roturas_privado.traspasar(v_x.id, roturas_privado.almacen_roturas(), roturas_privado.almacen_venta(), 'Compensación con género ' || coalesce(v_doc, ''));
      end if;
    end if;

    update public.rotura_expediente
       set estado = v_destino, tipo_cuadre = v_tipo, lote_cuadre = v_cuadre,
           pendiente_contabilizar = (v_tipo = 'ABONO'),
           importe_abonado = case when v_tipo = 'ABONO' then v_importe end,
           compensacion_observaciones = case when v_tipo = 'COMPENSACION_GENERO' then nullif(btrim(p ->> 'observaciones'), '') else compensacion_observaciones end
     where id = v_x.id;
    insert into public.rotura_historial (expediente_id, estado_anterior, estado_nuevo, empleado_codigo, observaciones)
    values (v_x.id, v_x.estado, v_destino, v_quien,
            case when v_tipo = 'ABONO' then 'Abono ' || v_doc || ' · ' || to_char(v_importe, 'FM999G999G990D00') || ' €'
                 else 'Compensado con género' || coalesce(' · ' || v_doc, '') end);
    v_numeros := v_numeros || v_x.numero;
  end loop;

  if v_ruta is not null then
    insert into public.rotura_documento (expediente_id, tipo, nombre, ruta, creado_por)
    values (v_primero, case when v_tipo = 'ABONO' then 'ABONO' else 'ALBARAN' end, coalesce(nullif(btrim(p ->> 'pdf_nombre'), ''), 'documento del proveedor.pdf'), v_ruta, v_quien)
    on conflict do nothing;
  end if;

  -- Factura de abono del proveedor, en negativo, sin contabilizar.
  if v_tipo = 'ABONO' then
    v_factura := public.fn_siguiente_numero(v_tienda, 'factura_proveedor', '');
    insert into public.factura_proveedor (tienda_terminal_codigo, id, fecha_hora, proveedor_codigo, numero_factura_externo, fecha_factura,
                                          subtotal, base_imponible, total_igic, total, total_a_pagar_proveedor, total_pendiente,
                                          pagado, contabilizado, observaciones)
    values (v_tienda, v_factura, now(), v_proveedor, v_doc, coalesce(v_fecha, current_date),
            -v_base, -v_base, -v_igic, -v_total, -v_total, -v_total, false, false,
            'Abono de roturas (cuadre ' || v_cuadre || '): ' || array_to_string(v_numeros, ', '));
    update public.rotura_cuadre set factura_tienda = v_tienda, factura_id = v_factura where id = v_cuadre;
  end if;

  return jsonb_build_object('cuadre_id', v_cuadre, 'factura_tienda', case when v_factura is not null then v_tienda end, 'factura_id', v_factura,
                            'expedientes', to_jsonb(v_numeros), 'suma_lineas', v_suma, 'total', v_total);
end $$;

revoke execute on function public.fn_rotura_cuadrar(jsonb) from public, anon;
grant execute on function public.fn_rotura_cuadrar(jsonb) to authenticated, service_role;
