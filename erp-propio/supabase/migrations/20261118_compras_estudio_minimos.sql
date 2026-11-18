-- Gestor de Pedidos 2.0: estudio de mínimos y máximos con prueba hacia atrás (18/11/2026, Rober).
--
-- Simula, semana a semana, el último año de ventas (los 12 meses que acaban en p_fin) artículo a artículo, como
-- si se hubiera pedido cada semana con cada forma de calcular el mínimo y el máximo. Cada mes usa SOLO lo que se
-- sabía antes de ese mes (los 12 meses anteriores), nunca el futuro. Mide, por forma y por tipo de artículo:
--   · cuánto de lo que se vendió se habría podido servir del stock (en unidades y en euros),
--   · en cuántas semanas habría faltado algo,
--   · cuánto dinero habría estado parado de media en el almacén,
--   · cuántas líneas de pedido habría que haber lanzado.
-- Supuestos: la venta del mes se reparte igual entre sus semanas; el pedido llega a las semanas que dice el plazo
-- de entrega del proveedor (si no tiene, 7 días); lo que no se puede servir se pierde (no se apunta para luego).
-- Límite: lo vendido no es la demanda real cuando no había stock; sin stock histórico no se puede corregir.
--
-- Formas que compara:
--   0 fichas actuales      el mínimo y el máximo que tienen hoy los artículos.
--   1 fórmula actual       la del ERP (fn_compras_calcular_minimos): venta media de 12 meses, 95 % de servicio,
--                          máximo = mínimo + 30 días.
--   2 estacional           como la 1, pero la venta esperada mezcla la media con el mismo mes del año anterior
--                          corregido por la tendencia de los últimos 3 meses.
--   3 por tipo             regulares (venden 9 o más meses de 12) como la 2; intermitentes (4 a 8) con menos
--                          margen; raros (3 o menos) sin stock: se piden cuando alguien los pide.
--   4 por tipo, 15 días    como la 3 pero el máximo cubre 15 días en vez de 30 (pedidos más pequeños y frecuentes).
--   5 raros: reponer si baratos   regulares e intermitentes con la fórmula 1; los raros de 15 € o menos, sin
--                          mínimo pero reponiendo lo que se vendió en su mejor mes; los raros caros, sin stock.
--   6 raros: reponer al vender    como la 5, pero todos los raros se reponen al venderse, sean caros o baratos.

create or replace function public.fn_compras_estudio_minimos(p_fin date default null, p_muestra integer default 1)
returns jsonb language plpgsql security definer
set search_path to 'public', 'pg_temp' set statement_timeout to '600s' as $$
declare
  v_fin date := coalesce(p_fin, (select max(mes) from venta_historico_mensual));
  v_ini date;
  nombres constant text[] := array['0 fichas actuales', '1 fórmula actual', '2 estacional', '3 por tipo', '4 por tipo, 15 días',
                                   '5 raros: reponer si baratos', '6 raros: reponer al vender'];
  tipos constant text[] := array['regular', 'intermitente', 'raro'];
  r record; ix int; wk int; km int;
  i numeric; disp numeric; serv numeric; pos numeric; o numeric; pipe numeric[];
  a_art int[] := array_fill(0, array[21]); a_ped int[] := array_fill(0, array[21]); a_rot int[] := array_fill(0, array[21]); a_sem int[] := array_fill(0, array[21]);
  a_dem numeric[] := array_fill(0::numeric, array[21]); a_serv numeric[] := array_fill(0::numeric, array[21]);
  a_deme numeric[] := array_fill(0::numeric, array[21]); a_serve numeric[] := array_fill(0::numeric, array[21]);
  a_stk numeric[] := array_fill(0::numeric, array[21]);
  v_out jsonb := '[]'::jsonb; p int; t int; j int[];
