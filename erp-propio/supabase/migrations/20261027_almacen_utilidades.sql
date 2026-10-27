-- Menú Almacén: utilidades construidas SIN CAPTURA de GeminisWin (ajustar cuando llegue).
-- List. de Movimientos de Artículos, Creación Ráp. de Artic., Modif. de Artículos en bloque,
-- Puntos de Restauración Stock, Recalcular Stock y Eliminación de Artículos (baja lógica).
-- Todas SECURITY INVOKER: valen las mismas políticas RLS que el resto de la app.

create index if not exists idx_movimiento_stock_ocurrido on public.movimiento_stock (ocurrido_en, id);
create index if not exists idx_movimiento_stock_almacen_ocurrido on public.movimiento_stock (almacen_codigo, ocurrido_en);

-- Inicio del día en hora de Canarias (las fechas de los filtros son días locales).
create or replace function public.fn_dia_canarias(p date)
returns timestamptz language sql immutable set search_path = public, pg_temp as $$
  select (p::timestamp at time zone 'Atlantic/Canary')
$$;

-- ───────────────────────── List. de Movimientos de Artículos ─────────────────────────
-- Detalle paginado con entradas, salidas y saldo acumulado por artículo y almacén. El saldo
-- cuenta TODOS los movimientos anteriores (aunque se filtre por fecha o tipo): es el stock real
-- que había tras cada movimiento.
create or replace function public.fn_listado_movimientos_stock(
  p_art_desde text default null,
  p_art_hasta text default null,
  p_almacen text default null,
  p_desde date default null,
  p_hasta date default null,
  p_tipo text default null,
  p_limite integer default 200,
  p_desplazamiento integer default 0
)
returns table (
  id bigint,
  ocurrido_en timestamptz,
  articulo_codigo text,
  descripcion text,
  almacen_codigo text,
  tipo_movimiento text,
  documento_origen_tipo text,
  documento_origen_tienda_codigo text,
  documento_origen_numero bigint,
  documento_origen_linea integer,
  entrada numeric,
  salida numeric,
  saldo numeric,
  costo_unitario numeric,
  observaciones text,
  total_filas bigint,
  total_entradas numeric,
  total_salidas numeric
)
language sql stable set search_path = public, pg_temp as $$
  with base as (
    select m.*,
           sum(m.sentido * m.cantidad) over (partition by m.articulo_codigo, m.almacen_codigo order by m.ocurrido_en, m.id) as saldo_acum
    from movimiento_stock m
    where (nullif(p_art_desde, '') is null or m.articulo_codigo >= p_art_desde)
      and (nullif(p_art_hasta, '') is null or m.articulo_codigo <= p_art_hasta)
      and (nullif(p_almacen, '') is null or m.almacen_codigo = p_almacen)
      and (p_hasta is null or m.ocurrido_en < fn_dia_canarias(p_hasta + 1))
  ),
  f as (
    select b.*,
           case when b.sentido = 1 then b.cantidad else 0 end as ent,
           case when b.sentido = -1 then b.cantidad else 0 end as sal
    from base b
    where (p_desde is null or b.ocurrido_en >= fn_dia_canarias(p_desde))
      and (nullif(p_tipo, '') is null or b.tipo_movimiento = p_tipo)
  )
  select f.id, f.ocurrido_en, f.articulo_codigo, a.descripcion, f.almacen_codigo, f.tipo_movimiento,
         f.documento_origen_tipo, f.documento_origen_tienda_codigo, f.documento_origen_numero, f.documento_origen_linea,
         f.ent, f.sal, f.saldo_acum, f.costo_unitario, f.observaciones,
         count(*) over (), sum(f.ent) over (), sum(f.sal) over ()
  from f
  left join articulo a on a.codigo_interno = f.articulo_codigo
  order by f.articulo_codigo, f.almacen_codigo, f.ocurrido_en, f.id
  limit greatest(1, least(coalesce(p_limite, 200), 1000)) offset greatest(0, coalesce(p_desplazamiento, 0))
$$;

