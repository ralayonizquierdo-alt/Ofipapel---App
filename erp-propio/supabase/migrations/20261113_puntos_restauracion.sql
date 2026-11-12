-- Almacén → Puntos de Restauración de Stock, calcada de GeminisWin (captura 04 del bloque 8).
-- Solo cambios aditivos: un índice para buscar un artículo dentro de un punto (la rejilla puede
-- tener cientos de miles de líneas) y la función con la que la pantalla crea un punto nuevo por
-- rango de almacenes («Alm. Desde» / «Alm. Hasta»), con concepto, observaciones y documento.
-- La función anterior (fn_punto_restauracion_crear, un solo almacén) se queda como estaba.

create index if not exists punto_restauracion_stock_linea_articulo_idx
  on public.punto_restauracion_stock_linea (tienda_terminal_codigo, numero, articulo_codigo);

create or replace function public.fn_punto_restauracion_crear_rango(
  p_tienda text,
  p_almacen_desde text default null,
  p_almacen_hasta text default null,
  p_concepto text default null,
  p_observaciones text default null,
  p_documento text default null
) returns bigint
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_desde text := nullif(trim(coalesce(p_almacen_desde, '')), '');
  v_hasta text := nullif(trim(coalesce(p_almacen_hasta, '')), '');
  v_numero bigint;
  v_lineas bigint;
begin
  if not (public.fn_puede('/almacen/puntos-restauracion')) then
    raise exception 'No tienes permiso para crear puntos de restauración de stock. Pídeselo a gerencia (Archivo → Usuarios).' using errcode = '42501';
  end if;
  if coalesce(p_tienda, '') = '' then raise exception 'Indica la tienda del punto de restauración.'; end if;
  if v_desde is not null and not exists (select 1 from almacen where codigo = v_desde) then
    raise exception 'El almacén «%» de «Alm. Desde» no existe. Elígelo con el botón de puntos.', v_desde;
  end if;
  if v_hasta is not null and not exists (select 1 from almacen where codigo = v_hasta) then
    raise exception 'El almacén «%» de «Alm. Hasta» no existe. Elígelo con el botón de puntos.', v_hasta;
  end if;
  if v_desde is not null and v_hasta is not null and v_desde > v_hasta then
    raise exception '«Alm. Desde» (%) es mayor que «Alm. Hasta» (%). Ponlos al revés.', v_desde, v_hasta;
  end if;
  -- Antes de numerar: si no hay nada que copiar no se gasta un número.
  if not exists (
    select 1 from articulo_almacen_stock s
    where (v_desde is null or s.almacen_codigo >= v_desde) and (v_hasta is null or s.almacen_codigo <= v_hasta)
  ) then
    raise exception 'No hay stock de ningún artículo en esos almacenes: no hay nada que copiar. Revisa «Alm. Desde» y «Alm. Hasta».';
  end if;
  v_numero := fn_siguiente_numero(p_tienda, 'punto_restauracion_stock', '');
  insert into punto_restauracion_stock (tienda_terminal_codigo, numero, concepto, fecha, almacen_desde_codigo, almacen_hasta_codigo,
                                        documento_externo, observaciones, origen_tipo, tipo_punto_restauracion)
  values (p_tienda, v_numero, nullif(trim(coalesce(p_concepto, '')), ''), current_date, v_desde, v_hasta,
          coalesce(nullif(trim(coalesce(p_documento, '')), ''), 'USR_STK'), nullif(trim(coalesce(p_observaciones, '')), ''), 'manual', 2);
  -- Como la función de un solo almacén: la cantidad del punto va en las dos columnas (así la leen
  -- fn_punto_restauracion_comparar y fn_punto_restauracion_restaurar) y la fecha es la de la copia.
  insert into punto_restauracion_stock_linea (tienda_terminal_codigo, numero, numero_linea, articulo_codigo, descripcion, almacen_codigo,
                                              precio, cantidad_antes_de_restaurar, cantidad_inicial, fecha_stock_inicial)
  select p_tienda, v_numero, row_number() over (order by s.almacen_codigo, s.articulo_codigo), s.articulo_codigo, a.descripcion, s.almacen_codigo,
         a.coste_bruto, s.cantidad_actual, s.cantidad_actual, now()
  from articulo_almacen_stock s
  join articulo a on a.codigo_interno = s.articulo_codigo
  where (v_desde is null or s.almacen_codigo >= v_desde) and (v_hasta is null or s.almacen_codigo <= v_hasta);
  get diagnostics v_lineas = row_count;
  if v_lineas = 0 then
    raise exception 'No hay stock de ningún artículo en esos almacenes: no hay nada que copiar. Revisa «Alm. Desde» y «Alm. Hasta».';
  end if;
  return v_numero;
end;
$function$;

revoke all on function public.fn_punto_restauracion_crear_rango(text, text, text, text, text, text) from public, anon;
grant execute on function public.fn_punto_restauracion_crear_rango(text, text, text, text, text, text) to authenticated, service_role;
