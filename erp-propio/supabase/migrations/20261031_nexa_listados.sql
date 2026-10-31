-- NEXA, centro de listados e informes (Rober, 31/10/2026): «el centro de listados y de todo debe
-- ser NEXA». El empleado le pide un listado en lenguaje normal y NEXA busca uno guardado del
-- Generador de listados (Luis), o lo monta sobre las vistas v_lst_*, lo enseña y ofrece guardarlo.
--
-- Todo con los permisos del usuario (SECURITY INVOKER: la Edge Function «nexa» llama con su JWT):
--  · fn_listado_fuente_permisos / fn_listado_fuente_permitida: una fuente v_lst_* solo se lista si
--    el usuario tiene permiso en alguna pantalla de ese tema (fn_puede_alguno; admin siempre).
--  · fn_nexa_listados_buscar: listados guardados que el usuario ve (RLS de listado_guardado) y de
--    fuentes que tiene permitidas.
--  · fn_nexa_listado: ejecuta sobre v_lst_* reutilizando fn_listado_ejecutar (la del Generador, sin
--    tocarla) y añade el total de filas y el tipo de cada columna.
--  · fn_nexa_listado_guardar: lo ÚNICO que NEXA escribe: un listado guardado (misma tabla y formato
--    que la pantalla de Luis; el código CLI-0012… lo pone su trigger). Solo con permiso /listados y
--    de una fuente permitida. La confirmación del usuario la exige la Edge Function.
--  · fn_nexa_informe_gw: lee gw_informe (definiciones de los informes de GeminisWin) para usar
--    sus columnas, agrupaciones y totales como plantilla.
-- No cambia nada del Generador ni de sus tablas. Idempotente.

-- ---------------------------------------------------------------- permisos por fuente
create or replace function public.fn_listado_fuente_permisos(p_fuente text)
returns text[]
language sql
immutable
as $$
  select case p_fuente
    when 'clientes' then array['/clientes', '/listados-clientes/clientes', '/listados-clientes/zonas', '/listados-clientes/no-pagado', '/web/clientes', '/web/clientes-empresa', '/recalcular-deuda']
    when 'articulos' then array['/articulos', '/almacen/listados-articulos', '/almacen/movimientos', '/inventario', '/modificacion-precios']
    when 'stock' then array['/articulos', '/almacen/listados-articulos', '/almacen/movimientos', '/inventario', '/almacen/inventariar', '/regularizacion-stock', '/traspasos']
    when 'familias' then array['/familias', '/articulos', '/almacen/listados-articulos']
    when 'ventas' then array['/ventas', '/tpv', '/listados-ventas/ventas', '/listados-ventas/articulos', '/listados-clientes/ventas-facturas', '/facturacion']
    when 'ventas_lineas' then array['/ventas', '/tpv', '/listados-ventas/ventas', '/listados-ventas/articulos', '/listados-clientes/ventas-facturas', '/facturacion']
    when 'facturas' then array['/facturacion', '/generar-facturas', '/listado-facturas', '/listados-facturacion/extracto', '/listados-facturacion/pendiente-cobro', '/listados-clientes/ventas-facturas', '/listados-clientes/no-pagado', '/cobros-clientes/ficha', '/gestor-cobros-clientes']
    when 'cobros' then array['/cobros-clientes/ficha', '/gestor-cobros-clientes', '/facturacion', '/listados-ventas/tarjetas', '/listados-ventas/divisas', '/listados-facturacion/extracto', '/listados-facturacion/pendiente-cobro']
    when 'presupuestos' then array['/presupuestos', '/gestor-presupuestos', '/listados-ventas/presupuestos', '/web/presupuestos']
    when 'pedidos' then array['/pedidos', '/gestor-pedidos', '/listados-ventas/pedidos', '/web/pendientes', '/web/estado-pedidos', '/web/importar-pedidos']
    when 'repartos' then array['/repartos']
    when 'compras' then array['/pedidos-proveedor', '/gestor-pedidos-proveedor', '/creacion-rapida-pedidos', '/listados-compras/pedidos', '/facturas-proveedor', '/listados-compras/facturas']
    when 'compras_lineas' then array['/pedidos-proveedor', '/gestor-pedidos-proveedor', '/creacion-rapida-pedidos', '/listados-compras/pedidos']
    when 'proveedores' then array['/proveedores', '/acreedores', '/listados-compras/proveedores', '/pedidos-proveedor', '/facturas-proveedor', '/pagos-proveedor']
    when 'peticiones' then array['/peticiones', '/gestor-pedidos-proveedor']
    when 'caja' then array['/caja/movimientos', '/caja/listado', '/caja/aperturas', '/caja/entrada', '/caja/salida']
    else null end