-- Resumen por artículo y almacén: saldo inicial (antes de «desde»), entradas, salidas y saldo final.
create or replace function public.fn_resumen_movimientos_stock(
  p_art_desde text default null,
  p_art_hasta text default null,
  p_almacen text default null,
  p_desde date default null,
  p_hasta date default null,
  p_tipo text default null,
  p_limite integer default 200,
  p_desplazamiento integer default 0
)
returns table (
  articulo_codigo text,
  descripcion text,
  almacen_codigo text,
  saldo_inicial numeric,
  entradas numeric,
  salidas numeric,
  saldo_final numeric,
  movimientos bigint,
  total_filas bigint,
  total_entradas numeric,
  total_salidas numeric
)
language sql stable set search_path = public, pg_temp as $$
  with g as (
    select m.articulo_codigo, m.almacen_codigo,
           sum(case when p_desde is not null and m.ocurrido_en < fn_dia_canarias(p_desde) then m.sentido * m.cantidad else 0 end) as ini,
           sum(case when (p_desde is null or m.ocurrido_en >= fn_dia_canarias(p_desde)) and (nullif(p_tipo, '') is null or m.tipo_movimiento = p_tipo) and m.sentido = 1 then m.cantidad else 0 end) as ent,
           sum(case when (p_desde is null or m.ocurrido_en >= fn_dia_canarias(p_desde)) and (nullif(p_tipo, '') is null or m.tipo_movimiento = p_tipo) and m.sentido = -1 then m.cantidad else 0 end) as sal,
           sum(m.sentido * m.cantidad) as fin,
           count(*) filter (where (p_desde is null or m.ocurrido_en >= fn_dia_canarias(p_desde)) and (nullif(p_tipo, '') is null or m.tipo_movimiento = p_tipo)) as n
    from movimiento_stock m
    where (nullif(p_art_desde, '') is null or m.articulo_codigo >= p_art_desde)
      and (nullif(p_art_hasta, '') is null or m.articulo_codigo <= p_art_hasta)
      and (nullif(p_almacen, '') is null or m.almacen_codigo = p_almacen)
      and (p_hasta is null or m.ocurrido_en < fn_dia_canarias(p_hasta + 1))
    group by m.articulo_codigo, m.almacen_codigo
  ),
  f as (select * from g where g.n > 0)
  select f.articulo_codigo, a.descripcion, f.almacen_codigo, f.ini, f.ent, f.sal, f.fin, f.n,
         count(*) over (), sum(f.ent) over (), sum(f.sal) over ()
  from f
  left join articulo a on a.codigo_interno = f.articulo_codigo
  order by f.articulo_codigo, f.almacen_codigo
  limit greatest(1, least(coalesce(p_limite, 200), 1000)) offset greatest(0, coalesce(p_desplazamiento, 0))
$$;

-- ───────────────────────── Creación Ráp. de Artic. ─────────────────────────
-- p_filas: [{codigo, descripcion, familia, marca, proveedor, codigo_compra, coste, pvp,
--            plantilla, igic, codigo_barras}]. Valida todo; si hay un solo error no crea nada.
-- Con p_validar_solo = true solo devuelve los errores (vista previa).
create or replace function public.fn_articulos_alta_rapida(p_filas jsonb, p_validar_solo boolean default false)
returns table (fila integer, codigo text, error text)
language plpgsql set search_path = public, pg_temp as $$
declare
  r record;
  v_err text;
  v_errores int := 0;
  v_plantilla text;
  v_coste numeric;
  v_pvp numeric;
  v_general numeric;
  v_barras text;
  v_res jsonb := '[]'::jsonb;
  n record;
