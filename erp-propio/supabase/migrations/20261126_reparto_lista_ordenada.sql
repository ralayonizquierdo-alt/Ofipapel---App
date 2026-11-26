-- Ctrl+Intro en la ficha de Repartos (Número, Fecha, Ruta, Repartidor): lista de TODOS los
-- repartos ordenada por ese campo, servida por tramos como el resto de listas ordenadas.
-- SECURITY INVOKER: las RLS de reparto siguen mandando. Los repartos ocultos no salen.
create or replace function public.gw_lista_ordenada_reparto(p_fuente text, p_campo text, p_modo text default 'ge', p_sk text default '', p_k text default '', p_ancla text default null, p_limite integer default 60, p_omitir_vacios boolean default false)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'public'
as $function$
declare
  v_from text; v_key text; v_cols text; v_expr text; v_k text; v_where text; v_ord text; v_sql text; v_res jsonb;
  v_lim int := least(greatest(coalesce(p_limite, 60), 1), 300);
begin
  if p_fuente <> 'reparto' then
    raise exception 'Lista ordenada: fuente no permitida (%)', p_fuente;
  end if;
  if not (p_campo = any (array['numero', 'fecha', 'ruta_codigo', 'repartidor_codigo'])) then
    raise exception 'Lista ordenada: campo no permitido (reparto.%)', p_campo;
  end if;
  v_from := 'reparto t left join ruta_reparto ru on ru.codigo = t.ruta_codigo left join repartidor rp on rp.codigo = t.repartidor_codigo';
  v_key := '(t.tienda_terminal_codigo || ''|'' || t.numero)';
  v_cols := 'jsonb_build_object(''tienda_terminal_codigo'', t.tienda_terminal_codigo, ''numero'', t.numero, '
    || '''fecha'', to_char(t.fecha, ''DD/MM/YYYY''), ''ruta_codigo'', t.ruta_codigo, ''ruta'', ru.descripcion, '
    || '''repartidor_codigo'', t.repartidor_codigo, ''repartidor'', rp.nombre, '
    || '''estado'', case t.estado when 4 then ''Cerrado'' when 2 then ''Abierto'' else t.estado::text end, '
    || '''total_ventas'', t.total_ventas)';

  if p_campo = 'numero' then
    v_expr := '(lpad(t.numero::text, 12, ''0'') collate "C")';
  elsif p_campo = 'fecha' then
    -- Más reciente primero no encaja con el cursor; se ordena por fecha ascendente y la lista
    -- se abre colocada en la fecha tecleada (o en la del reparto actual).
    v_expr := '(coalesce(to_char(t.fecha, ''YYYY-MM-DD''), '''') collate "C")';
  else
    v_expr := format('(upper(coalesce(t.%I, '''')) collate "C")', p_campo);
  end if;
  v_k := format('(%s collate "C")', v_key);

  if p_ancla is not null then
    execute format('select %s from %s where %s = $1 limit 1', v_expr, v_from, v_key) into p_sk using p_ancla;
    if p_sk is null then p_sk := ''; p_k := ''; else p_k := p_ancla; end if;
  end if;
  p_sk := coalesce(p_sk, '');
  p_k := coalesce(p_k, '');
  if p_campo = 'numero' and p_sk ~ '^\d{1,12}$' then p_sk := lpad(p_sk, 12, '0'); end if;
  -- Fecha tecleada como DD/MM/AAAA (o DD/MM/AA) → AAAA-MM-DD.
  if p_campo = 'fecha' and p_sk ~ '^\d{1,2}/\d{1,2}/\d{2,4}$' then
    p_sk := to_char(to_date(p_sk, case when length(split_part(p_sk, '/', 3)) = 2 then 'DD/MM/YY' else 'DD/MM/YYYY' end), 'YYYY-MM-DD');
  end if;

  if p_modo = 'lt' then
    v_where := format('%1$s <= $1 and (%1$s < $1 or %2$s < $2)', v_expr, v_k);
    v_ord := format('%s desc, %s desc', v_expr, v_k);
  elsif p_modo = 'gt' then
    v_where := format('%1$s >= $1 and (%1$s > $1 or %2$s > $2)', v_expr, v_k);
    v_ord := format('%s, %s', v_expr, v_k);
  else
    v_where := format('%1$s >= $1 and (%1$s > $1 or %2$s >= $2)', v_expr, v_k);
    v_ord := format('%s, %s', v_expr, v_k);
  end if;
  v_where := v_where || ' and not coalesce(t.oculto, false)';
  if p_omitir_vacios then
    v_where := v_where || format(' and coalesce(t.%I::text, '''') <> ''''', p_campo);
  end if;

  v_sql := format(
    'select coalesce(jsonb_agg(r.j || jsonb_build_object(''_sk'', r.sk, ''_k'', r.k) order by r.sk, r.k), ''[]''::jsonb) '
    || 'from (select %s as j, %s as sk, %s as k from %s where %s order by %s limit $3) r',
    v_cols, v_expr, v_k, v_from, v_where, v_ord);
  execute v_sql into v_res using p_sk, p_k, v_lim;
  return v_res;
end $function$;

grant execute on function public.gw_lista_ordenada_reparto(text, text, text, text, text, text, integer, boolean) to authenticated;