$$;
comment on function public.fn_listado_fuente_permisos(text) is 'NEXA: pantallas que dan acceso a cada fuente v_lst_* (cualquiera de ellas). Fuente nueva del Generador = añadirla aquí; sin entrada solo la ve un administrador.';

create or replace function public.fn_listado_fuente_permitida(p_fuente text)
returns boolean
language sql
stable
security invoker
set search_path to 'public'
as $$
  select case
    when public.fn_listado_fuente_permisos(p_fuente) is null then public.fn_es_administrador()
    else public.fn_puede_alguno(public.fn_listado_fuente_permisos(p_fuente)) end
$$;
grant execute on function public.fn_listado_fuente_permitida(text) to authenticated;
revoke execute on function public.fn_listado_fuente_permitida(text) from anon, public;

-- ---------------------------------------------------------------- buscar listados guardados
create or replace function public.fn_nexa_listados_buscar(p_texto text default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public'
as $$
declare
  v_palabras text[] := (select array_agg(lower(w)) from regexp_split_to_table(btrim(coalesce(p_texto, '')), '\s+') w where length(w) > 1);
  v_res jsonb;
begin
  with permitidas as (
    select f from unnest(array['clientes','articulos','stock','familias','ventas','ventas_lineas','facturas','cobros','presupuestos',
                               'pedidos','repartos','compras','compras_lineas','proveedores','peticiones','caja']) f
     where public.fn_listado_fuente_permitida(f)
  ), l as (
    select g.id, g.codigo, g.nombre, g.fuente, g.descripcion, g.definicion, g.creado_por,
           (select count(*) from listado_uso u where u.listado_id = g.id) as usos
      from listado_guardado g
     where not g.archivado
       and (g.fuente in (select f from permitidas))
       and (v_palabras is null or not exists (
             select 1 from unnest(v_palabras) w
              where position(w in lower(concat_ws(' ', g.codigo, g.nombre, g.descripcion, g.fuente, g.definicion::text))) = 0))
     order by usos desc, g.codigo
     limit 30
  )
  select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) into v_res from l;
  return jsonb_build_object('listados', v_res,
    'fuentes_permitidas', (select coalesce(jsonb_agg(f), '[]'::jsonb) from unnest(array['clientes','articulos','stock','familias','ventas','ventas_lineas','facturas','cobros','presupuestos',
                               'pedidos','repartos','compras','compras_lineas','proveedores','peticiones','caja']) f where public.fn_listado_fuente_permitida(f)));
end;
$$;
grant execute on function public.fn_nexa_listados_buscar(text) to authenticated;
revoke execute on function public.fn_nexa_listados_buscar(text) from anon, public;

-- ---------------------------------------------------------------- ejecutar
create or replace function public.fn_nexa_listado(
  p_fuente text, p_columnas text[], p_filtros jsonb default '[]', p_agrupar text[] default '{}',
  p_sumar text[] default '{}', p_orden jsonb default '[]', p_limite integer default 500)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public'