begin
  if jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'No hay filas que crear.';
  end if;

  for r in
    select (x.ord - 1)::int as i,
           upper(trim(coalesce(x.v->>'codigo', ''))) as cod,
           trim(coalesce(x.v->>'descripcion', '')) as des,
           nullif(trim(coalesce(x.v->>'familia', '')), '') as fam,
           nullif(trim(coalesce(x.v->>'marca', '')), '') as mar,
           nullif(trim(coalesce(x.v->>'proveedor', '')), '') as prov,
           nullif(trim(coalesce(x.v->>'codigo_compra', '')), '') as ccompra,
           nullif(x.v->>'coste', '')::numeric as coste,
           nullif(x.v->>'pvp', '')::numeric as pvp,
           nullif(trim(coalesce(x.v->>'plantilla', '')), '') as plan,
           nullif(x.v->>'igic', '')::numeric as igic,
           nullif(trim(coalesce(x.v->>'codigo_barras', '')), '') as barras
    from jsonb_array_elements(p_filas) with ordinality as x(v, ord)
  loop
    v_err := null;
    if r.cod = '' then v_err := 'Falta el código.';
    elsif length(r.cod) > 20 then v_err := 'El código tiene más de 20 caracteres.';
    elsif r.des = '' then v_err := 'Falta la descripción.';
    elsif exists (select 1 from articulo a where upper(a.codigo_interno) = r.cod) then v_err := 'Ya existe un artículo con ese código.';
    elsif (select count(*) from jsonb_array_elements(p_filas) y where upper(trim(coalesce(y->>'codigo', ''))) = r.cod) > 1 then v_err := 'Código repetido en la rejilla.';
    elsif r.fam is not null and not exists (select 1 from familia f where f.codigo = r.fam) then v_err := 'La familia ' || r.fam || ' no existe.';
    elsif r.mar is not null and not exists (select 1 from marca m where m.codigo = r.mar) then v_err := 'La marca ' || r.mar || ' no existe.';
    elsif r.prov is not null and not exists (select 1 from proveedor p where p.codigo = r.prov) then v_err := 'El proveedor ' || r.prov || ' no existe.';
    elsif r.plan is not null and not exists (select 1 from plantilla_tarifa t where t.codigo = r.plan) then v_err := 'La plantilla de tarifa ' || r.plan || ' no existe.';
    elsif r.coste is not null and r.coste < 0 then v_err := 'Coste negativo.';
    elsif r.pvp is not null and r.pvp < 0 then v_err := 'PVP negativo.';
    elsif r.igic is not null and (r.igic < 0 or r.igic > 100) then v_err := 'IGIC fuera de rango.';
    elsif r.barras is not null and r.barras ~ '^\d{13}$'
          and (10 - ((select sum(substr(r.barras, k, 1)::int * case when k % 2 = 0 then 3 else 1 end) from generate_series(1, 12) k) % 10)) % 10 <> substr(r.barras, 13, 1)::int
      then v_err := 'El código de barras EAN-13 tiene mal el dígito de control.';
    elsif r.barras is not null and (exists (select 1 from articulo a where a.codigo_barras_principal = r.barras)
                                     or exists (select 1 from articulo_codigo_barras b where b.codigo_barras = r.barras))
      then v_err := 'El código de barras ya está asignado a otro artículo.';
    elsif r.barras is not null and (select count(*) from jsonb_array_elements(p_filas) y where trim(coalesce(y->>'codigo_barras', '')) = r.barras) > 1
      then v_err := 'Código de barras repetido en la rejilla.';
    elsif r.pvp is null and r.plan is null and coalesce((select f.plantilla_tarifa_codigo from familia f where f.codigo = r.fam), '') = '' then
      v_err := 'Indica el PVP o una plantilla de tarifa.';
    end if;
    if v_err is not null then v_errores := v_errores + 1; end if;
    v_res := v_res || jsonb_build_object('fila', r.i, 'codigo', r.cod, 'error', v_err);
  end loop;

  if v_errores = 0 and not p_validar_solo then
    for r in
      select (x.ord - 1)::int as i,
             upper(trim(x.v->>'codigo')) as cod,
             trim(x.v->>'descripcion') as des,
             nullif(trim(coalesce(x.v->>'familia', '')), '') as fam,
             nullif(trim(coalesce(x.v->>'marca', '')), '') as mar,
             nullif(trim(coalesce(x.v->>'proveedor', '')), '') as prov,
             nullif(trim(coalesce(x.v->>'codigo_compra', '')), '') as ccompra,
             nullif(x.v->>'coste', '')::numeric as coste,
             nullif(x.v->>'pvp', '')::numeric as pvp,
             nullif(trim(coalesce(x.v->>'plantilla', '')), '') as plan,
             nullif(x.v->>'igic', '')::numeric as igic,
             nullif(trim(coalesce(x.v->>'codigo_barras', '')), '') as barras
      from jsonb_array_elements(p_filas) with ordinality as x(v, ord)
    loop
      v_plantilla := coalesce(r.plan, (select nullif(f.plantilla_tarifa_codigo, '') from familia f where f.codigo = r.fam));
      v_coste := coalesce(r.coste, 0);
      -- PVP General: el tecleado o, si no hay, el de la plantilla sobre el coste.
      v_general := r.pvp;
      if v_general is null then
        select round(v_coste * (1 + coalesce(pn.incremento_pct, 0) / 100), 3) into v_general
        from plantilla_tarifa_nivel pn where pn.plantilla_tarifa_codigo = v_plantilla and pn.nivel_tarifa = 0;
      end if;
      v_general := coalesce(v_general, 0);
      v_barras := r.barras;

      insert into articulo (codigo_interno, descripcion, familia_codigo, marca_codigo, proveedor_habitual_codigo, codigo_compra_habitual,
                            codigo_barras_principal, coste_puro, coste_neto, coste_bruto, precio_liquidado, coste_usado_calculo_pvp,
                            igic_pct, plantilla_tarifa_codigo, pvp, fecha_alta, fecha_ultima_modificacion_pvp, activo, observaciones_info)
      values (r.cod, r.des, r.fam, r.mar, r.prov, r.ccompra, v_barras, r.coste, r.coste, r.coste, r.coste, r.coste,
              coalesce(r.igic, 7), v_plantilla, v_general, current_date, now(), true, 'Alta por Creación Rápida de Artículos');

      -- Niveles de tarifa: los de la plantilla (P = margen sobre coste, D = descuento sobre la General)
      -- y la General siempre con el PVP final.
      insert into articulo_precio_nivel (articulo_codigo, nivel_tarifa, pvp, incremento_pct, modo_calculo, permite_descuento_linea)
      select r.cod, 0, v_general,
             case when v_coste > 0 then round((v_general / v_coste - 1) * 100, 2) end,
             'P', coalesce((select pn.permite_descuento_linea from plantilla_tarifa_nivel pn where pn.plantilla_tarifa_codigo = v_plantilla and pn.nivel_tarifa = 0), true);
      for n in select * from plantilla_tarifa_nivel pn where pn.plantilla_tarifa_codigo = v_plantilla and pn.nivel_tarifa > 0 loop
        v_pvp := case when n.modo_calculo = 'D' then round(v_general * (1 - coalesce(n.incremento_pct, 0) / 100), 3)
                      else round(v_coste * (1 + coalesce(n.incremento_pct, 0) / 100), 3) end;
        insert into articulo_precio_nivel (articulo_codigo, nivel_tarifa, pvp, incremento_pct, modo_calculo, permite_descuento_linea)
        values (r.cod, n.nivel_tarifa, v_pvp, n.incremento_pct, n.modo_calculo, coalesce(n.permite_descuento_linea, true));
      end loop;

      if v_barras is not null then
        insert into articulo_codigo_barras (articulo_codigo, proveedor_codigo, codigo_barras, digitos_barras, unidades_por_codigo)
        values (r.cod, r.prov, v_barras, length(v_barras), 1);
      end if;
      if r.prov is not null then
        insert into articulo_proveedor (articulo_codigo, proveedor_codigo, codigo_compra, coste_puro, coste_neto, coste_bruto)
        values (r.cod, r.prov, r.ccompra, r.coste, r.coste, r.coste);
      end if;
    end loop;
  end if;

  return query
    select (e->>'fila')::int, e->>'codigo', e->>'error'
    from jsonb_array_elements(v_res) e;
