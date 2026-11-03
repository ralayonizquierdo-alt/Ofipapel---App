-- Seguimiento de repartos: hora de cada pedido encima de su punto (Rober, 03/11/2026). Añade a cada ruta «pedidos»:
-- un elemento por pedido, en orden (primero los marcados, por hora; luego los que quedan), con su estado y la hora
-- (entrega o último intento). Lo usan la TV (/reparto-tv) y el Control de Repartos del ERP.
create or replace function reparto_privado.seguimiento(p_fecha date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_dia date := coalesce(p_fecha, fn_app_rep_hoy()); v_lunes date := date_trunc('week', coalesce(p_fecha, fn_app_rep_hoy()))::date;
begin
  return jsonb_build_object(
    'fecha', v_dia,
    'rutas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tienda', r.tienda_terminal_codigo, 'numero', r.numero, 'estado', r.estado, 'ruta', r.ruta_codigo,
        'ruta_nombre', coalesce(rr.descripcion, r.ruta_codigo), 'repartidor', r.repartidor_codigo,
        'repartidor_nombre', coalesce(nullif(rp.nombre_corto, ''), rp.nombre),
        'total', k.total, 'entregados', k.entregados, 'incidencias', k.incidencias, 'no_entregados', k.no_entregados,
        'pendientes', k.pendientes, 'comprobados', k.comprobados,
        'posicion', (select jsonb_build_object('lat', p.lat, 'lng', p.lng, 'en', p.en) from reparto_posicion p
                      where p.tienda_terminal_codigo = r.tienda_terminal_codigo and p.numero = r.numero order by p.en desc limit 1),
        'puntos', (select coalesce(jsonb_agg(jsonb_build_object('lat', l.marcado_lat, 'lng', l.marcado_lng,
                            'estado', case when l.estado = 'entregado' and l.incidencia is not null then 'incidencia' else l.estado end)), '[]'::jsonb)
                     from reparto_linea l where l.tienda_terminal_codigo = r.tienda_terminal_codigo and l.numero = r.numero and l.marcado_lat is not null),
        'pedidos', (select coalesce(jsonb_agg(jsonb_build_object('e', x.e, 'h', to_char(x.t at time zone 'Atlantic/Canary', 'HH24:MI'))
                                              order by x.t is null, x.t, x.orden nulls last), '[]'::jsonb)
                      from (select case when l.estado in ('entregado', 'liquidado') and l.incidencia is not null then 'incidencia'
                                        when l.estado in ('entregado', 'liquidado') then 'entregado'
                                        when l.estado = 'no_entregado' then 'no_entregado' else 'pendiente' end e,
                                   case when l.estado in ('entregado', 'liquidado') then l.entregado_en
                                        when l.estado = 'no_entregado' then coalesce(l.intento2_en, l.intento1_en) end t,
                                   l.orden
                              from reparto_linea l where l.tienda_terminal_codigo = r.tienda_terminal_codigo and l.numero = r.numero
                               and l.estado <> 'anulado') x))
        order by r.ruta_codigo, r.numero)
      from reparto r
      left join ruta_reparto rr on rr.codigo = r.ruta_codigo
      left join repartidor rp on rp.codigo = r.repartidor_codigo
      cross join lateral (
        select count(*) total,
               count(*) filter (where estado in ('entregado', 'liquidado') and incidencia is null) entregados,
               count(*) filter (where estado = 'entregado' and incidencia is not null) incidencias,
               count(*) filter (where estado = 'no_entregado') no_entregados,
               count(*) filter (where estado in ('pendiente', 'viene_anterior')) pendientes,
               count(*) filter (where comprobado_en is not null) comprobados
          from reparto_linea l where l.tienda_terminal_codigo = r.tienda_terminal_codigo and l.numero = r.numero and l.estado <> 'anulado') k
      where r.fecha = v_dia or (r.estado = 2 and r.fecha < v_dia)), '[]'::jsonb),
    'ranking', coalesce((
      select jsonb_agg(jsonb_build_object('repartidor', x.nombre, 'entregados', x.n) order by x.n desc, x.nombre)
        from (select coalesce(nullif(rp.nombre_corto, ''), rp.nombre, r.repartidor_codigo) nombre, count(*) n
                from reparto_linea l join reparto r on r.tienda_terminal_codigo = l.tienda_terminal_codigo and r.numero = l.numero
                left join repartidor rp on rp.codigo = r.repartidor_codigo
               where l.estado in ('entregado', 'liquidado') and r.repartidor_codigo is not null
                 and coalesce((l.entregado_en at time zone 'Atlantic/Canary')::date, r.fecha) between v_lunes and v_lunes + 6
               group by 1) x), '[]'::jsonb),
    'totales', (
      select jsonb_build_object(
               'semana', count(*) filter (where d between v_lunes and v_lunes + 6),
               'mes', count(*) filter (where date_trunc('month', d) = date_trunc('month', v_dia)),
               'anio', count(*) filter (where date_trunc('year', d) = date_trunc('year', v_dia)))
        from (select coalesce((l.entregado_en at time zone 'Atlantic/Canary')::date, r.fecha) d
                from reparto_linea l join reparto r on r.tienda_terminal_codigo = l.tienda_terminal_codigo and r.numero = l.numero
               where l.estado in ('entregado', 'liquidado') and r.fecha >= date_trunc('year', v_dia)::date - 7) t));
end $$;
