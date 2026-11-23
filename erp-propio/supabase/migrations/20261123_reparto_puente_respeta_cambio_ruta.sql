-- El puente de GeminisWin (fn_reparto_gw_ingesta) respeta los cambios de ruta hechos en el ERP (Rober, 23/11/2026:
-- «cambiar de ruta» un pedido entre dos repartos que vienen de GeminisWin). Hasta ahora el puente, en cada pasada:
--   1) volvía a meter el pedido en el reparto de origen (GeminisWin sigue diciendo que está ahí), y
--   2) lo anulaba en el de destino (GeminisWin no lo trae en ese reparto).
-- Ahora, para cada venta, solo cuenta su ÚLTIMO movimiento en reparto_cambio_ruta:
--   · si salió de este reparto (de_tienda/de_numero), el puente no lo vuelve a tocar aquí;
--   · si llegó a este reparto (a_tienda/a_numero), el puente no lo anula aunque GeminisWin no lo traiga.
-- Un pedido que se movió y luego se devolvió a su ruta no queda bloqueado: su último movimiento ya apunta a la de origen.
-- No cambia estructura ni tablas (solo la función, con el mismo método que el resto de arreglos del puente: se lee la
-- definición viva, se sustituye el texto y se comprueba que ha entrado).
do $$
declare
  d text := pg_get_functiondef('public.fn_reparto_gw_ingesta(jsonb)'::regprocedure);
  v_ancla_origen text := '      if not exists (select 1 from reparto_linea where tienda_terminal_codigo = v_ofi and numero = v_num' || chr(10)
                      || '                       and venta_tienda_codigo = l ->> ''ofi_venta'' and venta_numero = (l ->> ''venta'')::bigint) then';
  v_ancla_destino text := 'and not ((x.venta_tienda_codigo || ''|'' || x.venta_numero) = any (v_claves))';
begin
  if position('reparto_cambio_ruta' in d) = 0 then
    if position(v_ancla_origen in d) = 0 or position(v_ancla_destino in d) = 0 then
      raise exception 'No se encontró el sitio donde cambiar fn_reparto_gw_ingesta (la función ha cambiado desde esta migración).';
    end if;
    d := replace(d, v_ancla_origen,
      '      -- Ya se pasó a otra ruta desde el ERP: este reparto no lo recupera.' || chr(10)
      || '      if exists (select 1 from reparto_cambio_ruta c' || chr(10)
      || '                  where c.venta_tienda_codigo = l ->> ''ofi_venta'' and c.venta_numero = (l ->> ''venta'')::bigint' || chr(10)
      || '                    and c.de_tienda = v_ofi and c.de_numero = v_num' || chr(10)
      || '                    and c.id = (select max(u.id) from reparto_cambio_ruta u' || chr(10)
      || '                                 where u.venta_tienda_codigo = c.venta_tienda_codigo and u.venta_numero = c.venta_numero)) then' || chr(10)
      || '        continue;' || chr(10)
      || '      end if;' || chr(10)
      || v_ancla_origen);
    d := replace(d, v_ancla_destino,
      v_ancla_destino || chr(10)
      || '         -- Llegó a este reparto desde el ERP: GeminisWin no lo trae aquí, pero no es de más.' || chr(10)
      || '         and not exists (select 1 from reparto_cambio_ruta c' || chr(10)
      || '                          where c.venta_tienda_codigo = x.venta_tienda_codigo and c.venta_numero = x.venta_numero' || chr(10)
      || '                            and c.a_tienda = v_ofi and c.a_numero = v_num' || chr(10)
      || '                            and c.id = (select max(u.id) from reparto_cambio_ruta u' || chr(10)
      || '                                         where u.venta_tienda_codigo = c.venta_tienda_codigo and u.venta_numero = c.venta_numero))');
    if position('reparto_cambio_ruta' in d) = 0 or position('c.a_numero = v_num' in d) = 0 or position('c.de_numero = v_num' in d) = 0 then
      raise exception 'No se pudo cambiar fn_reparto_gw_ingesta.';
    end if;
    execute d;
  end if;
end $$;