end;
$$;

-- ───────────────────────── Modif. de Artículos en bloque ─────────────────────────
-- p_filtro: {familia, marca, proveedor, desde, hasta, texto, estado: 'activos'|'bajas'|'todos'}
-- p_cambios: solo las claves permitidas (ver abajo). Con p_aplicar = false es la vista previa.
-- Una sola sentencia UPDATE: todo o nada.
create or replace function public.fn_articulos_bloque(
  p_filtro jsonb,
  p_cambios jsonb default '{}'::jsonb,
  p_aplicar boolean default false,
  p_limite integer default 300
)
returns table (
  codigo_interno text,
  descripcion text,
  familia_codigo text,
  marca_codigo text,
  proveedor_habitual_codigo text,
  igic_pct numeric,
  plantilla_tarifa_codigo text,
  activo boolean,
  web_publicado boolean,
  no_ver_en_venta boolean,
  total bigint
)
language plpgsql set search_path = public, pg_temp as $$
declare
  v_fam text := nullif(trim(coalesce(p_filtro->>'familia', '')), '');
  v_mar text := nullif(trim(coalesce(p_filtro->>'marca', '')), '');
  v_prov text := nullif(trim(coalesce(p_filtro->>'proveedor', '')), '');
  v_desde text := nullif(trim(coalesce(p_filtro->>'desde', '')), '');
  v_hasta text := nullif(trim(coalesce(p_filtro->>'hasta', '')), '');
  v_texto text := nullif(trim(coalesce(p_filtro->>'texto', '')), '');
  v_estado text := coalesce(nullif(p_filtro->>'estado', ''), 'activos');
  v_permitidas text[] := array['familia_codigo', 'marca_codigo', 'proveedor_habitual_codigo', 'igic_pct', 'plantilla_tarifa_codigo',
                               'activo', 'web_publicado', 'no_ver_en_venta', 'sin_control_stock', 'descuento_maximo_cliente_pct'];
  v_clave text;
  v_n bigint;
begin
  if p_aplicar then
    if v_fam is null and v_mar is null and v_prov is null and v_desde is null and v_hasta is null and v_texto is null then
      raise exception 'Por seguridad, la modificación en bloque necesita al menos un filtro.';
    end if;
    if p_cambios is null or p_cambios = '{}'::jsonb then
      raise exception 'No hay ningún cambio marcado.';
    end if;
    for v_clave in select jsonb_object_keys(p_cambios) loop
      if not v_clave = any (v_permitidas) then
        raise exception 'El campo % no se puede modificar en bloque.', v_clave;
      end if;
    end loop;
    if p_cambios ? 'familia_codigo' and p_cambios->>'familia_codigo' is not null and not exists (select 1 from familia f where f.codigo = p_cambios->>'familia_codigo') then
      raise exception 'La familia % no existe.', p_cambios->>'familia_codigo';
    end if;
    if p_cambios ? 'marca_codigo' and p_cambios->>'marca_codigo' is not null and not exists (select 1 from marca m where m.codigo = p_cambios->>'marca_codigo') then
      raise exception 'La marca % no existe.', p_cambios->>'marca_codigo';
    end if;

    update articulo a set
      familia_codigo = case when p_cambios ? 'familia_codigo' then p_cambios->>'familia_codigo' else a.familia_codigo end,
      marca_codigo = case when p_cambios ? 'marca_codigo' then p_cambios->>'marca_codigo' else a.marca_codigo end,
      proveedor_habitual_codigo = case when p_cambios ? 'proveedor_habitual_codigo' then p_cambios->>'proveedor_habitual_codigo' else a.proveedor_habitual_codigo end,
      igic_pct = case when p_cambios ? 'igic_pct' then (p_cambios->>'igic_pct')::numeric else a.igic_pct end,
      plantilla_tarifa_codigo = case when p_cambios ? 'plantilla_tarifa_codigo' then p_cambios->>'plantilla_tarifa_codigo' else a.plantilla_tarifa_codigo end,
      activo = case when p_cambios ? 'activo' then (p_cambios->>'activo')::boolean else a.activo end,
      fecha_baja = case when p_cambios ? 'activo' then (case when (p_cambios->>'activo')::boolean then null else coalesce(a.fecha_baja, current_date) end) else a.fecha_baja end,
      web_publicado = case when p_cambios ? 'web_publicado' then (p_cambios->>'web_publicado')::boolean else a.web_publicado end,
      no_ver_en_venta = case when p_cambios ? 'no_ver_en_venta' then (p_cambios->>'no_ver_en_venta')::boolean else a.no_ver_en_venta end,
      sin_control_stock = case when p_cambios ? 'sin_control_stock' then (p_cambios->>'sin_control_stock')::boolean else a.sin_control_stock end,
      descuento_maximo_cliente_pct = case when p_cambios ? 'descuento_maximo_cliente_pct' then (p_cambios->>'descuento_maximo_cliente_pct')::numeric else a.descuento_maximo_cliente_pct end
    where (v_fam is null or a.familia_codigo = v_fam)
      and (v_mar is null or a.marca_codigo = v_mar)
      and (v_prov is null or a.proveedor_habitual_codigo = v_prov)
      and (v_desde is null or a.codigo_interno >= v_desde)
      and (v_hasta is null or a.codigo_interno <= v_hasta)
      and (v_texto is null or a.descripcion ilike '%' || v_texto || '%' or a.codigo_interno ilike '%' || v_texto || '%')
      and (v_estado = 'todos' or (v_estado = 'activos' and a.activo) or (v_estado = 'bajas' and not a.activo));
    get diagnostics v_n = row_count;
    -- Tras aplicar, los que cumplen el filtro pueden haber cambiado (p. ej. de familia): se devuelve solo el recuento.
    return query select null::text, ('Modificados ' || v_n || ' artículos')::text, null::text, null::text, null::text, null::numeric,
                        null::text, null::boolean, null::boolean, null::boolean, v_n;
    return;
  end if;

  return query
    with f as (
      select a.* from articulo a
      where (v_fam is null or a.familia_codigo = v_fam)
        and (v_mar is null or a.marca_codigo = v_mar)
        and (v_prov is null or a.proveedor_habitual_codigo = v_prov)
        and (v_desde is null or a.codigo_interno >= v_desde)
        and (v_hasta is null or a.codigo_interno <= v_hasta)
        and (v_texto is null or a.descripcion ilike '%' || v_texto || '%' or a.codigo_interno ilike '%' || v_texto || '%')
        and (v_estado = 'todos' or (v_estado = 'activos' and a.activo) or (v_estado = 'bajas' and not a.activo))
    )
    select f.codigo_interno, f.descripcion, f.familia_codigo, f.marca_codigo, f.proveedor_habitual_codigo, f.igic_pct,
           f.plantilla_tarifa_codigo, f.activo, f.web_publicado, f.no_ver_en_venta, count(*) over ()
    from f order by f.codigo_interno
    limit greatest(1, least(coalesce(p_limite, 300), 1000));
