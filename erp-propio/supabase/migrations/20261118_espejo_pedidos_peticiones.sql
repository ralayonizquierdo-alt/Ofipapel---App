-- Espejo de GeminisWin: pedidos a proveedor y peticiones de clientes (18/11/2026).
--
-- Cowork localizó los ficheros: PEDIDCAB (cabecera de pedido/albarán de proveedor, 28.753), PEDIDLIN (líneas,
-- 325.338), PETICION (peticiones de artículos de clientes, 16.796) y PETIDETA (seguimiento: a qué pedido de
-- proveedor pasó y cuándo llegó y se entregó, 12.484). Para qué: que el Gestor de Pedidos del ERP sepa lo que ya
-- está pedido en GeminisWin (si no, lo vuelve a proponer) y las peticiones de clientes de verdad.
--
-- Van a tablas propias de copia (gw_*), NO a pedido_proveedor ni a peticion del ERP: los números de GeminisWin
-- chocarían con los del ERP y son datos de solo consulta mientras GeminisWin sea quien manda. De los pedidos, el
-- programa del PC solo manda los del último año, los que siguen sin recibir y los que ya mandó alguna vez.
-- Qué valores de TIPODOC (pedido/albarán) y de TIPO/ESTADO de las peticiones significan qué se confirma con los
-- datos ya cargados, antes de usarlos en la propuesta.

create table if not exists public.gw_pedido_proveedor (
  oficina text not null,
  numero bigint not null,
  proveedor_codigo text,
  almacen_codigo text,
  fecha_hora timestamptz,
  tipo_documento smallint,
  recibido boolean not null default false,
  actualizado boolean not null default false,
  abono boolean not null default false,
  numero_albaran text,
  fecha_albaran date,
  numero_factura text,
  total numeric,
  copiado_en timestamptz not null default now(),
  primary key (oficina, numero)
);
create table if not exists public.gw_pedido_proveedor_linea (
  oficina text not null,
  numero bigint not null,
  linea integer not null,
  articulo_codigo text not null default '',
  codigo_compra text,
  descripcion text,
  cantidad numeric,
  total_unidades numeric,
  unidades_recibidas numeric,
  recibida boolean not null default false,
  precio_compra numeric,
  copiado_en timestamptz not null default now(),
  primary key (oficina, numero, linea, articulo_codigo)
);
create index if not exists gw_pedido_proveedor_linea_articulo_idx on public.gw_pedido_proveedor_linea (articulo_codigo);
create table if not exists public.gw_peticion (
  oficina text not null,
  numero bigint not null,
  tipo smallint,
  estado smallint,
  fecha_hora timestamptz,
  articulo_codigo text,
  descripcion text,
  cantidad numeric,
  cantidad_tramitada numeric,
  cliente_codigo text,
  nombre_origen text,
  proveedor_codigo text,
  fecha_prevista timestamptz,
  concepto text,
  copiado_en timestamptz not null default now(),
  primary key (oficina, numero)
);
create index if not exists gw_peticion_articulo_idx on public.gw_peticion (articulo_codigo);
create table if not exists public.gw_peticion_seguimiento (
  clave text primary key,
  oficina text not null,
  numero bigint not null,
  oficina_pedido text,
  numero_pedido bigint,
  linea_pedido bigint,
  estado smallint,
  fecha_hora timestamptz,
  cantidad numeric,
  proveedor_codigo text,
  almacen_codigo text,
  fecha_prevista timestamptz,
  fecha_recepcion timestamptz,
  fecha_entrega timestamptz,
  copiado_en timestamptz not null default now()
);
create index if not exists gw_peticion_seguimiento_peticion_idx on public.gw_peticion_seguimiento (oficina, numero);

