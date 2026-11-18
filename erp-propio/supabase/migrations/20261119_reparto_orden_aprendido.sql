-- App de reparto: la ruta aprende el orden de lo que el repartidor hace de verdad (Rober, 18/11/2026: «no se ordenó la
-- ruta hoy porque no está siguiendo ningún orden concreto»).
--
-- Hasta ahora el orden solo se aprendía cuando el repartidor reordenaba la lista a mano en la app (nadie lo había
-- hecho: reparto_orden_recordado estaba vacía), así que cada día salía el orden del campo «orden de ruta» de la ficha
-- del cliente en GeminisWin, que está casi sin rellenar (muchos clientes con el mismo número).
--
-- Ahora, cada noche, se mira en qué orden se ENTREGÓ de verdad
-- (hora de entrega o del primer intento) y se guarda la posición de cada cliente en su ruta. Si ya había una posición,
-- se promedia con la nueva, para que un día raro no lo descoloque todo. Al día siguiente, el reparto de esa ruta sale
-- ordenado así (aplicar_orden_recordado, que ya existía). Si el repartidor reordena a mano en la app, eso sigue
-- mandando en el momento y también se aprende.
create or replace function reparto_privado.recordar_orden_real(p_tienda text, p_numero bigint)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  with x as (
    select r.ruta_codigo ruta, coalesce(g.cliente_codigo, v.cliente_codigo) cli, reparto_privado.dir_norma(l.direccion) dir,
           r.repartidor_codigo rep, coalesce(l.entregado_en, l.intento1_en) t
      from reparto_linea l
      join reparto r on r.tienda_terminal_codigo = l.tienda_terminal_codigo and r.numero = l.numero
      left join reparto_gw_venta g on r.origen = 'geminiswin' and g.venta_tienda_codigo = l.venta_tienda_codigo and g.venta_numero = l.venta_numero
      left join venta v on r.origen <> 'geminiswin' and v.tienda_terminal_codigo = l.venta_tienda_codigo and v.numero = l.venta_numero
     where l.tienda_terminal_codigo = p_tienda and l.numero = p_numero and l.estado <> 'anulado'
       and coalesce(l.entregado_en, l.intento1_en) is not null
  ),
  c as (select ruta, cli, dir, max(rep) rep, min(t) t from x where ruta is not null and cli is not null group by 1, 2, 3),
  p as (select c.*, (row_number() over (order by t) - 0.5) / count(*) over () pos from c),
  u as (
    insert into reparto_orden_recordado as m (ruta_codigo, cliente_codigo, direccion, posicion, repartidor_codigo, actualizado_en)
    select ruta, cli, dir, pos, rep, now() from p where (select count(*) from p) >= 3
    on conflict (ruta_codigo, cliente_codigo, direccion)
    do update set posicion = round((m.posicion + excluded.posicion) / 2, 4),
                  repartidor_codigo = coalesce(excluded.repartidor_codigo, m.repartidor_codigo), actualizado_en = now()
    returning 1)
  select count(*) into n from u;
  return n;
end $$;
revoke all on function reparto_privado.recordar_orden_real(text, bigint) from public, anon, authenticated;

-- Todos los repartos de un día (por defecto, hoy).
create or replace function reparto_privado.recordar_orden_dia(p_dia date default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r record; t int := 0; k int := 0;
begin
  for r in select tienda_terminal_codigo, numero from reparto where fecha = coalesce(p_dia, (now() at time zone 'Atlantic/Canary')::date) loop
    t := t + reparto_privado.recordar_orden_real(r.tienda_terminal_codigo, r.numero);
    k := k + 1;
  end loop;
  return jsonb_build_object('repartos', k, 'clientes', t);
end $$;
revoke all on function reparto_privado.recordar_orden_dia(date) from public, anon, authenticated;

-- Cada noche a las 21:47 (hora del servidor, UTC = hora de Canarias en invierno).
select cron.schedule('erp_reparto_orden_aprendido', '47 21 * * *', 'select reparto_privado.recordar_orden_dia()');