end;
$$;

-- ───────────────────────── Puntos de Restauración Stock ─────────────────────────
-- Crea un punto con el stock actual (por almacén o de todos), opcionalmente por rango de artículos.
create or replace function public.fn_punto_restauracion_crear(
  p_tienda text,
  p_almacen text,
  p_concepto text,
  p_art_desde text default null,
  p_art_hasta text default null,
  p_solo_con_stock boolean default true
)
returns bigint
language plpgsql set search_path = public, pg_temp as $$
declare
  v_numero bigint;
  v_lineas bigint;
begin
  if coalesce(p_tienda, '') = '' then raise exception 'Indica la tienda.'; end if;
  v_numero := fn_siguiente_numero(p_tienda, 'punto_restauracion_stock', '');
  insert into punto_restauracion_stock (tienda_terminal_codigo, numero, concepto, fecha, almacen_desde_codigo, almacen_hasta_codigo,
                                        documento_externo, origen_tipo, tipo_punto_restauracion, observaciones)
  values (p_tienda, v_numero, nullif(trim(coalesce(p_concepto, '')), ''), current_date, nullif(p_almacen, ''), nullif(p_almacen, ''),
          'USR_STK', 'manual', case when p_solo_con_stock then 1 else 2 end,
          concat_ws(' · ', 'Creado desde Puntos de Restauración Stock',
                    case when coalesce(p_art_desde, '') <> '' or coalesce(p_art_hasta, '') <> '' then 'artículos ' || coalesce(p_art_desde, '') || ' a ' || coalesce(p_art_hasta, '') end));
  insert into punto_restauracion_stock_linea (tienda_terminal_codigo, numero, numero_linea, articulo_codigo, descripcion, almacen_codigo,
                                              precio, cantidad_antes_de_restaurar, cantidad_inicial, fecha_stock_inicial)
  select p_tienda, v_numero, row_number() over (order by s.almacen_codigo, s.articulo_codigo), s.articulo_codigo, a.descripcion, s.almacen_codigo,
         a.coste_bruto, s.cantidad_actual, s.cantidad_actual, now()
  from articulo_almacen_stock s
  join articulo a on a.codigo_interno = s.articulo_codigo
  where (nullif(p_almacen, '') is null or s.almacen_codigo = p_almacen)
    and (nullif(p_art_desde, '') is null or s.articulo_codigo >= p_art_desde)
    and (nullif(p_art_hasta, '') is null or s.articulo_codigo <= p_art_hasta)
    and (not p_solo_con_stock or s.cantidad_actual <> 0);
  get diagnostics v_lineas = row_count;
  if v_lineas = 0 then raise exception 'No hay ningún artículo con stock que guardar con ese filtro.'; end if;
  return v_numero;