comment on table public.gw_pedido_proveedor is 'Copia de solo consulta de PEDIDCAB de GeminisWin (pedidos/albaranes de proveedor): último año y pendientes de recibir.';
comment on table public.gw_pedido_proveedor_linea is 'Copia de solo consulta de PEDIDLIN de GeminisWin (líneas de pedido de proveedor).';
comment on table public.gw_peticion is 'Copia de solo consulta de PETICION de GeminisWin (peticiones de artículos de clientes).';
comment on table public.gw_peticion_seguimiento is 'Copia de solo consulta de PETIDETA de GeminisWin (seguimiento de cada petición).';

do $$
declare t text; ruta text;
begin
  foreach t in array array['gw_pedido_proveedor', 'gw_pedido_proveedor_linea', 'gw_peticion', 'gw_peticion_seguimiento'] loop
    ruta := case when t like 'gw_peticion%' then '/peticiones' else '/gestor-pedidos-proveedor' end;
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policy where polname = t || '_lee' and polrelid = ('public.' || t)::regclass) then
      execute format('create policy %I on public.%I for select to authenticated using ((select public.fn_puede(%L)) or (select public.fn_puede(''/gestor-pedidos-proveedor'')))', t || '_lee', t, ruta);
    end if;
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

------------------------------------------------------------------------------------------------- cargas
create or replace function public.fn_carga_gw_gw_pedido_proveedor()
returns jsonb language plpgsql set search_path to 'public', 'extensions', 'pg_temp' as $$
declare n int;
begin
  with s as (
    select distinct on (clave) datos d from carga_dbf
     where tabla = 'PEDIDCAB' and public.gw_reciente(cargado_en) and gw_t(datos, 'IDOFICINA') is not null and gw_n(datos, 'NUMERO') is not null
     order by clave, cargado_en desc
  ), u as (
    insert into gw_pedido_proveedor as g (oficina, numero, proveedor_codigo, almacen_codigo, fecha_hora, tipo_documento, recibido, actualizado,
                                          abono, numero_albaran, fecha_albaran, numero_factura, total, copiado_en)
    select gw_t(d, 'IDOFICINA'), gw_n(d, 'NUMERO')::bigint, gw_t(d, 'COD_PROV'), gw_t(d, 'ALMACEN'), gw_ts(d, 'FECHAHORA'),
           gw_n(d, 'TIPODOC')::smallint, coalesce(gw_b(d, 'RECIBIDO'), false), coalesce(gw_b(d, 'ACTUAL'), false), coalesce(gw_b(d, 'ABONO'), false),
           gw_t(d, 'NUM_ALBA'), gw_d(d, 'FECHA_ALBA'), gw_t(d, 'NUM_FACTUR'), gw_n(d, 'TOTAL'), now()
      from s
    on conflict (oficina, numero) do update set proveedor_codigo = excluded.proveedor_codigo, almacen_codigo = excluded.almacen_codigo,
      fecha_hora = excluded.fecha_hora, tipo_documento = excluded.tipo_documento, recibido = excluded.recibido, actualizado = excluded.actualizado,
      abono = excluded.abono, numero_albaran = excluded.numero_albaran, fecha_albaran = excluded.fecha_albaran,
      numero_factura = excluded.numero_factura, total = excluded.total, copiado_en = now()
    returning 1)
  select count(*) into n from u;
  return jsonb_build_object('tabla', 'gw_pedido_proveedor', 'filas', n);
end $$;