as $$
declare
  v_lim int := least(greatest(coalesce(p_limite, 500), 1), 500);
  v_agrupa boolean := coalesce(array_length(p_agrupar, 1), 0) > 0;
  v_cols text[];
  v_r jsonb;
  v_n int;
  v_tipos jsonb;
begin
  if p_fuente !~ '^[a-z_]+$' then raise exception 'Fuente no válida'; end if;
  if not public.fn_listado_fuente_permitida(p_fuente) then
    raise exception 'Tu grupo de acceso no tiene permiso para listados de «%».', p_fuente using errcode = '42501';
  end if;
  v_r := public.fn_listado_ejecutar(p_fuente, p_columnas, p_filtros, p_agrupar, case when v_agrupa then p_sumar else '{}' end, p_orden, v_lim);
  v_n := jsonb_array_length(v_r -> 'filas');
  if (v_r ->> 'truncado')::boolean then
    -- Total real (hasta 50.000) con una sola columna, sin traerlo.
    v_n := jsonb_array_length(public.fn_listado_ejecutar(p_fuente,
             case when v_agrupa then p_columnas else p_columnas[1:1] end, p_filtros, p_agrupar, '{}', '[]', 50000) -> 'filas');
  end if;
  v_cols := case when v_agrupa then p_agrupar || array['registros'] || coalesce(p_sumar, '{}') else p_columnas end;
  select jsonb_object_agg(column_name, data_type) into v_tipos
    from information_schema.columns where table_schema = 'public' and table_name = 'v_lst_' || p_fuente and column_name = any (v_cols);
  return jsonb_build_object(
    'filas', v_r -> 'filas',
    'truncado', (v_r ->> 'truncado')::boolean,
    'total', v_n,
    'total_mas', v_n >= 50000,
    'columnas', (select jsonb_agg(jsonb_build_object('clave', c,
                   'tipo', case when c = 'registros' then 'num' else
                     case when v_tipos ->> c in ('numeric','integer','bigint','smallint','double precision','real') then 'num'
                          when v_tipos ->> c = 'date' or v_tipos ->> c like 'timestamp%' then 'fecha'
                          when v_tipos ->> c = 'boolean' then 'bool' else 'texto' end end,
                   'suma', v_agrupa and c = any (coalesce(p_sumar, '{}'))) order by n)
                 from unnest(v_cols) with ordinality as x(c, n)));
end;
$$;
grant execute on function public.fn_nexa_listado(text, text[], jsonb, text[], text[], jsonb, integer) to authenticated;
revoke execute on function public.fn_nexa_listado(text, text[], jsonb, text[], text[], jsonb, integer) from anon, public;

-- ---------------------------------------------------------------- guardar (con confirmación)
create or replace function public.fn_nexa_listado_guardar(p_nombre text, p_fuente text, p_definicion jsonb, p_descripcion text default null)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_def jsonb;
  v_id bigint;
  v_codigo text;
begin
  if not public.fn_puede('/listados') then
    raise exception 'Tu grupo de acceso no tiene el Generador de listados.' using errcode = '42501';
  end if;
  if not public.fn_listado_fuente_permitida(p_fuente) then
    raise exception 'Tu grupo de acceso no tiene permiso para listados de «%».', p_fuente using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_nombre, '')), '') is null then raise exception 'Falta el nombre del listado'; end if;
  -- Mismo formato que la pantalla del Generador.
  v_def := jsonb_build_object(
    'columnas', coalesce(p_definicion -> 'columnas', '[]'),
    'filtros', coalesce(p_definicion -> 'filtros', '[]'),
    'agrupar', coalesce(p_definicion -> 'agrupar', '[]'),
    'sumar', coalesce(p_definicion -> 'sumar', '[]'),
    'orden', coalesce(p_definicion -> 'orden', '[]'));
  -- Que funcione antes de guardarlo (valida columnas, filtros y orden).
  perform public.fn_listado_ejecutar(p_fuente,
    array(select jsonb_array_elements_text(v_def -> 'columnas')), v_def -> 'filtros',
    array(select jsonb_array_elements_text(v_def -> 'agrupar')), array(select jsonb_array_elements_text(v_def -> 'sumar')),
    v_def -> 'orden', 1);
  insert into listado_guardado (nombre, fuente, definicion, grupos, descripcion)
  values (left(btrim(p_nombre), 120), p_fuente, v_def, null, nullif(left(btrim(coalesce(p_descripcion, '')), 500), ''))
  returning id, codigo into v_id, v_codigo;
  return jsonb_build_object('id', v_id, 'codigo', v_codigo, 'nombre', left(btrim(p_nombre), 120));