end;
$$;

-- Compara el punto con el stock actual (paginado). La cantidad del punto es cantidad_inicial
-- (o cantidad_antes_de_restaurar en los puntos antiguos de inventarios, que guardan lo mismo).
create or replace function public.fn_punto_restauracion_comparar(
  p_tienda text,
  p_numero bigint,
  p_solo_diferencias boolean default false,
  p_limite integer default 300,
  p_desplazamiento integer default 0
)
returns table (
  numero_linea bigint,
  articulo_codigo text,
  descripcion text,
  almacen_codigo text,
  cantidad_punto numeric,
  cantidad_actual numeric,
  diferencia numeric,
  total_filas bigint,
  total_diferencias bigint
)
language sql stable set search_path = public, pg_temp as $$
  with l as (
    select pl.numero_linea, pl.articulo_codigo, coalesce(pl.descripcion, a.descripcion) as descripcion, pl.almacen_codigo,
           coalesce(pl.cantidad_inicial, pl.cantidad_antes_de_restaurar, 0) as q_punto,
           coalesce(s.cantidad_actual, 0) as q_actual
    from punto_restauracion_stock_linea pl
    left join articulo a on a.codigo_interno = pl.articulo_codigo
    left join articulo_almacen_stock s on s.articulo_codigo = pl.articulo_codigo and s.almacen_codigo = pl.almacen_codigo
    where pl.tienda_terminal_codigo = p_tienda and pl.numero = p_numero
  ),
  f as (select l.*, l.q_punto - l.q_actual as dif, count(*) filter (where l.q_punto <> l.q_actual) over () as n_dif from l)
  select f.numero_linea, f.articulo_codigo, f.descripcion, f.almacen_codigo, f.q_punto, f.q_actual, f.dif,
         count(*) over (), f.n_dif
  from f
  where not p_solo_diferencias or f.dif <> 0
  order by f.almacen_codigo, f.articulo_codigo
  limit greatest(1, least(coalesce(p_limite, 300), 1000)) offset greatest(0, coalesce(p_desplazamiento, 0))
$$;

-- Restaura: genera un movimiento de regularización por la diferencia de cada línea (el trigger
-- de movimiento_stock deja el stock como estaba en el punto). Devuelve el nº de movimientos.
create or replace function public.fn_punto_restauracion_restaurar(p_tienda text, p_numero bigint, p_forzar boolean default false)
returns integer
language plpgsql set search_path = public, pg_temp as $$
declare
  v_cab punto_restauracion_stock;
  v_n integer;
begin
  select * into v_cab from punto_restauracion_stock where tienda_terminal_codigo = p_tienda and numero = p_numero for update;
  if not found then raise exception 'No existe el punto de restauración %-%.', p_tienda, p_numero; end if;
  if v_cab.fecha_hora_restaurado is not null and not p_forzar then
    raise exception 'Este punto ya se restauró el %.', to_char(v_cab.fecha_hora_restaurado at time zone 'Atlantic/Canary', 'DD/MM/YYYY HH24:MI');
  end if;
  insert into movimiento_stock (tipo_movimiento, sentido, almacen_codigo, articulo_codigo, cantidad, costo_unitario,
                                documento_origen_tipo, documento_origen_tienda_codigo, documento_origen_numero, documento_origen_linea,
                                tienda_terminal_codigo, empleado_codigo, observaciones)
  select 'regularizacion', case when d.dif > 0 then 1 else -1 end, d.almacen_codigo, d.articulo_codigo, abs(d.dif), d.precio,
         'punto_restauracion_stock', p_tienda, p_numero, d.numero_linea::int, p_tienda, fn_empleado_actual(),
         'Restauración del punto ' || p_tienda || '-' || p_numero
  from (
    select pl.numero_linea, pl.articulo_codigo, pl.almacen_codigo, pl.precio,
           round(coalesce(pl.cantidad_inicial, pl.cantidad_antes_de_restaurar, 0) - coalesce(s.cantidad_actual, 0), 3) as dif
    from punto_restauracion_stock_linea pl
    left join articulo_almacen_stock s on s.articulo_codigo = pl.articulo_codigo and s.almacen_codigo = pl.almacen_codigo
    where pl.tienda_terminal_codigo = p_tienda and pl.numero = p_numero and pl.almacen_codigo is not null
  ) d
  where d.dif <> 0;
  get diagnostics v_n = row_count;
  update punto_restauracion_stock set fecha_hora_restaurado = now(), actualizado_en = now()
  where tienda_terminal_codigo = p_tienda and numero = p_numero;
  return v_n;
end;
$$;

