-- Ctrl+Intro de la ficha de Proveedores respetando «Ver» (todos / solo proveedores / solo
-- acreedores). Función propia con el mismo contrato que gw_lista_ordenada (no se toca aquella).
-- Fuentes: 'proveedor' (todos), 'proveedor_solo' (tipo = proveedor), 'acreedor' (tipo = acreedor).

create or replace function public.gw_lista_ordenada_proveedor(
  p_fuente text, p_campo text, p_modo text default 'ge', p_sk text default '', p_k text default '',
  p_ancla text default null, p_limite integer default 60, p_omitir_vacios boolean default false)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_expr text; v_k text := '(t.codigo collate "C")'; v_tipo text; v_where text; v_ord text; v_res jsonb;
  v_lim int := least(greatest(coalesce(p_limite, 60), 1), 300);
begin
  v_tipo := case p_fuente when 'proveedor' then null when 'proveedor_solo' then 'proveedor' when 'acreedor' then 'acreedor'
    else 'x' end;
  if v_tipo = 'x' then
    raise exception 'Lista ordenada: fuente no permitida (%)', p_fuente;
  end if;
  if p_campo not in ('codigo', 'nombre', 'razon_social', 'nif') then
    raise exception 'Lista ordenada: campo no permitido (%.%)', p_fuente, p_campo;
  end if;
  v_expr := format('(upper(coalesce(t.%I, '''')) collate "C")', p_campo);
  if p_ancla is not null then
    execute format('select %s from proveedor t where t.codigo = $1 limit 1', v_expr) into p_sk using p_ancla;
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
  if v_tipo is not null then
    v_where := v_where || format(' and t.tipo = %L', v_tipo);
  end if;
  if p_omitir_vacios then
    v_where := v_where || format(' and coalesce(t.%I, '''') <> ''''', p_campo);
  end if;
  execute format(
    'select coalesce(jsonb_agg(r.j || jsonb_build_object(''_sk'', r.sk, ''_k'', r.k) order by r.sk, r.k), ''[]''::jsonb) '
    || 'from (select jsonb_build_object(''codigo'', t.codigo, ''nombre'', t.nombre, ''razon_social'', t.razon_social, '
    || '''nif'', t.nif, ''poblacion'', t.poblacion, ''telefono'', coalesce(nullif(t.telefono_fijo, ''''), t.telefono_movil), '
    || '''activo'', t.activo, ''tipo'', t.tipo) as j, '
    || '%s as sk, %s as k from proveedor t where %s order by %s limit $3) r',
    v_expr, v_k, v_where, v_ord) into v_res using p_sk, p_k, v_lim;
  return v_res;
end;
$function$;
revoke all on function public.gw_lista_ordenada_proveedor(text, text, text, text, text, text, integer, boolean) from public, anon;
grant execute on function public.gw_lista_ordenada_proveedor(text, text, text, text, text, text, integer, boolean) to authenticated;
