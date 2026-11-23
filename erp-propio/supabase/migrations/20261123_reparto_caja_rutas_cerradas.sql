-- Caja (Mónica): una ruta cerrada está cerrada (Rober, 23/11/2026: «si una ruta está cerrada, todo su contenido cambia de
-- estado: lo no entregado pasa al día siguiente, lo que cobró Mónica queda liquidado»). Antes la caja veía 10 días de
-- facturas de contado sin cobro apuntado en GeminisWin, aunque el repartidor no hubiera cobrado nada (entregadas por
-- GeminisWin, sin marcar en la app): por eso le salían rutas de otros días.
-- Ahora, de las rutas ya cerradas, la caja solo ve lo que el propio repartidor marcó en la app como entregado/cobrado y
-- todavía no se ha liquidado: es dinero que tiene en la mano y debe entregar (puede hacerlo al día siguiente). Lo que solo
-- figura como entregado porque lo dice GeminisWin (sin marca en la app) ya no le sale.
-- Lo demás de las rutas cerradas lo sigue viendo la oficina en el Control de repartos del ERP.
do $$
declare d text := pg_get_functiondef('reparto_privado.por_cobrar(boolean,boolean)'::regprocedure);
  marcado constant text := '(l.cobro_medio is not null or l.entregado_en is not null)';
begin
  if position(marcado in d) = 0 then
    -- Ruta abierta: todo. Ruta cerrada (hoy o días anteriores): para la caja, solo lo marcado por el repartidor.
    d := replace(d, '(r.estado = 2 or (r.fecha = fn_app_rep_hoy() and not exists',
                    '(r.estado = 2 or (not (p_caja and not p_sup) and r.fecha = fn_app_rep_hoy() and not exists');
    d := replace(d, 'or (p_caja and not p_sup and r.fecha > fn_app_rep_hoy() - 10))',
                    'or (p_caja and not p_sup and r.fecha > fn_app_rep_hoy() - 10 and ' || marcado || '))');
    if position(marcado in d) = 0 or position('not (p_caja and not p_sup) and r.fecha' in d) = 0 then
      raise exception 'No se pudo cambiar reparto_privado.por_cobrar';
    end if;
    execute d;
  end if;
end $$;