create or replace function public.fn_carga_gw_gw_pedido_proveedor_linea()
returns jsonb language plpgsql set search_path to 'public', 'extensions', 'pg_temp' as $$
declare n int;
begin
  with s as (
    select distinct on (clave) datos d from carga_dbf
     where tabla = 'PEDIDLIN' and public.gw_reciente(cargado_en) and gw_t(datos, 'IDOFICINA') is not null and gw_n(datos, 'NUMERO') is not null
     order by clave, cargado_en desc
  ), u as (
    insert into gw_pedido_proveedor_linea (oficina, numero, linea, articulo_codigo, codigo_compra, descripcion, cantidad, total_unidades,
                                           unidades_recibidas, recibida, precio_compra, copiado_en)
    select gw_t(d, 'IDOFICINA'), gw_n(d, 'NUMERO')::bigint, coalesce(gw_n(d, 'LINEA'), 0)::int, coalesce(gw_t(d, 'COD_INTERN'), ''),
           gw_t(d, 'COD_COMPRA'), gw_t(d, 'DESCRIP'), gw_n(d, 'CANTIDAD'), gw_n(d, 'TOTUNIDS'), gw_n(d, 'UNIDSRECEP'),
           coalesce(gw_b(d, 'RECEP'), false), gw_n(d, 'PRE_COMPRA'), now()
      from s
    on conflict (oficina, numero, linea, articulo_codigo) do update set codigo_compra = excluded.codigo_compra, descripcion = excluded.descripcion,
      cantidad = excluded.cantidad, total_unidades = excluded.total_unidades, unidades_recibidas = excluded.unidades_recibidas,
      recibida = excluded.recibida, precio_compra = excluded.precio_compra, copiado_en = now()
    returning 1)
  select count(*) into n from u;
  return jsonb_build_object('tabla', 'gw_pedido_proveedor_linea', 'filas', n);
end $$;

create or replace function public.fn_carga_gw_gw_peticion()
returns jsonb language plpgsql set search_path to 'public', 'extensions', 'pg_temp' as $$
declare n int;
begin
  with s as (
    select distinct on (clave) datos d from carga_dbf
     where tabla = 'PETICION' and public.gw_reciente(cargado_en) and gw_t(datos, 'IDOFICINA') is not null and gw_n(datos, 'NUMERO') is not null
     order by clave, cargado_en desc
  ), u as (
    insert into gw_peticion (oficina, numero, tipo, estado, fecha_hora, articulo_codigo, descripcion, cantidad, cantidad_tramitada,
                             cliente_codigo, nombre_origen, proveedor_codigo, fecha_prevista, concepto, copiado_en)
    select gw_t(d, 'IDOFICINA'), gw_n(d, 'NUMERO')::bigint, gw_n(d, 'TIPO')::smallint, gw_n(d, 'ESTADO')::smallint, gw_ts(d, 'FECHAHORA'),
           gw_t(d, 'COD_INTERN'), gw_t(d, 'DESCRIP'), gw_n(d, 'CANTIDAD'), gw_n(d, 'CANTTRAMIT'), gw_t(d, 'IDCLIORIG'), gw_t(d, 'NOMBORIGEN'),
           gw_t(d, 'COD_PROV'), gw_ts(d, 'FECPREVENT'), gw_t(d, 'CONCEPTO'), now()
      from s
    on conflict (oficina, numero) do update set tipo = excluded.tipo, estado = excluded.estado, fecha_hora = excluded.fecha_hora,
      articulo_codigo = excluded.articulo_codigo, descripcion = excluded.descripcion, cantidad = excluded.cantidad,
      cantidad_tramitada = excluded.cantidad_tramitada, cliente_codigo = excluded.cliente_codigo, nombre_origen = excluded.nombre_origen,
      proveedor_codigo = excluded.proveedor_codigo, fecha_prevista = excluded.fecha_prevista, concepto = excluded.concepto, copiado_en = now()
    returning 1)
  select count(*) into n from u;
  return jsonb_build_object('tabla', 'gw_peticion', 'filas', n);
end $$;

