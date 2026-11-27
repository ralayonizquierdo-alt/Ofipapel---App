-- App de reparto: cada cliente de la ruta lleva TODO lo que tiene pendiente de cobro en GeminisWin
-- (gw_venta.total_pendiente <> 0, lo mismo que el listado «Pendiente de cobro» de Géminis),
-- no solo las facturas de esta entrega. Solo CONTADO (forma_pago_tipo 1): en crédito/remesa
-- total_pendiente de la copia no se mueve al cobrar la remesa (11 M€ «pendientes»), no sirve.
-- Último año: hay restos de 2019-2021 (abonos sin compensar) que solo confundirían al repartidor. Los genéricos (contado) no, que salen miles.
-- Solo informa: no cambia cobros ni liquidaciones.
create or replace function reparto_privado.deuda_clientes(p_tienda text, p_numero integer)
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  with cli as (
    select distinct coalesce(g.cliente_codigo, v.cliente_codigo, gv.cliente_codigo) cc
      from reparto_linea l
      left join reparto_gw_venta g on g.venta_tienda_codigo = l.venta_tienda_codigo and g.venta_numero = l.venta_numero
      left join venta v on v.tienda_terminal_codigo = l.venta_tienda_codigo and v.numero = l.venta_numero
      left join gw_venta gv on gv.oficina = l.venta_tienda_codigo and gv.id_venta = l.venta_numero
     where l.tienda_terminal_codigo = p_tienda and l.numero = p_numero and l.estado <> 'anulado'
  )
  select coalesce(jsonb_object_agg(s.cc, s.docs), '{}'::jsonb)
    from (
      select cli.cc,
             jsonb_agg(jsonb_build_object('vt', d.oficina, 'vn', d.id_venta, 'fecha', d.fecha,
                                          'factura', d.factura, 'pendiente', d.total_pendiente)
                       order by d.fecha, d.id_venta) docs
        from cli
        cross join lateral (
          select gv.oficina, gv.id_venta, gv.fecha, gv.total_pendiente, rg.factura_numero factura
            from gw_venta gv
            left join reparto_gw_venta rg on rg.venta_tienda_codigo = gv.oficina and rg.venta_numero = gv.id_venta
           where gv.cliente_codigo = cli.cc and gv.total_pendiente <> 0 and gv.forma_pago_tipo = 1
             and gv.fecha >= current_date - 365
           order by gv.fecha desc
           limit 40) d
       where cli.cc is not null
         and not exists (select 1 from cliente c where c.codigo = cli.cc and c.es_generico)
       group by cli.cc) s
$function$;

-- fn_app_rep_lineas: el reparto lleva 'deuda' = { cliente_codigo: [documentos pendientes] }.
do $$
declare v_def text := pg_get_functiondef('public.fn_app_rep_lineas'::regproc);
        v_old text := '''ruta_nombre'', coalesce((select descripcion from ruta_reparto where codigo = r.ruta_codigo), r.ruta_codigo))';
begin
  if position('deuda_clientes' in v_def) > 0 then return; end if;
  if position(v_old in v_def) = 0 then raise exception 'fn_app_rep_lineas: no encuentro ruta_nombre'; end if;
  v_def := replace(v_def, v_old,
    '''ruta_nombre'', coalesce((select descripcion from ruta_reparto where codigo = r.ruta_codigo), r.ruta_codigo), '
    || '''deuda'', reparto_privado.deuda_clientes(r.tienda_terminal_codigo, r.numero))');
  execute v_def;
end $$;

-- ARREGLO 27/11/2026 08:10: reparto.numero es bigint y la función se creó con integer →
-- «function reparto_privado.deuda_clientes(text, bigint) does not exist» y la app de reparto no
-- cargaba ningún pedido. Sobrecarga con bigint.
create or replace function reparto_privado.deuda_clientes(p_tienda text, p_numero bigint)
 returns jsonb language sql stable security definer set search_path to 'public'
as $$ select reparto_privado.deuda_clientes(p_tienda, p_numero::integer) $$;
