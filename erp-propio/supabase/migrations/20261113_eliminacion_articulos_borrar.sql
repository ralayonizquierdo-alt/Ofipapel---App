-- Eliminación de Artículos: decisiones de Rober (12/11/2026).
--
-- 1) BORRADO DEFINITIVO, solo de los artículos que no tienen NADA: ni ventas, ni compras, ni
--    presupuestos, ni pedidos, ni traspasos, ni movimientos de stock, ni stock, ni inventarios,
--    lotes, roturas, peticiones… Los que tengan cualquier cosa se dan de baja en vez de borrarse.
--    Cómo se garantiza: todas las tablas que usan un artículo tienen clave ajena SIN borrado en
--    cascada (venta_linea, pedido_cliente_linea, pedido_proveedor_linea, movimiento_stock,
--    traspaso_almacen_linea, inventario_linea, rotura_expediente…). Si el artículo aparece en
--    cualquiera de ellas, la base de datos impide borrarlo y entonces se da de baja. Solo se
--    borran con él sus datos propios (códigos de barras, precios, proveedores, ofertas, tarifas…,
--    que ya tienen borrado en cascada), sus filas de stock si están todas a cero y sus PLU.
--    Solo administradores. Cada borrado queda en la auditoría (trigger de articulo).
--
-- 2) FECHA DE BAJA FUTURA: al llegar el día, el artículo se da de baja solo (tarea diaria).

create or replace function public.fn_eliminar_articulos_borrar(p jsonb, p_esperados bigint default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cods text[];
  v_n bigint;
  v_c text;
  v_borrados text[] := '{}';
  v_baja text[] := '{}';
  v_hoy date := (now() at time zone 'Atlantic/Canary')::date;
begin
  if auth.uid() is null or not public.fn_es_administrador() then
    raise exception 'Borrar artículos es solo para administradores. Pídeselo a un administrador.' using errcode = '42501';
  end if;

  execute format('select array_agg(a.codigo_interno order by a.codigo_interno) from articulo a where %s', fn_eliminar_articulos_where(p))
    into v_cods;
  v_n := coalesce(array_length(v_cods, 1), 0);
  if p_esperados is not null and p_esperados <> v_n then
    raise exception 'La lista de artículos ha cambiado desde que la viste (eran %, ahora son %). Vuelve a pulsar Procesar para revisarla.', p_esperados, v_n;
  end if;

  foreach v_c in array coalesce(v_cods, '{}') loop
    begin
      -- Con stock en algún almacén no se borra nunca.
      if exists (select 1 from articulo_almacen_stock s where s.articulo_codigo = v_c
                  and (coalesce(s.cantidad_actual, 0) <> 0 or coalesce(s.cantidad_reservada, 0) <> 0)) then
        raise foreign_key_violation;
      end if;
      delete from articulo_almacen_stock where articulo_codigo = v_c;
      delete from articulo_plu where articulo_codigo = v_c;
      delete from articulo where codigo_interno = v_c;
      v_borrados := v_borrados || v_c;
    exception when foreign_key_violation then
      -- Tiene algo (ventas, compras, pedidos, movimientos, stock…): se da de baja en vez de borrarse.
      update articulo set activo = false, fecha_baja = coalesce(fecha_baja, v_hoy), actualizado_en = now()
       where codigo_interno = v_c;
      v_baja := v_baja || v_c;
    end;
  end loop;

  return jsonb_build_object('total', v_n, 'borrados', cardinality(v_borrados), 'dados_de_baja', cardinality(v_baja),
                            'codigos_borrados', to_jsonb(v_borrados));
end;
$$;

revoke all on function public.fn_eliminar_articulos_borrar(jsonb, bigint) from public, anon;
grant execute on function public.fn_eliminar_articulos_borrar(jsonb, bigint) to authenticated, service_role;

-- Fecha de baja futura: cada día, los artículos activos cuya fecha de baja ya ha llegado se dan de
-- baja. (Al crear esta tarea no había ningún artículo activo con fecha de baja pasada.)
-- Para reactivar un artículo hay que quitarle la fecha de baja.
create or replace function public.fn_articulos_aplicar_bajas_programadas()
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n integer;
begin
  update articulo set activo = false, actualizado_en = now()
   where activo and fecha_baja is not null and fecha_baja <= (now() at time zone 'Atlantic/Canary')::date;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.fn_articulos_aplicar_bajas_programadas() from public, anon, authenticated;
grant execute on function public.fn_articulos_aplicar_bajas_programadas() to service_role;

do $$
begin
  perform cron.unschedule('erp_bajas_programadas_articulos') where exists (select 1 from cron.job where jobname = 'erp_bajas_programadas_articulos');
  perform cron.schedule('erp_bajas_programadas_articulos', '17 0 * * *', 'select public.fn_articulos_aplicar_bajas_programadas()');
end $$;