begin
  if not fn_puede('/gestor-pedidos-proveedor') then
    raise exception 'No tienes permiso del Gestor de Pedidos a Proveedores.' using errcode = '42501';
  end if;
  v_fin := date_trunc('month', v_fin)::date;
  v_ini := (v_fin - interval '11 months')::date;

  for r in
    with art as (
      select a.codigo_interno art, coalesce(nullif(a.coste_neto, 0), 0)::numeric coste,
             least(coalesce(nullif(greatest(coalesce(pr.dias_entrega, 0), 0), 0), 7), 30)::numeric l,
             coalesce(a.stock_minimo, 0)::numeric fmin, coalesce(nullif(a.stock_maximo, 0), a.stock_minimo, 0)::numeric fmax
        from articulo a left join proveedor pr on pr.codigo = a.proveedor_habitual_codigo
       where a.codigo_interno in (select h.articulo_codigo from venta_historico_mensual h where h.mes between (v_ini - interval '12 months')::date and (v_ini - interval '1 month')::date)
         and abs(hashtext(a.codigo_interno)) % greatest(1, p_muestra) = 0),
    meses as (select generate_series((v_ini - interval '24 months')::date, v_fin, '1 month')::date mes),
    v as (select h.articulo_codigo art, h.mes, sum(h.unidades) u from venta_historico_mensual h
           where h.articulo_codigo in (select art from art) and h.mes >= (v_ini - interval '24 months')::date group by 1, 2),
    g as (select a.art, m.mes, greatest(coalesce(v.u, 0), 0) u from art a cross join meses m left join v on v.art = a.art and v.mes = m.mes),
    w as (select g.art, g.mes, g.u,
                 sum(g.u) over w12 tot12, sum(g.u * g.u) over w12 sq12, max(g.u) over w12 mx12, count(*) filter (where g.u > 0) over w12 mv12,
                 sum(g.u) over (partition by g.art order by g.mes rows between 3 preceding and 1 preceding) l3,
                 sum(g.u) over (partition by g.art order by g.mes rows between 15 preceding and 13 preceding) p3,
                 lag(g.u, 12) over (partition by g.art order by g.mes) ly
            from g window w12 as (partition by g.art order by g.mes rows between 12 preceding and 1 preceding)),
    q as (select w.art, w.mes, w.u, a.coste, a.l, a.fmin, a.fmax, w.mv12, w.mx12,
                 w.tot12 / 12.0 media, sqrt(greatest(0, (w.sq12 / 12.0 - power(w.tot12 / 12.0, 2)) * 12 / 11.0)) sd,
                 0.5 * w.tot12 / 12.0 + 0.5 * coalesce(w.ly * least(2, greatest(0.5, (coalesce(w.l3, 0) + 1) / (coalesce(w.p3, 0) + 1))), w.tot12 / 12.0) fc
            from w join art a using (art) where w.mes between v_ini and v_fin),
    pm as (select q.art, q.mes, q.u * 12 / 52.0 dw, q.coste, greatest(1, least(5, ceil(q.l / 7)))::int lw, x.pol, x.s, x.mx,
                  first_value(case when q.mv12 >= 9 then 1 when q.mv12 >= 4 then 2 else 3 end) over (partition by q.art order by q.mes) tipo
             from q cross join lateral (select sq.* from (values
               (1, q.fmin, q.fmax),
               (2, ceil(q.media / 30.44 * q.l + 1.65 * q.sd * sqrt(q.l / 30.44)), ceil(q.media / 30.44 * q.l + 1.65 * q.sd * sqrt(q.l / 30.44) + q.media / 30.44 * 30)),
               (3, ceil(q.fc / 30.44 * q.l + 1.65 * q.sd * sqrt(q.l / 30.44)), ceil(q.fc / 30.44 * q.l + 1.65 * q.sd * sqrt(q.l / 30.44) + q.fc / 30.44 * 30)),
               (4, case when q.mv12 >= 9 then ceil(q.fc / 30.44 * q.l + 1.65 * q.sd * sqrt(q.l / 30.44)) when q.mv12 >= 4 then ceil(q.media / 30.44 * q.l + q.sd * sqrt(q.l / 30.44)) else 0 end,
                   case when q.mv12 >= 9 then ceil(q.fc / 30.44 * q.l + 1.65 * q.sd * sqrt(q.l / 30.44) + q.fc / 30.44 * 30)
                        when q.mv12 >= 4 then ceil(q.media / 30.44 * q.l + q.sd * sqrt(q.l / 30.44)) + greatest(1, ceil(q.media)) else 0 end),
               (5, case when q.mv12 >= 9 then ceil(q.fc / 30.44 * q.l + 1.65 * q.sd * sqrt(q.l / 30.44)) when q.mv12 >= 4 then ceil(q.media / 30.44 * q.l + q.sd * sqrt(q.l / 30.44)) else 0 end,
                   case when q.mv12 >= 9 then ceil(q.fc / 30.44 * q.l + 1.65 * q.sd * sqrt(q.l / 30.44) + q.fc / 30.44 * 15)
                        when q.mv12 >= 4 then ceil(q.media / 30.44 * q.l + q.sd * sqrt(q.l / 30.44)) + greatest(1, ceil(q.media / 2)) else 0 end),
               (6, case when q.mv12 >= 4 then ceil(q.media / 30.44 * q.l + 1.65 * q.sd * sqrt(q.l / 30.44)) else 0 end,
                   case when q.mv12 >= 4 then ceil(q.media / 30.44 * q.l + 1.65 * q.sd * sqrt(q.l / 30.44) + q.media / 30.44 * 30)
                        when q.coste <= 15 then coalesce(q.mx12, 0) else 0 end),
               (7, case when q.mv12 >= 4 then ceil(q.media / 30.44 * q.l + 1.65 * q.sd * sqrt(q.l / 30.44)) else 0 end,
                   case when q.mv12 >= 4 then ceil(q.media / 30.44 * q.l + 1.65 * q.sd * sqrt(q.l / 30.44) + q.media / 30.44 * 30)
                        else coalesce(q.mx12, 0) end)
             ) sq(pol, s, mx)) x)
    select pm.art, pm.pol, min(pm.tipo) tipo, min(pm.coste) coste, min(pm.lw) lw,
           array_agg(pm.s order by pm.mes) s, array_agg(pm.mx order by pm.mes) mx, array_agg(pm.dw order by pm.mes) dw
      from pm group by pm.art, pm.pol
  loop
    ix := (r.pol - 1) * 3 + r.tipo;
    a_art[ix] := a_art[ix] + 1;
    i := r.mx[1];                                    -- se empieza el año con el almacén en el máximo
    pipe := array[0, 0, 0, 0, 0]::numeric[];
    for wk in 1..52 loop
      km := least(12, floor((wk - 1) * 12 / 52.0)::int + 1);
      disp := i + pipe[1];
      pipe := pipe[2:5] || array[0::numeric];
      serv := least(disp, r.dw[km]);
      i := disp - serv;
      pos := i + pipe[1] + pipe[2] + pipe[3] + pipe[4] + pipe[5];
      if pos <= r.s[km] and r.mx[km] > pos then
        o := r.mx[km] - pos;
        pipe[r.lw] := pipe[r.lw] + o;
        a_ped[ix] := a_ped[ix] + 1;
      end if;
      a_dem[ix] := a_dem[ix] + r.dw[km];
      a_serv[ix] := a_serv[ix] + serv;
      a_deme[ix] := a_deme[ix] + r.dw[km] * r.coste;
      a_serve[ix] := a_serve[ix] + serv * r.coste;
      a_stk[ix] := a_stk[ix] + i * r.coste;
      a_sem[ix] := a_sem[ix] + 1;
      if r.dw[km] - serv > 0.001 then a_rot[ix] := a_rot[ix] + 1; end if;
    end loop;
  end loop;

  for p in 1..7 loop
    for t in 0..3 loop                               -- 0 = todos los tipos juntos
      j := case when t = 0 then array[(p - 1) * 3 + 1, (p - 1) * 3 + 2, (p - 1) * 3 + 3] else array[(p - 1) * 3 + t] end;
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'forma', nombres[p], 'tipo', case when t = 0 then 'todos' else tipos[t] end,
        'articulos', (select sum(a_art[x]) from unnest(j) x),
        'servido_pct_uds', round(100 * (select sum(a_serv[x]) from unnest(j) x) / nullif((select sum(a_dem[x]) from unnest(j) x), 0), 1),
        'servido_pct_eur', round(100 * (select sum(a_serve[x]) from unnest(j) x) / nullif((select sum(a_deme[x]) from unnest(j) x), 0), 1),
        'semanas_con_rotura_pct', round(100.0 * (select sum(a_rot[x]) from unnest(j) x) / nullif((select sum(a_sem[x]) from unnest(j) x), 0), 1),
        'stock_medio_eur', round((select sum(a_stk[x]) from unnest(j) x) / 52),
        'lineas_pedido', (select sum(a_ped[x]) from unnest(j) x)));
    end loop;
  end loop;
  return jsonb_build_object('desde', v_ini, 'hasta', v_fin, 'muestra', '1 de cada ' || greatest(1, p_muestra), 'resultado', v_out);
end $$;
revoke all on function public.fn_compras_estudio_minimos(date, integer) from public, anon;
grant execute on function public.fn_compras_estudio_minimos(date, integer) to authenticated;
comment on function public.fn_compras_estudio_minimos(date, integer) is
  'Solo lectura. Prueba hacia atrás de las formas de calcular mínimos y máximos (Gestor de Pedidos 2.0): servicio, roturas, stock medio y líneas de pedido por forma y tipo de artículo.';