create or replace function public.fn_carga_gw_gw_peticion_seguimiento()
returns jsonb language plpgsql set search_path to 'public', 'extensions', 'pg_temp' as $$
declare n int;
begin
  with s as (
    select distinct on (clave) clave, datos d from carga_dbf
     where tabla = 'PETIDETA' and public.gw_reciente(cargado_en) and gw_t(datos, 'IDOFICINA') is not null and gw_n(datos, 'NUMERO') is not null
     order by clave, cargado_en desc
  ), u as (
    insert into gw_peticion_seguimiento (clave, oficina, numero, oficina_pedido, numero_pedido, linea_pedido, estado, fecha_hora, cantidad,
                                         proveedor_codigo, almacen_codigo, fecha_prevista, fecha_recepcion, fecha_entrega, copiado_en)
    select clave, gw_t(d, 'IDOFICINA'), gw_n(d, 'NUMERO')::bigint, gw_t(d, 'IDOFICPED'), gw_n(d, 'NUMEROPED')::bigint, gw_n(d, 'NUMLINPED')::bigint,
           gw_n(d, 'ESTADO')::smallint, gw_ts(d, 'FECHAHORA'), gw_n(d, 'CANTIDAD'), gw_t(d, 'COD_PROV'), gw_t(d, 'IDALMACEN'),
           gw_ts(d, 'FECPREVENT'), gw_ts(d, 'FECRECEP'), gw_ts(d, 'FECENTREGA'), now()
      from s
    on conflict (clave) do update set oficina_pedido = excluded.oficina_pedido, numero_pedido = excluded.numero_pedido,
      linea_pedido = excluded.linea_pedido, estado = excluded.estado, fecha_hora = excluded.fecha_hora, cantidad = excluded.cantidad,
      proveedor_codigo = excluded.proveedor_codigo, almacen_codigo = excluded.almacen_codigo, fecha_prevista = excluded.fecha_prevista,
      fecha_recepcion = excluded.fecha_recepcion, fecha_entrega = excluded.fecha_entrega, copiado_en = now()
    returning 1)
  select count(*) into n from u;
  return jsonb_build_object('tabla', 'gw_peticion_seguimiento', 'filas', n);
end $$;

revoke all on function public.fn_carga_gw_gw_pedido_proveedor() from public, anon, authenticated;
revoke all on function public.fn_carga_gw_gw_pedido_proveedor_linea() from public, anon, authenticated;
revoke all on function public.fn_carga_gw_gw_peticion() from public, anon, authenticated;
revoke all on function public.fn_carga_gw_gw_peticion_seguimiento() from public, anon, authenticated;

-- El espejo admite las cuatro tablas nuevas.
create or replace function public.fn_espejo_gw_tablas()
returns table(orden integer, tabla text, pasos text[])
language sql immutable as $$
  values (1, 'PAISES', array['pais']), (2, 'PROVINCIAS', array['provincia']), (3, 'FOMA', array['forma_pago']),
         (4, 'ALMACEN', array['almacen']), (5, 'OFICINA', array['tienda_terminal']), (6, 'ZONATERR', array['zona_territorial']),
         (7, 'RUTAS', array['ruta_reparto']), (8, 'RUTAZONA', array['ruta_reparto_zona']), (9, 'REPARTIDOR', array['repartidor']),
         (10, 'RUTAREPA', array['ruta_reparto_repartidor']), (11, 'VENDEDOR', array['vendedor']), (12, 'TRANSPOR', array['transportista']),
         (13, 'PLANTTAR', array['plantilla_tarifa']), (14, 'FAMILIAS', array['familia']), (15, 'MARCAS', array['marca']),
         (16, 'PROVEEDO', array['proveedor']), (17, 'TIPOCLIE', array['tipo_cliente']), (18, 'CLIENTES', array['cliente']),
         (19, 'ARTICULO', array['marca', 'articulo', 'articulo_precio_nivel']), (20, 'ARTBARRA', array['articulo_codigo_barras']),
         (21, 'ARTDPROV', array['articulo_proveedor']), (22, 'ARTPROV', array['articulo_proveedor']),
         (23, 'ARTICALM', array['articulo_almacen_stock']), (24, 'CLIENART', array['cliente_articulo_precio']),
         (25, 'PEDIDCAB', array['gw_pedido_proveedor']), (26, 'PEDIDLIN', array['gw_pedido_proveedor_linea']),
         (27, 'PETICION', array['gw_peticion']), (28, 'PETIDETA', array['gw_peticion_seguimiento'])
$$;