-- ───────────────────────── Recalcular Stock ─────────────────────────
-- Diferencias entre articulo_almacen_stock y la suma de movimiento_stock.
create or replace function public.fn_recalcular_stock_diferencias(
  p_almacen text default null,
  p_art_desde text default null,
  p_art_hasta text default null,
  p_limite integer default 300,
  p_desplazamiento integer default 0
)
returns table (
  articulo_codigo text,
  descripcion text,
  almacen_codigo text,
  stock_actual numeric,
  stock_movimientos numeric,
  diferencia numeric,
  total_filas bigint
)
language sql stable set search_path = public, pg_temp as $$
  with m as (
    select mv.articulo_codigo, mv.almacen_codigo, sum(mv.sentido * mv.cantidad) as q
    from movimiento_stock mv
    where (nullif(p_almacen, '') is null or mv.almacen_codigo = p_almacen)
      and (nullif(p_art_desde, '') is null or mv.articulo_codigo >= p_art_desde)
      and (nullif(p_art_hasta, '') is null or mv.articulo_codigo <= p_art_hasta)
    group by 1, 2
  ),
  s as (
    select st.articulo_codigo, st.almacen_codigo, st.cantidad_actual as q
    from articulo_almacen_stock st
    where (nullif(p_almacen, '') is null or st.almacen_codigo = p_almacen)
      and (nullif(p_art_desde, '') is null or st.articulo_codigo >= p_art_desde)
      and (nullif(p_art_hasta, '') is null or st.articulo_codigo <= p_art_hasta)
  ),
  d as (
    select coalesce(s.articulo_codigo, m.articulo_codigo) as art, coalesce(s.almacen_codigo, m.almacen_codigo) as alm,
           coalesce(s.q, 0) as q_s, coalesce(m.q, 0) as q_m
    from s full join m on m.articulo_codigo = s.articulo_codigo and m.almacen_codigo = s.almacen_codigo
    where coalesce(s.q, 0) <> coalesce(m.q, 0)
  )
  select d.art, a.descripcion, d.alm, d.q_s, d.q_m, d.q_m - d.q_s, count(*) over ()
  from d left join articulo a on a.codigo_interno = d.art
  order by d.alm, d.art
  limit greatest(1, least(coalesce(p_limite, 300), 1000)) offset greatest(0, coalesce(p_desplazamiento, 0))
$$;

-- Aplica: deja cantidad_actual = suma de movimientos (en una sola transacción). Devuelve las filas corregidas.
create or replace function public.fn_recalcular_stock_aplicar(
  p_almacen text default null,
  p_art_desde text default null,
  p_art_hasta text default null
)
returns integer
language plpgsql set search_path = public, pg_temp as $$
declare
  v_n integer := 0;
  v_i integer := 0;
begin
  update articulo_almacen_stock st
     set cantidad_actual = coalesce((select sum(mv.sentido * mv.cantidad) from movimiento_stock mv
                                     where mv.articulo_codigo = st.articulo_codigo and mv.almacen_codigo = st.almacen_codigo), 0),
         actualizado_en = now()
   where (nullif(p_almacen, '') is null or st.almacen_codigo = p_almacen)
     and (nullif(p_art_desde, '') is null or st.articulo_codigo >= p_art_desde)
     and (nullif(p_art_hasta, '') is null or st.articulo_codigo <= p_art_hasta)
     and st.cantidad_actual <> coalesce((select sum(mv.sentido * mv.cantidad) from movimiento_stock mv
                                         where mv.articulo_codigo = st.articulo_codigo and mv.almacen_codigo = st.almacen_codigo), 0);
  get diagnostics v_n = row_count;

  insert into articulo_almacen_stock (articulo_codigo, almacen_codigo, cantidad_actual)
  select mv.articulo_codigo, mv.almacen_codigo, sum(mv.sentido * mv.cantidad)
  from movimiento_stock mv
  where (nullif(p_almacen, '') is null or mv.almacen_codigo = p_almacen)
    and (nullif(p_art_desde, '') is null or mv.articulo_codigo >= p_art_desde)
    and (nullif(p_art_hasta, '') is null or mv.articulo_codigo <= p_art_hasta)
    and not exists (select 1 from articulo_almacen_stock st where st.articulo_codigo = mv.articulo_codigo and st.almacen_codigo = mv.almacen_codigo)
  group by 1, 2
  having sum(mv.sentido * mv.cantidad) <> 0;
  get diagnostics v_i = row_count;
  return v_n + v_i;
end;
$$;

-- ───────────────────────── Eliminación de Artículos (baja lógica) ─────────────────────────
-- Revisión: cuántos movimientos, stock y líneas de documentos tiene cada artículo.
create or replace function public.fn_articulos_eliminacion_revisar(
  p_desde text default null,
  p_hasta text default null,
  p_texto text default null,
  p_familia text default null,
  p_limite integer default 300
)
returns table (
  codigo_interno text,
  descripcion text,
  familia_codigo text,
  activo boolean,
  movimientos bigint,
  stock_total numeric,
  documentos bigint,
  total bigint
)
language sql stable set search_path = public, pg_temp as $$
  with f as (
    select a.codigo_interno, a.descripcion, a.familia_codigo, a.activo
    from articulo a
    where (nullif(p_desde, '') is null or a.codigo_interno >= p_desde)
      and (nullif(p_hasta, '') is null or a.codigo_interno <= p_hasta)
      and (nullif(p_familia, '') is null or a.familia_codigo = p_familia)
      and (nullif(p_texto, '') is null or a.descripcion ilike '%' || p_texto || '%' or a.codigo_interno ilike '%' || p_texto || '%')
    order by a.codigo_interno
    limit greatest(1, least(coalesce(p_limite, 300), 1000))
  )
  select f.codigo_interno, f.descripcion, f.familia_codigo, f.activo,
         (select count(*) from movimiento_stock m where m.articulo_codigo = f.codigo_interno),
         coalesce((select sum(s.cantidad_actual) from articulo_almacen_stock s where s.articulo_codigo = f.codigo_interno), 0),
         (select count(*) from venta_linea v where v.articulo_codigo = f.codigo_interno)
           + (select count(*) from pedido_cliente_linea p where p.articulo_codigo = f.codigo_interno)
           + (select count(*) from pedido_proveedor_linea p where p.articulo_codigo = f.codigo_interno),
         (select count(*) from articulo a2
           where (nullif(p_desde, '') is null or a2.codigo_interno >= p_desde)
             and (nullif(p_hasta, '') is null or a2.codigo_interno <= p_hasta)
             and (nullif(p_familia, '') is null or a2.familia_codigo = p_familia)
             and (nullif(p_texto, '') is null or a2.descripcion ilike '%' || p_texto || '%' or a2.codigo_interno ilike '%' || p_texto || '%'))
  from f
  order by f.codigo_interno
