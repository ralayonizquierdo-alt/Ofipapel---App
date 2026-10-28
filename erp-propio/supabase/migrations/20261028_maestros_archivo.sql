-- Maestros de Archivo y Clientes sin captura (28/10/2026): Códigos Postales, Cód. Bancarios
-- (bancos y sucursales), Monedas y Tipo Cliente.
--
-- 1) Baja lógica: columna `activo` en los cinco maestros (tipo_cliente ya tenía fecha_baja).
--    Nada se borra: «Borrar» en la ficha marca activo = false.
-- 2) Lista ordenada (Ctrl+Intro) de estos maestros: función propia gw_lista_ordenada_archivo,
--    con el mismo contrato que gw_lista_ordenada_maestros (no se toca aquella).
-- RLS: las cinco tablas ya tenían la policy «autenticados_acceso_total_*» (ALL, authenticated),
-- igual que forma_pago. No hace falta ninguna nueva.

alter table public.banco add column if not exists activo boolean not null default true;
alter table public.banco_sucursal add column if not exists activo boolean not null default true;
alter table public.moneda add column if not exists activo boolean not null default true;
alter table public.codigo_postal add column if not exists activo boolean not null default true;
alter table public.tipo_cliente add column if not exists activo boolean not null default true;

-- Los tipos de cliente con fecha de baja ya pasada quedan como baja.
update public.tipo_cliente set activo = false where fecha_baja is not null and fecha_baja <= current_date and activo;

create index if not exists codigo_postal_poblacion_idx on public.codigo_postal (poblacion, codigo_postal);

create or replace function public.gw_lista_ordenada_archivo(
  p_fuente text, p_campo text, p_modo text default 'ge', p_sk text default '', p_k text default '',
  p_ancla text default null, p_limite integer default 60, p_omitir_vacios boolean default false)
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
    when 'codigo_postal' then
      -- Clave compuesta (código postal + población): «08001|BARCELONA».
      v_from := 'codigo_postal t'; v_key := '(t.codigo_postal || ''|'' || t.poblacion)';
      v_campos := array['codigo_postal', 'poblacion'];
      v_cols := 'jsonb_build_object(''codigo'', t.codigo_postal || ''|'' || t.poblacion, ''codigo_postal'', t.codigo_postal, '
        || '''poblacion'', t.poblacion, ''calle'', t.calle, ''provincia_codigo'', t.provincia_codigo, ''activo'', t.activo)';
    when 'banco' then
      v_from := 'banco t'; v_key := 't.codigo'; v_campos := array['codigo', 'nombre'];
      v_cols := 'jsonb_build_object(''codigo'', t.codigo, ''nombre'', t.nombre, ''bic'', t.bic, ''activo'', t.activo)';
    when 'moneda' then
      v_from := 'moneda t'; v_key := 't.codigo'; v_campos := array['codigo', 'descripcion'];
      v_cols := 'jsonb_build_object(''codigo'', t.codigo, ''descripcion'', t.descripcion, ''descripcion_corta'', t.descripcion_corta, ''activo'', t.activo)';
    when 'tipo_cliente' then
      v_from := 'tipo_cliente t'; v_key := 't.codigo'; v_campos := array['codigo', 'descripcion'];
      v_cols := 'jsonb_build_object(''codigo'', t.codigo, ''descripcion'', t.descripcion, ''tarifa_nivel_defecto'', t.tarifa_nivel_defecto, ''activo'', t.activo)';
    else
      raise exception 'Lista ordenada: fuente no permitida (%)', p_fuente;
  end case;
  if not (p_campo = any (v_campos)) then
    raise exception 'Lista ordenada: campo no permitido (%.%)', p_fuente, p_campo;
  end if;
  v_expr := format('(upper(coalesce(t.%I, '''')) collate "C")', p_campo);
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

revoke all on function public.gw_lista_ordenada_archivo(text, text, text, text, text, text, integer, boolean) from public, anon;
grant execute on function public.gw_lista_ordenada_archivo(text, text, text, text, text, text, integer, boolean) to authenticated;
