-- Generar repartos (Rober, 19/11/2026):
--  1) Solo entran las ventas que en GeminisWin tienen marcado que van a reparto. Lo dice su estado de reparto
--     (reparto_gw_venta.gw_estado): vacío o 0 = no va a reparto (las de mostrador de las tiendas 44, 45, 46, 48…).
--     Las que vienen de un reparto anterior siguen entrando siempre.
--  2) Para comparar con GeminisWin, cada reparto de GeminisWin dice hasta qué venta llega (la más reciente que lleva
--     su tanda: los de un mismo día se generan juntos). Lo vendido después no pudo entrar y no cuenta como diferencia.
-- Parches idempotentes sobre las funciones en vivo.
do $$
declare d text;
begin
  d := pg_get_functiondef('reparto_privado.erp_candidatas(date)'::regprocedure);
  if position('gw_estado, 0) <> 0' in d) = 0 then
    if position('and (g.nueva or a.vt is not null)' in d) = 0 then raise exception 'erp_candidatas: no encuentro dónde filtrar'; end if;
    d := replace(d, 'and (g.nueva or a.vt is not null)', 'and (g.nueva or a.vt is not null)
     and (a.vt is not null or coalesce(g.gw_estado, 0) <> 0)');
    execute d;
  end if;

  d := pg_get_functiondef('public.fn_reparto_erp_panel(date)'::regprocedure);
  if position('''hasta''' in d) = 0 then
    if position('''fecha'', b.fecha,' in d) = 0 then raise exception 'erp_panel: no encuentro dónde añadir hasta'; end if;
    d := replace(d, '''fecha'', b.fecha,', '''fecha'', b.fecha,
                                                ''hasta'', (select max(g2.fecha::text || '' '' || coalesce(g2.hora, ''''))
                                                             from reparto b2 join reparto_linea l2 on l2.tienda_terminal_codigo = b2.tienda_terminal_codigo and l2.numero = b2.numero
                                                             join reparto_gw_venta g2 on g2.venta_tienda_codigo = l2.venta_tienda_codigo and g2.venta_numero = l2.venta_numero
                                                            where b2.origen = ''geminiswin'' and not b2.generado_erp and b2.fecha = b.fecha and l2.estado <> ''anulado''),');
    execute d;
  end if;
end $$;
