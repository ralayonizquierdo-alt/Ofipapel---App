-- Espejo completo de GeminisWin (Rober, 22/11/2026: «quiero ya un espejo completo»).
--
-- El programa del PC trae ahora todo el histórico (repaso completo cada noche y el domingo) y los precios especiales
-- vigentes (CLIENART). Son unos 9 millones de registros. Dos cambios en el servidor para que quepa y no se atasque:
--
--  1. La copia en bruto (carga_dbf) de las tablas de movimientos solo hace falta mientras se pasa a su tabla del
--     ERP: al terminar cada tanda, lo ya pasado se quita de carga_dbf. Saber qué ha cambiado lo lleva el programa del
--     PC (guarda la huella de cada registro). Los maestros (artículos, clientes…) se quedan como estaban.
--  2. La carga de CLIENART releía todo lo recibido en cada tanda: ahora solo lo llegado en la tanda, como las demás.

create or replace function public.gw_tabla_sin_copia_bruta(p_tabla text)
returns boolean language sql immutable as $$
  select p_tabla = any (array['CLIENART', 'PEDIDCAB', 'PEDIDLIN', 'PETICION', 'PETIDETA', 'CLISUCUR', 'VENTAS', 'VENTDETA', 'FACTURAS',
                              'PAGOS', 'PAGOSGST', 'CAJA', 'CAJAAYC', 'PEDIDOS', 'PEDIDETA', 'FACTPROV'])
$$;

-- fn_espejo_gw_procesar: al terminar la tanda, quita de carga_dbf lo ya pasado (solo esas tablas).
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.fn_espejo_gw_procesar(text, text)'::regprocedure);
  if position('gw_tabla_sin_copia_bruta' in v_def) = 0 then
    v_def := replace(v_def,
      E'  insert into espejo_gw_tabla (tabla, cargado_hasta) values (p_tabla, v_hasta)',
      E'  if public.gw_tabla_sin_copia_bruta(p_tabla) then\n'
      || E'    delete from carga_dbf where tabla = p_tabla and cargado_en > v_desde and cargado_en <= v_hasta;\n'
      || E'  end if;\n'
      || E'  insert into espejo_gw_tabla (tabla, cargado_hasta) values (p_tabla, v_hasta)');
    if position('gw_tabla_sin_copia_bruta' in v_def) = 0 then
      raise exception 'No encuentro dónde poner la limpieza en fn_espejo_gw_procesar';
    end if;
    execute v_def;
  end if;
end $$;

-- CLIENART: solo lo llegado en la tanda (gw_reciente) y la última versión de cada clave.
create or replace function public.fn_carga_gw_cliente_articulo_precio()
returns jsonb language plpgsql set search_path to 'public', 'extensions', 'pg_temp' as $$
declare r jsonb;
begin
  with ult as (
    select distinct on (clave) clave, datos d from carga_dbf
     where tabla = 'CLIENART' and public.gw_reciente(cargado_en)
     order by clave, cargado_en desc
  ), src as (
    select clave, d, gw_t(d, 'IDCLIENTE') cli, gw_t(d, 'COD_INTERN') art,
      case when gw_t(d, 'IDCLIENTE') is null or gw_t(d, 'COD_INTERN') is null then 'sin clave'
           when not exists (select 1 from cliente c where c.codigo = gw_t(d, 'IDCLIENTE')) then 'cliente inexistente'
           when not exists (select 1 from articulo a where a.codigo_interno = gw_t(d, 'COD_INTERN')) then 'artículo inexistente'
           when count(*) over (partition by gw_t(d, 'IDCLIENTE'), gw_t(d, 'COD_INTERN')) > 1 then 'repetido'
      end motivo
    from ult),
  up as (
    insert into cliente_articulo_precio (cliente_codigo, articulo_codigo, pvp, cantidad_minima, fecha_fin)
    select cli, art, coalesce(gw_n(d, 'PVP'), 0), gw_n(d, 'CANTIDAD'), gw_d(d, 'FECHA_FIN') from src where motivo is null
    on conflict (cliente_codigo, articulo_codigo) do update set pvp = excluded.pvp,
      cantidad_minima = excluded.cantidad_minima, fecha_fin = excluded.fecha_fin, actualizado_en = now()
    returning (xmax = 0) ins)
  select gw_res('CLIENART', 'cliente_articulo_precio', (select count(*) from src),
    (select count(*) from up where ins), (select count(*) from up where not ins),
    (select jsonb_object_agg(motivo, n) from (select motivo, count(*) n from src where motivo is not null group by 1) x), null)
  into r;
  return r;
end $$;
revoke all on function public.fn_carga_gw_cliente_articulo_precio() from public, anon, authenticated;

-- Lo que ya estaba pasado de esas tablas (PEDIDLIN, PETICION, PETIDETA) se quita ya de la copia en bruto.
delete from carga_dbf c
 using espejo_gw_tabla e
 where e.tabla = c.tabla and public.gw_tabla_sin_copia_bruta(c.tabla) and c.cargado_en <= e.cargado_hasta;