$$;

-- Da de baja (activo = false, fecha de baja hoy) SOLO los artículos sin movimientos de stock,
-- sin stock y sin líneas en ventas/pedidos. No borra nada.
create or replace function public.fn_articulos_eliminacion_baja(p_codigos text[])
returns table (codigo_interno text, resultado text)
language plpgsql set search_path = public, pg_temp as $$
declare
  c text;
begin
  foreach c in array coalesce(p_codigos, array[]::text[]) loop
    if not exists (select 1 from articulo a where a.codigo_interno = c) then
      codigo_interno := c; resultado := 'No existe'; return next;
    elsif exists (select 1 from movimiento_stock m where m.articulo_codigo = c) then
      codigo_interno := c; resultado := 'Tiene movimientos de stock: no se da de baja'; return next;
    elsif exists (select 1 from articulo_almacen_stock s where s.articulo_codigo = c and s.cantidad_actual <> 0) then
      codigo_interno := c; resultado := 'Tiene stock: no se da de baja'; return next;
    elsif exists (select 1 from venta_linea v where v.articulo_codigo = c)
       or exists (select 1 from pedido_cliente_linea p where p.articulo_codigo = c)
       or exists (select 1 from pedido_proveedor_linea p where p.articulo_codigo = c) then
      codigo_interno := c; resultado := 'Está en ventas o pedidos: no se da de baja'; return next;
    else
      update articulo a set activo = false, fecha_baja = coalesce(a.fecha_baja, current_date), web_publicado = false where a.codigo_interno = c;
      codigo_interno := c; resultado := 'Dado de baja'; return next;
    end if;
  end loop;
end;
$$;

grant execute on function public.fn_listado_movimientos_stock(text, text, text, date, date, text, integer, integer) to authenticated;
grant execute on function public.fn_resumen_movimientos_stock(text, text, text, date, date, text, integer, integer) to authenticated;
grant execute on function public.fn_articulos_alta_rapida(jsonb, boolean) to authenticated;
grant execute on function public.fn_articulos_bloque(jsonb, jsonb, boolean, integer) to authenticated;
grant execute on function public.fn_punto_restauracion_crear(text, text, text, text, text, boolean) to authenticated;
grant execute on function public.fn_punto_restauracion_comparar(text, bigint, boolean, integer, integer) to authenticated;
grant execute on function public.fn_punto_restauracion_restaurar(text, bigint, boolean) to authenticated;
grant execute on function public.fn_recalcular_stock_diferencias(text, text, text, integer, integer) to authenticated;
grant execute on function public.fn_recalcular_stock_aplicar(text, text, text) to authenticated;
grant execute on function public.fn_articulos_eliminacion_revisar(text, text, text, text, integer) to authenticated;
grant execute on function public.fn_articulos_eliminacion_baja(text[]) to authenticated;
revoke execute on function public.fn_listado_movimientos_stock(text, text, text, date, date, text, integer, integer) from public, anon;
revoke execute on function public.fn_resumen_movimientos_stock(text, text, text, date, date, text, integer, integer) from public, anon;
revoke execute on function public.fn_articulos_alta_rapida(jsonb, boolean) from public, anon;
revoke execute on function public.fn_articulos_bloque(jsonb, jsonb, boolean, integer) from public, anon;
revoke execute on function public.fn_punto_restauracion_crear(text, text, text, text, text, boolean) from public, anon;
revoke execute on function public.fn_punto_restauracion_comparar(text, bigint, boolean, integer, integer) from public, anon;
revoke execute on function public.fn_punto_restauracion_restaurar(text, bigint, boolean) from public, anon;
revoke execute on function public.fn_recalcular_stock_diferencias(text, text, text, integer, integer) from public, anon;
revoke execute on function public.fn_recalcular_stock_aplicar(text, text, text) from public, anon;
revoke execute on function public.fn_articulos_eliminacion_revisar(text, text, text, text, integer) from public, anon;
revoke execute on function public.fn_articulos_eliminacion_baja(text[]) from public, anon;
