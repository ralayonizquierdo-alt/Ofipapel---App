-- Empleados de baja siempre al final y en rojo (Luis, 29/10/2026): en la ficha (anterior /
-- siguiente), en Ctrl+Intro y en el buscador. Columna generada baja_orden (0 = activo, 1 = baja:
-- con fecha de baja o desactivado) para ordenar por ella. Idempotente.

alter table public.empleado add column if not exists baja_orden smallint
  generated always as (case when fecha_baja is not null or not activo then 1 else 0 end) stored;
comment on column public.empleado.baja_orden is '0 = activo, 1 = de baja (fecha de baja o desactivado). Para ordenar: los de baja al final.';

create or replace function public.gw_lista_ordenada_maestros(p_fuente text, p_campo text, p_modo text, p_sk text, p_k text, p_ancla text, p_limite integer, p_omitir_vacios boolean)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'public'
as $function$
declare
  v_from text; v_key text; v_cols text; v_campos text[];
  v_expr text; v_k text; v_where text; v_ord text; v_sql text; v_res jsonb;
  v_lim int := least(greatest(coalesce(p_limite, 60), 1), 300);
begin
  case p_fuente
    when 'tienda_terminal' then
      v_from := 'tienda_terminal t'; v_key := 't.codigo'; v_campos := array['codigo', 'descripcion'];
      v_cols := 'jsonb_build_object(''codigo'', t.codigo, ''descripcion'', t.descripcion, ''poblacion'', t.poblacion)';
    when 'forma_pago' then
      v_from := 'forma_pago t'; v_key := 't.codigo'; v_campos := array['codigo', 'descripcion'];
      v_cols := 'jsonb_build_object(''codigo'', t.codigo, ''descripcion'', t.descripcion, ''descripcion_corta'', t.descripcion_corta)';
    when 'empleado' then
      v_from := 'empleado t'; v_key := 't.codigo'; v_campos := array['codigo', 'nombre', 'nombre_corto'];
      v_cols := 'jsonb_build_object(''codigo'', t.codigo, ''nombre'', t.nombre, ''nombre_corto'', t.nombre_corto, ''baja'', t.baja_orden = 1)';
    else
      raise exception 'Lista ordenada: fuente no permitida (%)', p_fuente;
  end case;
  if not (p_campo = any (v_campos)) then
    raise exception 'Lista ordenada: campo no permitido (%.%)', p_fuente, p_campo;
  end if;
  v_expr := format('(upper(coalesce(t.%I, '''')) collate "C")', p_campo);
  -- Empleados de baja, siempre al final (en rojo en la lista: campo «baja»).
  if p_fuente = 'empleado' then
    v_expr := format('((case when t.baja_orden = 1 then ''~'' else '''' end || upper(coalesce(t.%I, ''''))) collate "C")', p_campo);
  end if;
  v_k := format('(%s collate "C")', v_key);
  if p_ancla is not null then
    execute format('select %s from %s where %s = $1 limit 1', v_expr, v_from, v_key) into p_sk using p_ancla;
    if p_sk is null then p_sk := ''; p_k := ''; else p_k := p_ancla; end if;
  end if;
  p_sk := coalesce(p_sk, ''); p_k := coalesce(p_k, '');
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
  if p_omitir_vacios then
    v_where := v_where || format(' and coalesce(t.%I, '''') <> ''''', p_campo);
  end if;
  v_sql := format(
    'select coalesce(jsonb_agg(r.j || jsonb_build_object(''_sk'', r.sk, ''_k'', r.k) order by r.sk, r.k), ''[]''::jsonb) '
    || 'from (select %s as j, %s as sk, %s as k from %s where %s order by %s limit $3) r',
    v_cols, v_expr, v_k, v_from, v_where, v_ord);
  execute v_sql into v_res using p_sk, p_k, v_lim;
  return v_res;
end;
$function$;
