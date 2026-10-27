-- Almacén → Modif. de Artículos en bloque (capturas 06-26 y 06-27) y Plu's (06-25).
--
-- modificacion_articulo: lote con Código, Fecha, Hora, Concepto y Observaciones; «campos»
-- guarda la parametrización de la pestaña Opciones ({campo: {v: visible, a: actualizar}}).
-- modificacion_articulo_linea: un artículo por línea con los valores nuevos en «datos».
-- Al marcar «Actualizado» (fn_modificacion_articulos_aplicar) se copian a la ficha del
-- artículo SOLO los campos marcados «Actualizar», todo en una transacción.
-- articulo_plu: Asignación de Plu's (Cód. Plu → Código Artículo).

create table if not exists public.modificacion_articulo (
  codigo text primary key,
  fecha date default current_date,
  hora text,
  concepto text,
  observaciones text,
  actualizado boolean not null default false,
  fecha_hora_actualizacion timestamptz,
  campos jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists public.modificacion_articulo_linea (
  id bigint generated always as identity primary key,
  modificacion_codigo text not null references public.modificacion_articulo (codigo) on delete cascade,
  articulo_codigo text not null references public.articulo (codigo_interno),
  datos jsonb not null default '{}'::jsonb,
  actualizado_en timestamptz not null default now(),
  unique (modificacion_codigo, articulo_codigo)
);
create index if not exists idx_modificacion_articulo_linea_art on public.modificacion_articulo_linea (articulo_codigo);

create table if not exists public.articulo_plu (
  plu text primary key,
  articulo_codigo text not null references public.articulo (codigo_interno),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_articulo_plu_articulo on public.articulo_plu (articulo_codigo);

alter table public.modificacion_articulo enable row level security;
alter table public.modificacion_articulo_linea enable row level security;
alter table public.articulo_plu enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'modificacion_articulo' and policyname = 'autenticados_acceso_total_modificacion_articulo') then
    create policy autenticados_acceso_total_modificacion_articulo on public.modificacion_articulo for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'modificacion_articulo_linea' and policyname = 'autenticados_acceso_total_modificacion_articulo_linea') then
    create policy autenticados_acceso_total_modificacion_articulo_linea on public.modificacion_articulo_linea for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'articulo_plu' and policyname = 'autenticados_acceso_total_articulo_plu') then
    create policy autenticados_acceso_total_articulo_plu on public.articulo_plu for all to authenticated using (true) with check (true);
  end if;
end $$;

grant select, insert, update, delete on public.modificacion_articulo, public.modificacion_articulo_linea, public.articulo_plu to authenticated;

-- Campos que se pueden actualizar en bloque (los mismos que lista la pestaña Opciones).
create or replace function public.fn_modificacion_articulos_campos()
returns text[] language sql immutable as $$
  select array['codigo_compra_habitual', 'descripcion', 'familia_codigo', 'proveedor_habitual_codigo', 'control_lotes',
               'unidades_por_caja', 'cajas_por_bulto', 'unidad_medida', 'unidad_medida_base', 'unidad_medida_valor',
               'sin_control_stock', 'stock_minimo', 'stock_maximo', 'pedido_recomendado', 'ubicacion_1', 'ubicacion_2',
               'marca_codigo', 'codigo_venta', 'descripcion_corta', 'campo_libre', 'igic_pct', 'plantilla_tarifa_codigo',
               'descuento_maximo_cliente_pct', 'pvp_fijo', 'generico', 'no_ver_en_venta', 'no_ver_en_compra',
               'garantia_meses', 'fecha_baja', 'activo', 'imagen_url', 'web_publicado', 'web_fecha_baja', 'web_sin_imagen',
               'web_sin_observaciones', 'web_sin_oferta', 'web_descripcion_corta_envio', 'web_descripcion',
               'web_categoria', 'web_fabricante', 'observaciones']
$$;

create or replace function public.fn_modificacion_articulos_aplicar(p_codigo text)
returns integer
language plpgsql set search_path = public, pg_temp as $$
declare
  v_cab modificacion_articulo;
  c text;
  t text;
  v_n integer := 0;
  v_campos integer := 0;
begin
  select * into v_cab from modificacion_articulo where codigo = p_codigo for update;
  if not found then raise exception 'No existe la modificación %.', p_codigo; end if;
  for c in select e.key from jsonb_each(v_cab.campos) e where coalesce((e.value->>'a')::boolean, false) loop
    if not c = any (fn_modificacion_articulos_campos()) then
      raise exception 'El campo % no se puede actualizar en bloque.', c;
    end if;
    select format_type(at.atttypid, at.atttypmod) into t
    from pg_attribute at where at.attrelid = 'public.articulo'::regclass and at.attname = c and not at.attisdropped;
    if t is null then raise exception 'El campo % no existe en la ficha de artículos.', c; end if;
    execute format('update articulo a set %1$I = nullif(l.datos->>%2$L, '''')::%3$s, actualizado_en = now()
                    from modificacion_articulo_linea l
                    where l.modificacion_codigo = $1 and l.articulo_codigo = a.codigo_interno and l.datos ? %2$L
                      and a.%1$I is distinct from nullif(l.datos->>%2$L, '''')::%3$s', c, c, t)
      using p_codigo;
    v_campos := v_campos + 1;
  end loop;
  if v_campos = 0 then raise exception 'No hay ningún campo marcado para Actualizar (pestaña Opciones).'; end if;
  select count(*) into v_n from modificacion_articulo_linea where modificacion_codigo = p_codigo;
  update modificacion_articulo set actualizado = true, fecha_hora_actualizacion = now(), actualizado_en = now() where codigo = p_codigo;
  return v_n;
end;
$$;

grant execute on function public.fn_modificacion_articulos_aplicar(text) to authenticated;
revoke execute on function public.fn_modificacion_articulos_aplicar(text) from public, anon;

-- Ctrl+Intro (lista ordenada) de las fichas nuevas de Almacén: Modificación de artículos en
-- bloque (código, concepto) y Plu's (código de plu). Misma mecánica que gw_lista_ordenada_maestros.
create or replace function public.gw_lista_ordenada_almacen(p_fuente text, p_campo text, p_modo text default 'ge', p_sk text default '',
  p_k text default '', p_ancla text default null, p_limite integer default 60, p_omitir_vacios boolean default false)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  v_from text; v_key text; v_cols text; v_campos text[];
  v_expr text; v_k text; v_where text; v_ord text; v_sql text; v_res jsonb;
  v_lim int := least(greatest(coalesce(p_limite, 60), 1), 300);
begin
  case p_fuente
    when 'modificacion_articulo' then
      v_from := 'modificacion_articulo t'; v_key := 't.codigo'; v_campos := array['codigo', 'concepto'];
      v_cols := 'jsonb_build_object(''codigo'', t.codigo, ''concepto'', t.concepto, ''fecha'', to_char(t.fecha, ''DD/MM/YYYY''), ''actualizado'', t.actualizado)';
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
$$;
grant execute on function public.gw_lista_ordenada_almacen(text, text, text, text, text, text, integer, boolean) to authenticated;
revoke execute on function public.gw_lista_ordenada_almacen(text, text, text, text, text, text, integer, boolean) from public, anon;