end;
$$;
grant execute on function public.fn_nexa_listado_guardar(text, text, jsonb, text) to authenticated;
revoke execute on function public.fn_nexa_listado_guardar(text, text, jsonb, text) from anon, public;

-- ---------------------------------------------------------------- informes de GeminisWin
create or replace function public.fn_nexa_informe_gw(p_buscar text default null, p_fichero text default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public'
as $$
declare
  v_palabras text[] := (select array_agg(lower(w)) from regexp_split_to_table(btrim(coalesce(p_buscar, '')), '\s+') w where length(w) > 2);
  v_res jsonb;
begin
  with base as (
    select i.fichero, i.nombre, i.impresora, i.bandas, i.objetos, i.campos,
           (select string_agg(btrim(o ->> 'texto', '"'), ' · ' order by (o ->> 'vpos')::numeric, (o ->> 'hpos')::numeric)
              from jsonb_array_elements(i.objetos) o where o ->> 'banda' = 'titulo' and o ->> 'tipo' = 'texto') as titulos,
           (select string_agg(btrim(o ->> 'texto', '"'), ' | ' order by (o ->> 'vpos')::numeric, (o ->> 'hpos')::numeric)
              from jsonb_array_elements(i.objetos) o where o ->> 'banda' = 'cabecera_pagina' and o ->> 'tipo' = 'texto') as cabeceras
      from gw_informe i
     where (p_fichero is null or lower(i.fichero) = lower(p_fichero) or lower(i.nombre) = lower(p_fichero))
  ), filtrado as (
    select * from base b
     where p_fichero is not null or v_palabras is null or not exists (
       select 1 from unnest(v_palabras) w
        where position(w in lower(concat_ws(' ', b.fichero, b.titulos, b.cabeceras, array_to_string(b.campos, ' ')))) = 0)
     order by b.fichero
     limit case when p_fichero is not null then 1 else 15 end
  )
  select coalesce(jsonb_agg(
    case when p_fichero is null then
      jsonb_build_object('fichero', fichero, 'titulos', titulos, 'cabeceras', cabeceras, 'campos', campos)
    else
      jsonb_build_object('fichero', fichero, 'titulos', titulos, 'cabeceras', cabeceras,
        'apaisado', impresora ilike '%ORIENTATION=1%',
        'detalle', (select jsonb_agg(o ->> 'expr' order by (o ->> 'hpos')::numeric) from jsonb_array_elements(objetos) o where o ->> 'banda' = 'detalle' and o ->> 'tipo' = 'campo'),
        'agrupa_por', (select jsonb_agg(b ->> 'agrupa_por') from jsonb_array_elements(bandas) b where b ? 'agrupa_por'),
        'totales', (select jsonb_agg(distinct jsonb_build_object('banda', o ->> 'banda', 'campo', o ->> 'expr', 'total', o ->> 'total'))
                      from jsonb_array_elements(objetos) o where o ->> 'total' is not null))
    end), '[]'::jsonb) into v_res
  from filtrado;
  return v_res;
end;
$$;
grant execute on function public.fn_nexa_informe_gw(text, text) to authenticated;
revoke execute on function public.fn_nexa_informe_gw(text, text) from anon, public;
