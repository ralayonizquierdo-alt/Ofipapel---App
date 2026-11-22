-- Espejo de GeminisWin, tanda 2 y lo que faltaba de la 3 (22/11/2026). Rober: «quiero volcar todos los datos que
-- falten; empieza por el año en curso».
--
-- Estructura sacada por Cowork de los DBF reales (solo lectura, sin datos): ventas, ventdeta, facturas, pagos,
-- pagosgst, caja, cajaayc, clisucur, pedidos, pedideta y factprov.
--
--  · Ventas, facturas, cobros, caja, pedidos de clientes y facturas de proveedor van a tablas propias de copia
--    (gw_*), como los pedidos a proveedor: NO a venta/factura/cobro_cliente… del ERP. Los números de GeminisWin
--    chocarían con los del ERP (que ya hace ventas de reparto y de prueba), y meterlas allí movería stock y
--    dispararía todo lo que cuelga de una venta. Son de solo consulta mientras GeminisWin sea quien manda; sirven
--    para listados, análisis y para comparar.
--  · Las sucursales de clientes (CLISUCUR) sí van a cliente_sucursal: es un maestro, como los clientes.
--  · De las tablas grandes, el programa del PC solo manda desde el 01/01/2026 (parámetro 'desde' del programa).
--  · Facturas de venta, líneas: no hay fichero; cada venta apunta a su factura (IDOFIFRA + IDFACTURA) y las
--    líneas son las de la venta. Presupuestos: van en PEDIDOS con PRESUP = T.
--  · PEDIDCAB: RECIBIDO está vacío en todos (Cowork); se añaden RECEPCION y ESTADOPED para saber qué falta por recibir.

---------------------------------------------------------------------------------------------- tablas
create table if not exists public.gw_venta (
  oficina text not null,
  id_venta bigint not null,
  fecha date,
  hora text,
  cliente_codigo text,
  nombre text,
  nif text,
  sucursal text,
  vendedor_codigo text,
  empleado_codigo text,
  almacen_codigo text,
  tarifa text,
  forma_pago_tipo smallint,        -- FORMAPAGO de GeminisWin
  forma_pago text,                 -- FORMA_P (código de forma de pago)
  tipo_credito text,
  subtotal numeric,
  descuento_pie numeric,
  total_descuento_pie numeric,
  base numeric,                    -- SUBTOT2
  total_igic numeric,
  total numeric,
  total_efectivo numeric,
  total_tarjeta numeric,
  total_pagado numeric,
  total_pendiente numeric,
  devolucion numeric,
  fecha_pago date,
  factura_oficina text,
  factura_id bigint,
  pedido_oficina text,
  pedido_id bigint,
  reparto smallint,
  reparto_oficina text,
  reparto_id bigint,
  ruta_codigo text,
  turno_oficina text,
  turno_numero bigint,
  alta_en timestamptz,
  modificado_en timestamptz,
  copiado_en timestamptz not null default now(),
  primary key (oficina, id_venta)
);
create index if not exists gw_venta_fecha_idx on public.gw_venta (fecha);
create index if not exists gw_venta_cliente_idx on public.gw_venta (cliente_codigo, fecha);
create index if not exists gw_venta_factura_idx on public.gw_venta (factura_oficina, factura_id);

create table if not exists public.gw_venta_linea (
  oficina text not null,
  id_venta bigint not null,
  linea bigint not null,
  fecha date,
  articulo_codigo text,
  codigo_venta text,
  codigo_barras text,
  descripcion text,
  almacen_codigo text,
  cantidad numeric,
  total_unidades numeric,
  pvp numeric,
  descuento numeric,
  subtotal numeric,
  igic numeric,
  total_igic numeric,
  total_base numeric,
  precio_liquidacion numeric,
  coste numeric,                   -- P_LIQCOMPR
  tipo_movimiento smallint,
  empleado_codigo text,
  tecnico_codigo text,
  modificado_en timestamptz,
  copiado_en timestamptz not null default now(),
  primary key (oficina, id_venta, linea)
);
create index if not exists gw_venta_linea_fecha_idx on public.gw_venta_linea (fecha);
create index if not exists gw_venta_linea_articulo_idx on public.gw_venta_linea (articulo_codigo, fecha);

create table if not exists public.gw_factura (
  oficina text not null,
  id_factura bigint not null,
  numero bigint,
  cliente_codigo text,
  nombre text,
  nif text,
  sucursal text,
  vendedor_codigo text,
  empleado_codigo text,
  fecha date,
  desde date,
  hasta date,
  estado text,
  subtotal numeric,
  descuento_pie numeric,
  total_descuento numeric,
  total_bases numeric,
  total_igic numeric,
  total numeric,
  total_pagado numeric,
  total_pendiente numeric,
  fecha_pago date,
  numero_pagos integer,
  forma_pago_tipo smallint,
  forma_pago text,
  tipo_credito text,
  retencion numeric,
  global smallint,
  modificado_en timestamptz,
  copiado_en timestamptz not null default now(),
  primary key (oficina, id_factura)
);
create index if not exists gw_factura_fecha_idx on public.gw_factura (fecha);
create index if not exists gw_factura_cliente_idx on public.gw_factura (cliente_codigo, fecha);

create table if not exists public.gw_cobro (
  oficina text not null,
  cod_pago bigint not null,
  id_pago integer not null default 0,
  cliente_codigo text,
  factura_oficina text,
  factura_id bigint,
  numero_factura text,
  fecha date,
  fecha_pago date,
  fecha_vencimiento date,
  cuota numeric,
  pagado numeric,
  estado text,
  tipo_pago text,
  es_efecto boolean not null default false,
  domiciliado boolean not null default false,
  concepto text,
  documento text,
  cuenta_contable text,
  venta_oficina text,
  venta_id bigint,
  no_contabilizar boolean not null default false,
  modificado_en timestamptz,
  copiado_en timestamptz not null default now(),
  primary key (oficina, cod_pago, id_pago)
);
create index if not exists gw_cobro_fecha_idx on public.gw_cobro (fecha);
create index if not exists gw_cobro_cliente_idx on public.gw_cobro (cliente_codigo, fecha);
create index if not exists gw_cobro_factura_idx on public.gw_cobro (factura_oficina, factura_id);

create table if not exists public.gw_pago_gasto (
  oficina text not null,
  cod_pago bigint not null,
  id_pago integer not null default 0,
  tipo_movimiento smallint,
  tipo_receptor smallint,
  receptor_codigo text,
  receptor_nombre text,
  numero_factura text,
  fecha_factura date,
  fecha date,
  fecha_pago date,
  fecha_vencimiento date,
  cuota numeric,
  pagado numeric,
  estado text,
  tipo_pago text,
  es_efecto boolean not null default false,
  domiciliado boolean not null default false,
  concepto text,
  documento text,
  cuenta_contable text,
  pedido_oficina text,
  pedido_numero bigint,
  factura_proveedor_oficina text,
  factura_proveedor_id bigint,
  modificado_en timestamptz,
  copiado_en timestamptz not null default now(),
  primary key (oficina, cod_pago, id_pago)
);
create index if not exists gw_pago_gasto_fecha_idx on public.gw_pago_gasto (fecha);

create table if not exists public.gw_caja_movimiento (
  oficina text not null,
  id_mov bigint not null,
  fecha date,
  hora text,
  documento text,
  ingreso_o_gasto text,
  ingreso numeric,
  gasto numeric,
  concepto text,
  tipo_movimiento text,
  tipo_descripcion text,
  forma_codigo text,
  forma text,
  cliente_codigo text,
  proveedor_codigo text,
  empleado_codigo text,
  turno_oficina text,
  turno_numero bigint,
  ajeno_oficina text,
  ajeno_codigo bigint,
  modificado_en timestamptz,
  copiado_en timestamptz not null default now(),
  primary key (oficina, id_mov)
);
create index if not exists gw_caja_movimiento_fecha_idx on public.gw_caja_movimiento (fecha);

create table if not exists public.gw_caja_cierre (
  oficina text not null,
  ejercicio bigint not null,
  inicio timestamptz,
  fin timestamptz,
  cerrado boolean not null default false,
  empleado_inicio text,
  empleado_fin text,
  fondo_inicial numeric,
  total_ingreso numeric,
  total_gasto numeric,
  total_contado numeric,
  total_bancos numeric,
  total_efectos numeric,
  total_credito numeric,
  total_efectivo numeric,
  total_tarjeta numeric,
  total_cheque numeric,
  total_ejercicio numeric,
  total_arqueo numeric,
  sobrante numeric,
  total_retirar numeric,
  fondo_final numeric,
  modificado_en timestamptz,
  copiado_en timestamptz not null default now(),
  primary key (oficina, ejercicio)
);
create index if not exists gw_caja_cierre_inicio_idx on public.gw_caja_cierre (inicio);

create table if not exists public.gw_pedido_cliente (
  oficina text not null,
  id_pedido bigint not null,
  fecha date,
  fecha_entrega date,
  hora text,
  cliente_codigo text,
  nombre text,
  nif text,
  sucursal text,
  vendedor_codigo text,
  empleado_codigo text,
  almacen_codigo text,
  presupuesto boolean not null default false,   -- PRESUP = T
  presupuesto_estado smallint,                  -- PRESUPU
  anulado boolean not null default false,
  aceptado boolean not null default false,
  preparado boolean not null default false,
  entregado boolean not null default false,
  liquidado smallint,
  forma_pago text,
  base numeric,
  total_igic numeric,
  total numeric,
  total_pagado numeric,
  total_pendiente numeric,
  venta_oficina text,
  venta_id bigint,
  ruta_codigo text,
  web_id bigint,
  alta_en timestamptz,
  modificado_en timestamptz,
  copiado_en timestamptz not null default now(),
  primary key (oficina, id_pedido)
);
create index if not exists gw_pedido_cliente_fecha_idx on public.gw_pedido_cliente (fecha);
create index if not exists gw_pedido_cliente_cliente_idx on public.gw_pedido_cliente (cliente_codigo, fecha);

create table if not exists public.gw_pedido_cliente_linea (
  oficina text not null,
  id_pedido bigint not null,
  linea bigint not null,
  fecha date,
  articulo_codigo text,
  codigo_venta text,
  codigo_barras text,
  descripcion text,
  almacen_codigo text,
  cantidad numeric,
  total_unidades numeric,
  unidades_liquidadas numeric,
  pvp numeric,
  descuento numeric,
  subtotal numeric,
  igic numeric,
  total_igic numeric,
  total_base numeric,
  modificado_en timestamptz,
  copiado_en timestamptz not null default now(),
  primary key (oficina, id_pedido, linea)
);
create index if not exists gw_pedido_cliente_linea_articulo_idx on public.gw_pedido_cliente_linea (articulo_codigo, fecha);

create table if not exists public.gw_factura_proveedor (
  oficina text not null,
  id_factura bigint not null,
  proveedor_codigo text,
  numero text,
  fecha date,
  fecha_hora timestamptz,
  desde date,
  hasta date,
  fecha_vencimiento date,
  pagado boolean not null default false,
  fecha_pago date,
  subtotal numeric,
  total_igic numeric,
  total numeric,
  total_proveedor numeric,
  total_pagado numeric,
  total_pendiente numeric,
  total_gastos numeric,
  modificado_en timestamptz,
  copiado_en timestamptz not null default now(),
  primary key (oficina, id_factura)
);
create index if not exists gw_factura_proveedor_fecha_idx on public.gw_factura_proveedor (fecha);
create index if not exists gw_factura_proveedor_proveedor_idx on public.gw_factura_proveedor (proveedor_codigo, fecha);

-- PEDIDCAB: lo que hace falta para saber qué falta por recibir (RECIBIDO no sirve) y su factura.
alter table public.gw_pedido_proveedor add column if not exists recepcion boolean not null default false;
alter table public.gw_pedido_proveedor add column if not exists estado_pedido smallint;
alter table public.gw_pedido_proveedor add column if not exists fecha_l date;
alter table public.gw_pedido_proveedor add column if not exists factura_proveedor_oficina text;
alter table public.gw_pedido_proveedor add column if not exists factura_proveedor_id bigint;

comment on table public.gw_venta is 'Copia de solo consulta de VENTAS de GeminisWin (cabecera de venta). Desde el 01/01/2026 por ahora.';
comment on table public.gw_venta_linea is 'Copia de solo consulta de VENTDETA de GeminisWin (líneas de venta, también de las facturas).';
comment on table public.gw_factura is 'Copia de solo consulta de FACTURAS de GeminisWin (facturas de venta; sus líneas son las de sus ventas).';
comment on table public.gw_cobro is 'Copia de solo consulta de PAGOS de GeminisWin (cobros y vencimientos de clientes).';
comment on table public.gw_pago_gasto is 'Copia de solo consulta de PAGOSGST de GeminisWin (pagos de gastos y a proveedores).';
comment on table public.gw_caja_movimiento is 'Copia de solo consulta de CAJA de GeminisWin (movimientos de caja).';
comment on table public.gw_caja_cierre is 'Copia de solo consulta de CAJAAYC de GeminisWin (aperturas y cierres de caja).';
comment on table public.gw_pedido_cliente is 'Copia de solo consulta de PEDIDOS de GeminisWin (pedidos de clientes y presupuestos, PRESUP = T).';
comment on table public.gw_pedido_cliente_linea is 'Copia de solo consulta de PEDIDETA de GeminisWin (líneas de pedidos de clientes y presupuestos).';
comment on table public.gw_factura_proveedor is 'Copia de solo consulta de FACTPROV de GeminisWin (facturas de proveedor; sus líneas son las de sus albaranes en PEDIDLIN).';

-- Lectura: quien tenga alguna de las pantallas del área. Nadie escribe salvo la carga del espejo.
do $$
declare t record;
begin
  for t in select * from (values
      ('gw_venta', '{/ventas,/tpv,/facturacion,/repartos,/listados,/gestor-pedidos-proveedor,/gestor-cobros-clientes}'),
      ('gw_venta_linea', '{/ventas,/tpv,/facturacion,/repartos,/listados,/gestor-pedidos-proveedor,/gestor-cobros-clientes}'),
      ('gw_factura', '{/ventas,/facturacion,/generar-facturas,/listados,/cobros-clientes/ficha,/gestor-cobros-clientes}'),
      ('gw_cobro', '{/ventas,/facturacion,/listados,/cobros-clientes/ficha,/gestor-cobros-clientes}'),
      ('gw_pago_gasto', '{/pagos-proveedor,/gestor-pagos-proveedor,/facturas-proveedor,/listados}'),
      ('gw_caja_movimiento', '{/tpv,/caja/movimientos,/caja/aperturas,/listados}'),
      ('gw_caja_cierre', '{/tpv,/caja/movimientos,/caja/aperturas,/listados}'),
      ('gw_pedido_cliente', '{/pedidos,/presupuestos,/listados,/gestor-pedidos-proveedor}'),
      ('gw_pedido_cliente_linea', '{/pedidos,/presupuestos,/listados,/gestor-pedidos-proveedor}'),
      ('gw_factura_proveedor', '{/facturas-proveedor,/pagos-proveedor,/gestor-pagos-proveedor,/gestor-pedidos-proveedor,/listados}')
    ) v(tabla, rutas) loop
    execute format('alter table public.%I enable row level security', t.tabla);
    if not exists (select 1 from pg_policy where polname = t.tabla || '_lee' and polrelid = ('public.' || t.tabla)::regclass) then
      execute format('create policy %I on public.%I for select to authenticated using ((select public.fn_puede_alguno(%L::text[])))',
                     t.tabla || '_lee', t.tabla, t.rutas);
    end if;
    execute format('revoke all on public.%I from anon', t.tabla);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t.tabla);
  end loop;
end $$;

---------------------------------------------------------------------------------------------- cargas
-- Mismo patrón que las demás: lo llegado en esta tanda (gw_reciente), la última versión de cada clave.

create or replace function public.fn_carga_gw_cliente_sucursal()
returns jsonb language plpgsql set search_path to 'public', 'extensions', 'pg_temp' as $$
declare n int; v_sin int;
begin
  with s as (
    select distinct on (clave) datos d from carga_dbf
     where tabla = 'CLISUCUR' and public.gw_reciente(cargado_en) and gw_t(datos, 'IDCLIENTE') is not null and gw_t(datos, 'IDCLISUCUR') is not null
     order by clave, cargado_en desc
  ), f as (
    select d from s where exists (select 1 from cliente c where c.codigo = gw_t(s.d, 'IDCLIENTE'))
  ), u as (
    insert into cliente_sucursal as x (cliente_codigo, codigo, nombre, nif, gerente, contacto, direccion, codigo_postal, provincia_codigo,
      pais_codigo, poblacion, telefono_fijo, telefono_movil, fax, zona_territorial_codigo, vendedor_codigo, ruta_codigo, orden_en_ruta,
      email, web, face_unidad_tramitadora, face_unidad_tramitadora_nombre, face_oficina_contable, face_oficina_contable_nombre,
      face_organo_gestor, face_organo_gestor_nombre, fecha_alta, fecha_baja, actualizado_en)
    select gw_t(d, 'IDCLIENTE'), gw_t(d, 'IDCLISUCUR'), coalesce(gw_t(d, 'NOMBRE'), gw_t(d, 'IDCLISUCUR')), gw_t(d, 'NIF'), gw_t(d, 'GERENTE'),
      gw_t(d, 'CONTACTO'), gw_t(d, 'DIRECCION'), gw_t(d, 'CODPOSTAL'),
      (select codigo from provincia p where p.codigo = gw_t(d, 'CODPROV')), gw_pais(gw_t(d, 'CODPAIS')), gw_t(d, 'POBLACION'),
      gw_t(d, 'TLF_FIJO'), gw_t(d, 'TLF_MOVIL'), gw_t(d, 'TLF_FAX'),
      (select codigo from zona_territorial z where z.codigo = gw_t(d, 'ZONATERRIT')),
      (select codigo from vendedor v where v.codigo = gw_t(d, 'VENDEDOR')),
      (select codigo from ruta r where r.codigo = gw_t(d, 'IDRUTA')), gw_n(d, 'N_ORDENRUT')::smallint,
      gw_t(d, 'DIREMAIL'), gw_t(d, 'DIRWEB'), gw_t(d, 'FACEUNDTRA'), gw_t(d, 'FACEUTNAME'), gw_t(d, 'FACEOFICON'), gw_t(d, 'FACEOCNAME'),
      gw_t(d, 'FACEORGGES'), gw_t(d, 'FACEOGNAME'), gw_d(d, 'F_ALTA'), gw_d(d, 'F_BAJA'), now()
      from f
    on conflict (cliente_codigo, codigo) do update set nombre = excluded.nombre, nif = excluded.nif, gerente = excluded.gerente,
      contacto = excluded.contacto, direccion = excluded.direccion, codigo_postal = excluded.codigo_postal,
      provincia_codigo = excluded.provincia_codigo, pais_codigo = excluded.pais_codigo, poblacion = excluded.poblacion,
      telefono_fijo = excluded.telefono_fijo, telefono_movil = excluded.telefono_movil, fax = excluded.fax,
      zona_territorial_codigo = excluded.zona_territorial_codigo, vendedor_codigo = excluded.vendedor_codigo,
      ruta_codigo = excluded.ruta_codigo, orden_en_ruta = excluded.orden_en_ruta, email = excluded.email, web = excluded.web,
      face_unidad_tramitadora = excluded.face_unidad_tramitadora, face_unidad_tramitadora_nombre = excluded.face_unidad_tramitadora_nombre,
      face_oficina_contable = excluded.face_oficina_contable, face_oficina_contable_nombre = excluded.face_oficina_contable_nombre,
      face_organo_gestor = excluded.face_organo_gestor, face_organo_gestor_nombre = excluded.face_organo_gestor_nombre,
      fecha_alta = excluded.fecha_alta, fecha_baja = excluded.fecha_baja, actualizado_en = now()
    returning 1)
  select (select count(*) from u), (select count(*) from s) - (select count(*) from f) into n, v_sin;
  return jsonb_build_object('tabla', 'cliente_sucursal', 'filas', n, 'sin_cliente', v_sin);
end $$;

create or replace function public.fn_carga_gw_gw_venta()
returns jsonb language plpgsql set search_path to 'public', 'extensions', 'pg_temp' as $$
declare n int;
begin
  with s as (
    select distinct on (clave) datos d from carga_dbf
     where tabla = 'VENTAS' and public.gw_reciente(cargado_en) and gw_t(datos, 'IDOFICINA') is not null and gw_n(datos, 'IDVENTA') is not null
     order by clave, cargado_en desc
  ), u as (
    insert into gw_venta (oficina, id_venta, fecha, hora, cliente_codigo, nombre, nif, sucursal, vendedor_codigo, empleado_codigo, almacen_codigo,
      tarifa, forma_pago_tipo, forma_pago, tipo_credito, subtotal, descuento_pie, total_descuento_pie, base, total_igic, total, total_efectivo,
      total_tarjeta, total_pagado, total_pendiente, devolucion, fecha_pago, factura_oficina, factura_id, pedido_oficina, pedido_id, reparto,
      reparto_oficina, reparto_id, ruta_codigo, turno_oficina, turno_numero, alta_en, modificado_en, copiado_en)
    select gw_t(d, 'IDOFICINA'), gw_n(d, 'IDVENTA')::bigint, gw_d(d, 'FECHA'), gw_t(d, 'HORA'), gw_t(d, 'IDCLIENTE'), gw_t(d, 'NOMBRE'),
      gw_t(d, 'NIF'), gw_t(d, 'IDCLISUCUR'), gw_t(d, 'IDVENDEDOR'), gw_t(d, 'IDEMPLEADO'), gw_t(d, 'IDALMACEN'), gw_t(d, 'TARIFA'),
      gw_n(d, 'FORMAPAGO')::smallint, gw_t(d, 'FORMA_P'), gw_t(d, 'TIPOCREDIT'), gw_n(d, 'SUBTOT'), gw_n(d, 'DTOPIE'), gw_n(d, 'TOTDTOPIE'),
      gw_n(d, 'SUBTOT2'), gw_n(d, 'TOTIGICPIE'), gw_n(d, 'TOTAL'), gw_n(d, 'TOT_EF'), gw_n(d, 'TOT_TAR'), gw_n(d, 'TOT_PAG'), gw_n(d, 'TOT_PEND'),
      gw_n(d, 'DEVOLUCION'), gw_d(d, 'FECHA_PAGO'), gw_t(d, 'IDOFIFRA'), gw_n(d, 'IDFACTURA')::bigint, gw_t(d, 'IDOFIPED'),
      gw_n(d, 'IDPEDIDO')::bigint, gw_n(d, 'REPARTO')::smallint, gw_t(d, 'IDOFIPREP'), gw_n(d, 'IDREPARTO')::bigint, gw_t(d, 'IDRUTA'),
      gw_t(d, 'OFICTURNO'), gw_n(d, 'N_TURNO')::bigint, gw_ts(d, 'FECHORALTA'), gw_ts(d, 'ULTMOD'), now()
      from s
    on conflict (oficina, id_venta) do update set fecha = excluded.fecha, hora = excluded.hora, cliente_codigo = excluded.cliente_codigo,
      nombre = excluded.nombre, nif = excluded.nif, sucursal = excluded.sucursal, vendedor_codigo = excluded.vendedor_codigo,
      empleado_codigo = excluded.empleado_codigo, almacen_codigo = excluded.almacen_codigo, tarifa = excluded.tarifa,
      forma_pago_tipo = excluded.forma_pago_tipo, forma_pago = excluded.forma_pago, tipo_credito = excluded.tipo_credito,
      subtotal = excluded.subtotal, descuento_pie = excluded.descuento_pie, total_descuento_pie = excluded.total_descuento_pie,
      base = excluded.base, total_igic = excluded.total_igic, total = excluded.total, total_efectivo = excluded.total_efectivo,
      total_tarjeta = excluded.total_tarjeta, total_pagado = excluded.total_pagado, total_pendiente = excluded.total_pendiente,
      devolucion = excluded.devolucion, fecha_pago = excluded.fecha_pago, factura_oficina = excluded.factura_oficina,
      factura_id = excluded.factura_id, pedido_oficina = excluded.pedido_oficina, pedido_id = excluded.pedido_id, reparto = excluded.reparto,
      reparto_oficina = excluded.reparto_oficina, reparto_id = excluded.reparto_id, ruta_codigo = excluded.ruta_codigo,
      turno_oficina = excluded.turno_oficina, turno_numero = excluded.turno_numero, alta_en = excluded.alta_en,
      modificado_en = excluded.modificado_en, copiado_en = now()
    returning 1)
  select count(*) into n from u;
  return jsonb_build_object('tabla', 'gw_venta', 'filas', n);
end $$;

create or replace function public.fn_carga_gw_gw_venta_linea()
returns jsonb language plpgsql set search_path to 'public', 'extensions', 'pg_temp' as $$
declare n int;
begin
  with s as (
    select distinct on (clave) datos d from carga_dbf
     where tabla = 'VENTDETA' and public.gw_reciente(cargado_en) and gw_t(datos, 'IDOFICINA') is not null and gw_n(datos, 'IDVENTA') is not null
     order by clave, cargado_en desc
  ), u as (
    insert into gw_venta_linea (oficina, id_venta, linea, fecha, articulo_codigo, codigo_venta, codigo_barras, descripcion, almacen_codigo,
      cantidad, total_unidades, pvp, descuento, subtotal, igic, total_igic, total_base, precio_liquidacion, coste, tipo_movimiento,
      empleado_codigo, tecnico_codigo, modificado_en, copiado_en)
    select gw_t(d, 'IDOFICINA'), gw_n(d, 'IDVENTA')::bigint, coalesce(gw_n(d, 'NUMLINEA'), 0)::bigint, gw_d(d, 'FECHA'), gw_t(d, 'COD_INTERN'),
      gw_t(d, 'COD_VENTA'), gw_t(d, 'COD_BARRAS'), gw_t(d, 'DESCRIP'), gw_t(d, 'IDALMACEN'), gw_n(d, 'CANTIDAD'), gw_n(d, 'TOTUNIDS'),
      gw_n(d, 'PVP'), gw_n(d, 'DTO'), gw_n(d, 'SUBTOTAL'), gw_n(d, 'IGIC'), gw_n(d, 'TOT_IGIC'), gw_n(d, 'TOT_BASE'), gw_n(d, 'P_LIQ'),
      gw_n(d, 'P_LIQCOMPR'), gw_n(d, 'TIPO_MOV')::smallint, gw_t(d, 'IDEMPLEADO'), gw_t(d, 'IDTECNICO'), gw_ts(d, 'ULTMOD'), now()
      from s
    on conflict (oficina, id_venta, linea) do update set fecha = excluded.fecha, articulo_codigo = excluded.articulo_codigo,
      codigo_venta = excluded.codigo_venta, codigo_barras = excluded.codigo_barras, descripcion = excluded.descripcion,
      almacen_codigo = excluded.almacen_codigo, cantidad = excluded.cantidad, total_unidades = excluded.total_unidades, pvp = excluded.pvp,
      descuento = excluded.descuento, subtotal = excluded.subtotal, igic = excluded.igic, total_igic = excluded.total_igic,
      total_base = excluded.total_base, precio_liquidacion = excluded.precio_liquidacion, coste = excluded.coste,
      tipo_movimiento = excluded.tipo_movimiento, empleado_codigo = excluded.empleado_codigo, tecnico_codigo = excluded.tecnico_codigo,
      modificado_en = excluded.modificado_en, copiado_en = now()
    returning 1)
  select count(*) into n from u;
  return jsonb_build_object('tabla', 'gw_venta_linea', 'filas', n);
end $$;

create or replace function public.fn_carga_gw_gw_factura()
returns jsonb language plpgsql set search_path to 'public', 'extensions', 'pg_temp' as $$
declare n int;
begin
  with s as (
    select distinct on (clave) datos d from carga_dbf
     where tabla = 'FACTURAS' and public.gw_reciente(cargado_en) and gw_t(datos, 'IDOFICINA') is not null and gw_n(datos, 'IDFACTURA') is not null
     order by clave, cargado_en desc
  ), u as (
    insert into gw_factura (oficina, id_factura, numero, cliente_codigo, nombre, nif, sucursal, vendedor_codigo, empleado_codigo, fecha, desde,
      hasta, estado, subtotal, descuento_pie, total_descuento, total_bases, total_igic, total, total_pagado, total_pendiente, fecha_pago,
      numero_pagos, forma_pago_tipo, forma_pago, tipo_credito, retencion, global, modificado_en, copiado_en)
    select gw_t(d, 'IDOFICINA'), gw_n(d, 'IDFACTURA')::bigint, gw_n(d, 'N_FACTURA')::bigint, gw_t(d, 'IDCLIENTE'), gw_t(d, 'NOMBRE_FRA'),
      gw_t(d, 'NIF_FRA'), gw_t(d, 'IDCLISUCFR'), gw_t(d, 'IDVEND_FRA'), gw_t(d, 'IDEMPL_FRA'), gw_d(d, 'FECH_FRA'), gw_d(d, 'FECH_DESDE'),
      gw_d(d, 'FECH_HASTA'), gw_t(d, 'ESTADO_FRA'), gw_n(d, 'SUBTOT_FRA'), gw_n(d, 'DTOPIEFACT'), gw_n(d, 'TOTDTOFACT'), gw_n(d, 'TOT_BASES'),
      gw_n(d, 'TOT_IGICS'), gw_n(d, 'TOTAL_FRA'), gw_n(d, 'TOTAL_PAG'), gw_n(d, 'TOTPENDFRA'), gw_d(d, 'FECHPAGFRA'), gw_n(d, 'N_PAGOS')::int,
      gw_n(d, 'FORMAPAGO')::smallint, gw_t(d, 'FORMA_P'), gw_t(d, 'T_FORMA'), gw_n(d, 'RETENCION'), gw_n(d, 'GLOBAL')::smallint,
      gw_ts(d, 'ULTMOD'), now()
      from s
    on conflict (oficina, id_factura) do update set numero = excluded.numero, cliente_codigo = excluded.cliente_codigo, nombre = excluded.nombre,
      nif = excluded.nif, sucursal = excluded.sucursal, vendedor_codigo = excluded.vendedor_codigo, empleado_codigo = excluded.empleado_codigo,
      fecha = excluded.fecha, desde = excluded.desde, hasta = excluded.hasta, estado = excluded.estado, subtotal = excluded.subtotal,
      descuento_pie = excluded.descuento_pie, total_descuento = excluded.total_descuento, total_bases = excluded.total_bases,
      total_igic = excluded.total_igic, total = excluded.total, total_pagado = excluded.total_pagado, total_pendiente = excluded.total_pendiente,
      fecha_pago = excluded.fecha_pago, numero_pagos = excluded.numero_pagos, forma_pago_tipo = excluded.forma_pago_tipo,
      forma_pago = excluded.forma_pago, tipo_credito = excluded.tipo_credito, retencion = excluded.retencion, global = excluded.global,
      modificado_en = excluded.modificado_en, copiado_en = now()
    returning 1)
  select count(*) into n from u;
  return jsonb_build_object('tabla', 'gw_factura', 'filas', n);
end $$;

create or replace function public.fn_carga_gw_gw_cobro()
returns jsonb language plpgsql set search_path to 'public', 'extensions', 'pg_temp' as $$
declare n int;
begin
  with s as (
    select distinct on (clave) datos d from carga_dbf
     where tabla = 'PAGOS' and public.gw_reciente(cargado_en) and gw_t(datos, 'IDOFICINA') is not null and gw_n(datos, 'COD_PAGO') is not null
     order by clave, cargado_en desc
  ), u as (
    insert into gw_cobro (oficina, cod_pago, id_pago, cliente_codigo, factura_oficina, factura_id, numero_factura, fecha, fecha_pago,
      fecha_vencimiento, cuota, pagado, estado, tipo_pago, es_efecto, domiciliado, concepto, documento, cuenta_contable, venta_oficina, venta_id,
      no_contabilizar, modificado_en, copiado_en)
    select gw_t(d, 'IDOFICINA'), gw_n(d, 'COD_PAGO')::bigint, coalesce(gw_n(d, 'IDPAGO'), 0)::int, gw_t(d, 'IDCLIENTE'), gw_t(d, 'IDOFIFRA'),
      gw_n(d, 'IDFACTURA')::bigint, gw_t(d, 'NUM_FRA'), gw_d(d, 'FECHA'), gw_d(d, 'FECH_PAGO'), gw_d(d, 'FECH_VENC'), gw_n(d, 'CUOTA'),
      gw_n(d, 'PAGADO'), gw_t(d, 'ESTADO_PAG'), gw_t(d, 'TIPOPAGO'), coalesce(gw_b(d, 'ESEFECTO'), false), coalesce(gw_b(d, 'ESDOMICIL'), false),
      gw_t(d, 'CONCEPTO'), gw_t(d, 'N_DOC_PAGO'), gw_t(d, 'CTACONT'), gw_t(d, 'IDOFIVTARE'), gw_n(d, 'IDVENTAREL')::bigint,
      coalesce(gw_b(d, 'NOCONTABIL'), false), gw_ts(d, 'ULTMOD'), now()
      from s
    on conflict (oficina, cod_pago, id_pago) do update set cliente_codigo = excluded.cliente_codigo, factura_oficina = excluded.factura_oficina,
      factura_id = excluded.factura_id, numero_factura = excluded.numero_factura, fecha = excluded.fecha, fecha_pago = excluded.fecha_pago,
      fecha_vencimiento = excluded.fecha_vencimiento, cuota = excluded.cuota, pagado = excluded.pagado, estado = excluded.estado,
      tipo_pago = excluded.tipo_pago, es_efecto = excluded.es_efecto, domiciliado = excluded.domiciliado, concepto = excluded.concepto,
      documento = excluded.documento, cuenta_contable = excluded.cuenta_contable, venta_oficina = excluded.venta_oficina,
      venta_id = excluded.venta_id, no_contabilizar = excluded.no_contabilizar, modificado_en = excluded.modificado_en, copiado_en = now()
    returning 1)
  select count(*) into n from u;
  return jsonb_build_object('tabla', 'gw_cobro', 'filas', n);
end $$;

create or replace function public.fn_carga_gw_gw_pago_gasto()
returns jsonb language plpgsql set search_path to 'public', 'extensions', 'pg_temp' as $$
declare n int;
begin
  with s as (
    select distinct on (clave) datos d from carga_dbf
     where tabla = 'PAGOSGST' and public.gw_reciente(cargado_en) and gw_t(datos, 'IDOFICINA') is not null and gw_n(datos, 'COD_PAGO') is not null
     order by clave, cargado_en desc
  ), u as (
    insert into gw_pago_gasto (oficina, cod_pago, id_pago, tipo_movimiento, tipo_receptor, receptor_codigo, receptor_nombre, numero_factura,
      fecha_factura, fecha, fecha_pago, fecha_vencimiento, cuota, pagado, estado, tipo_pago, es_efecto, domiciliado, concepto, documento,
      cuenta_contable, pedido_oficina, pedido_numero, factura_proveedor_oficina, factura_proveedor_id, modificado_en, copiado_en)
    select gw_t(d, 'IDOFICINA'), gw_n(d, 'COD_PAGO')::bigint, coalesce(gw_n(d, 'IDPAGO'), 0)::int, gw_n(d, 'TIPO_MOV')::smallint,
      gw_n(d, 'TIP_RECEPT')::smallint, gw_t(d, 'COD_RECEPT'), gw_t(d, 'NOMBRECEPT'), gw_t(d, 'NUM_FRA'), gw_d(d, 'FECHA_FRA'), gw_d(d, 'FECHA'),
      gw_d(d, 'FECH_PAGO'), gw_d(d, 'FECH_VENC'), gw_n(d, 'CUOTA'), gw_n(d, 'PAGADO'), gw_t(d, 'ESTADO_PAG'), gw_t(d, 'TIPOPAGO'),
      coalesce(gw_b(d, 'ESEFECTO'), false), coalesce(gw_b(d, 'ESDOMICIL'), false), gw_t(d, 'CONCEPTO'), gw_t(d, 'N_DOC_PAGO'),
      gw_t(d, 'CTACONT'), gw_t(d, 'IDOFIPEDRE'), gw_n(d, 'NUMPEDIREL')::bigint, gw_t(d, 'IDOFIFRARE'), gw_n(d, 'IDFACTPREL')::bigint,
      gw_ts(d, 'ULTMOD'), now()
      from s
    on conflict (oficina, cod_pago, id_pago) do update set tipo_movimiento = excluded.tipo_movimiento, tipo_receptor = excluded.tipo_receptor,
      receptor_codigo = excluded.receptor_codigo, receptor_nombre = excluded.receptor_nombre, numero_factura = excluded.numero_factura,
      fecha_factura = excluded.fecha_factura, fecha = excluded.fecha, fecha_pago = excluded.fecha_pago,
      fecha_vencimiento = excluded.fecha_vencimiento, cuota = excluded.cuota, pagado = excluded.pagado, estado = excluded.estado,
      tipo_pago = excluded.tipo_pago, es_efecto = excluded.es_efecto, domiciliado = excluded.domiciliado, concepto = excluded.concepto,
      documento = excluded.documento, cuenta_contable = excluded.cuenta_contable, pedido_oficina = excluded.pedido_oficina,
      pedido_numero = excluded.pedido_numero, factura_proveedor_oficina = excluded.factura_proveedor_oficina,
      factura_proveedor_id = excluded.factura_proveedor_id, modificado_en = excluded.modificado_en, copiado_en = now()
    returning 1)
  select count(*) into n from u;
  return jsonb_build_object('tabla', 'gw_pago_gasto', 'filas', n);
end $$;

create or replace function public.fn_carga_gw_gw_caja_movimiento()
returns jsonb language plpgsql set search_path to 'public', 'extensions', 'pg_temp' as $$
declare n int;
begin
  with s as (
    select distinct on (clave) datos d from carga_dbf
     where tabla = 'CAJA' and public.gw_reciente(cargado_en) and gw_t(datos, 'IDOFICINA') is not null and gw_n(datos, 'IDMOV') is not null
     order by clave, cargado_en desc
  ), u as (
    insert into gw_caja_movimiento (oficina, id_mov, fecha, hora, documento, ingreso_o_gasto, ingreso, gasto, concepto, tipo_movimiento,
      tipo_descripcion, forma_codigo, forma, cliente_codigo, proveedor_codigo, empleado_codigo, turno_oficina, turno_numero, ajeno_oficina,
      ajeno_codigo, modificado_en, copiado_en)
    select gw_t(d, 'IDOFICINA'), gw_n(d, 'IDMOV')::bigint, gw_d(d, 'FECHA'), gw_t(d, 'HORA'), gw_t(d, 'DOCUMENTO'), gw_t(d, 'INGOGASTO'),
      gw_n(d, 'INGRESO'), gw_n(d, 'GASTO'), gw_t(d, 'CONCEPTO'), gw_t(d, 'TIPOMOV'), gw_t(d, 'DESCRTIPO'), gw_t(d, 'CODFORMA'), gw_t(d, 'FORMA_P'),
      gw_t(d, 'IDCLIENTE'), gw_t(d, 'CODPROV'), gw_t(d, 'IDEMPLEADO'), gw_t(d, 'OFICTURNO'), gw_n(d, 'N_TURNO')::bigint, gw_t(d, 'IDOFICAJEN'),
      gw_n(d, 'CODAJENO')::bigint, gw_ts(d, 'ULTMOD'), now()
      from s
    on conflict (oficina, id_mov) do update set fecha = excluded.fecha, hora = excluded.hora, documento = excluded.documento,
      ingreso_o_gasto = excluded.ingreso_o_gasto, ingreso = excluded.ingreso, gasto = excluded.gasto, concepto = excluded.concepto,
      tipo_movimiento = excluded.tipo_movimiento, tipo_descripcion = excluded.tipo_descripcion, forma_codigo = excluded.forma_codigo,
      forma = excluded.forma, cliente_codigo = excluded.cliente_codigo, proveedor_codigo = excluded.proveedor_codigo,
      empleado_codigo = excluded.empleado_codigo, turno_oficina = excluded.turno_oficina, turno_numero = excluded.turno_numero,
      ajeno_oficina = excluded.ajeno_oficina, ajeno_codigo = excluded.ajeno_codigo, modificado_en = excluded.modificado_en, copiado_en = now()
    returning 1)
  select count(*) into n from u;
  return jsonb_build_object('tabla', 'gw_caja_movimiento', 'filas', n);
end $$;

create or replace function public.fn_carga_gw_gw_caja_cierre()
returns jsonb language plpgsql set search_path to 'public', 'extensions', 'pg_temp' as $$
declare n int;
begin
  with s as (
    select distinct on (clave) datos d from carga_dbf
     where tabla = 'CAJAAYC' and public.gw_reciente(cargado_en) and gw_t(datos, 'IDOFICINA') is not null and gw_n(datos, 'N_EJERC') is not null
     order by clave, cargado_en desc
  ), u as (
    insert into gw_caja_cierre (oficina, ejercicio, inicio, fin, cerrado, empleado_inicio, empleado_fin, fondo_inicial, total_ingreso, total_gasto,
      total_contado, total_bancos, total_efectos, total_credito, total_efectivo, total_tarjeta, total_cheque, total_ejercicio, total_arqueo,
      sobrante, total_retirar, fondo_final, modificado_en, copiado_en)
    select gw_t(d, 'IDOFICINA'), gw_n(d, 'N_EJERC')::bigint, gw_ts(d, 'FECHA_INI'), gw_ts(d, 'FECHA_FIN'), coalesce(gw_b(d, 'CERRADO'), false),
      gw_t(d, 'IDEMPL_INI'), gw_t(d, 'IDEMPL_FIN'), gw_n(d, 'FONDO_INI'), gw_n(d, 'TOTINGRESO'), gw_n(d, 'TOTGASTO'), gw_n(d, 'TOTCONTADO'),
      gw_n(d, 'TOTBANCOS'), gw_n(d, 'TOTEFECTOS'), gw_n(d, 'TOTCREDITO'), gw_n(d, 'TOTEFECTIV'), gw_n(d, 'TOTTARJETA'), gw_n(d, 'TOTCHEQUE'),
      gw_n(d, 'TOTALEJERC'), gw_n(d, 'TOTARQUEO'), gw_n(d, 'SOBRANTE'), gw_n(d, 'TOTRETIRAR'), gw_n(d, 'FONDO_FIN'), gw_ts(d, 'ULTMOD'), now()
      from s
    on conflict (oficina, ejercicio) do update set inicio = excluded.inicio, fin = excluded.fin, cerrado = excluded.cerrado,
      empleado_inicio = excluded.empleado_inicio, empleado_fin = excluded.empleado_fin, fondo_inicial = excluded.fondo_inicial,
      total_ingreso = excluded.total_ingreso, total_gasto = excluded.total_gasto, total_contado = excluded.total_contado,
      total_bancos = excluded.total_bancos, total_efectos = excluded.total_efectos, total_credito = excluded.total_credito,
      total_efectivo = excluded.total_efectivo, total_tarjeta = excluded.total_tarjeta, total_cheque = excluded.total_cheque,
      total_ejercicio = excluded.total_ejercicio, total_arqueo = excluded.total_arqueo, sobrante = excluded.sobrante,
      total_retirar = excluded.total_retirar, fondo_final = excluded.fondo_final, modificado_en = excluded.modificado_en, copiado_en = now()
    returning 1)
  select count(*) into n from u;
  return jsonb_build_object('tabla', 'gw_caja_cierre', 'filas', n);
end $$;

create or replace function public.fn_carga_gw_gw_pedido_cliente()
returns jsonb language plpgsql set search_path to 'public', 'extensions', 'pg_temp' as $$
declare n int;
begin
  with s as (
    select distinct on (clave) datos d from carga_dbf
     where tabla = 'PEDIDOS' and public.gw_reciente(cargado_en) and gw_t(datos, 'IDOFICINA') is not null and gw_n(datos, 'IDPEDIDO') is not null
     order by clave, cargado_en desc
  ), u as (
    insert into gw_pedido_cliente (oficina, id_pedido, fecha, fecha_entrega, hora, cliente_codigo, nombre, nif, sucursal, vendedor_codigo,
      empleado_codigo, almacen_codigo, presupuesto, presupuesto_estado, anulado, aceptado, preparado, entregado, liquidado, forma_pago, base,
      total_igic, total, total_pagado, total_pendiente, venta_oficina, venta_id, ruta_codigo, web_id, alta_en, modificado_en, copiado_en)
    select gw_t(d, 'IDOFICINA'), gw_n(d, 'IDPEDIDO')::bigint, gw_d(d, 'FECHA'), gw_d(d, 'FECHA_ENTR'), gw_t(d, 'HORA'), gw_t(d, 'IDCLIENTE'),
      gw_t(d, 'NOMBRE'), gw_t(d, 'NIF'), gw_t(d, 'IDCLISUCUR'), gw_t(d, 'IDVENDEDOR'), gw_t(d, 'IDEMPLEADO'), gw_t(d, 'IDALMACEN'),
      coalesce(gw_b(d, 'PRESUP'), false), gw_n(d, 'PRESUPU')::smallint, coalesce(gw_b(d, 'ANULADO'), false), coalesce(gw_b(d, 'ACEPTADO'), false),
      coalesce(gw_b(d, 'PREPARADO'), false), coalesce(gw_b(d, 'ENTREGADO'), false), gw_n(d, 'LIQUIDADO')::smallint, gw_t(d, 'FORMA_P'),
      gw_n(d, 'SUBTOT2'), gw_n(d, 'TOTIGICPIE'), gw_n(d, 'TOTAL'), gw_n(d, 'TOT_PAG'), gw_n(d, 'TOT_PEND'), gw_t(d, 'IDOFIVTA'),
      gw_n(d, 'IDVENTA')::bigint, gw_t(d, 'IDRUTA'), gw_n(d, 'WEBIDPED')::bigint, gw_ts(d, 'FECHORALTA'), gw_ts(d, 'ULTMOD'), now()
      from s
    on conflict (oficina, id_pedido) do update set fecha = excluded.fecha, fecha_entrega = excluded.fecha_entrega, hora = excluded.hora,
      cliente_codigo = excluded.cliente_codigo, nombre = excluded.nombre, nif = excluded.nif, sucursal = excluded.sucursal,
      vendedor_codigo = excluded.vendedor_codigo, empleado_codigo = excluded.empleado_codigo, almacen_codigo = excluded.almacen_codigo,
      presupuesto = excluded.presupuesto, presupuesto_estado = excluded.presupuesto_estado, anulado = excluded.anulado,
      aceptado = excluded.aceptado, preparado = excluded.preparado, entregado = excluded.entregado, liquidado = excluded.liquidado,
      forma_pago = excluded.forma_pago, base = excluded.base, total_igic = excluded.total_igic, total = excluded.total,
      total_pagado = excluded.total_pagado, total_pendiente = excluded.total_pendiente, venta_oficina = excluded.venta_oficina,
      venta_id = excluded.venta_id, ruta_codigo = excluded.ruta_codigo, web_id = excluded.web_id, alta_en = excluded.alta_en,
      modificado_en = excluded.modificado_en, copiado_en = now()
    returning 1)
  select count(*) into n from u;
  return jsonb_build_object('tabla', 'gw_pedido_cliente', 'filas', n);
end $$;

create or replace function public.fn_carga_gw_gw_pedido_cliente_linea()
returns jsonb language plpgsql set search_path to 'public', 'extensions', 'pg_temp' as $$
declare n int;
begin
  with s as (
    select distinct on (clave) datos d from carga_dbf
     where tabla = 'PEDIDETA' and public.gw_reciente(cargado_en) and gw_t(datos, 'IDOFICINA') is not null and gw_n(datos, 'IDPEDIDO') is not null
     order by clave, cargado_en desc
  ), u as (
    insert into gw_pedido_cliente_linea (oficina, id_pedido, linea, fecha, articulo_codigo, codigo_venta, codigo_barras, descripcion,
      almacen_codigo, cantidad, total_unidades, unidades_liquidadas, pvp, descuento, subtotal, igic, total_igic, total_base, modificado_en, copiado_en)
    select gw_t(d, 'IDOFICINA'), gw_n(d, 'IDPEDIDO')::bigint, coalesce(gw_n(d, 'NUMLINEA'), 0)::bigint, gw_d(d, 'FECHA'), gw_t(d, 'COD_INTERN'),
      gw_t(d, 'COD_VENTA'), gw_t(d, 'COD_BARRAS'), gw_t(d, 'DESCRIP'), gw_t(d, 'IDALMACEN'), gw_n(d, 'CANTIDAD'), gw_n(d, 'TOTUNIDS'),
      gw_n(d, 'UNIDSLIQ'), gw_n(d, 'PVP'), gw_n(d, 'DTO'), gw_n(d, 'SUBTOTAL'), gw_n(d, 'IGIC'), gw_n(d, 'TOT_IGIC'), gw_n(d, 'TOT_BASE'),
      gw_ts(d, 'ULTMOD'), now()
      from s
    on conflict (oficina, id_pedido, linea) do update set fecha = excluded.fecha, articulo_codigo = excluded.articulo_codigo,
      codigo_venta = excluded.codigo_venta, codigo_barras = excluded.codigo_barras, descripcion = excluded.descripcion,
      almacen_codigo = excluded.almacen_codigo, cantidad = excluded.cantidad, total_unidades = excluded.total_unidades,
      unidades_liquidadas = excluded.unidades_liquidadas, pvp = excluded.pvp, descuento = excluded.descuento, subtotal = excluded.subtotal,
      igic = excluded.igic, total_igic = excluded.total_igic, total_base = excluded.total_base, modificado_en = excluded.modificado_en,
      copiado_en = now()
    returning 1)
  select count(*) into n from u;
  return jsonb_build_object('tabla', 'gw_pedido_cliente_linea', 'filas', n);
end $$;

create or replace function public.fn_carga_gw_gw_factura_proveedor()
returns jsonb language plpgsql set search_path to 'public', 'extensions', 'pg_temp' as $$
declare n int;
begin
  with s as (
    select distinct on (clave) datos d from carga_dbf
     where tabla = 'FACTPROV' and public.gw_reciente(cargado_en) and gw_t(datos, 'IDOFICINA') is not null and gw_n(datos, 'IDFACTPROV') is not null
     order by clave, cargado_en desc
  ), u as (
    insert into gw_factura_proveedor (oficina, id_factura, proveedor_codigo, numero, fecha, fecha_hora, desde, hasta, fecha_vencimiento, pagado,
      fecha_pago, subtotal, total_igic, total, total_proveedor, total_pagado, total_pendiente, total_gastos, modificado_en, copiado_en)
    select gw_t(d, 'IDOFICINA'), gw_n(d, 'IDFACTPROV')::bigint, gw_t(d, 'COD_PROV'), gw_t(d, 'NUM_FACTUR'), gw_d(d, 'FECHA_F'),
      gw_ts(d, 'FECHAHORA'), gw_d(d, 'FECHA_D'), gw_d(d, 'FECHA_H'), gw_d(d, 'FECHA_VEN'), coalesce(gw_b(d, 'PAGADO'), false), gw_d(d, 'FECHA_PAG'),
      gw_n(d, 'SUBTOTAL'), gw_n(d, 'TOTIGIC'), gw_n(d, 'TOTAL'), gw_n(d, 'TOTFRAPROV'), gw_n(d, 'TOTPAGPROV'), gw_n(d, 'TOTPENDPRO'),
      gw_n(d, 'TOTGASTOS'), gw_ts(d, 'ULTMOD'), now()
      from s
    on conflict (oficina, id_factura) do update set proveedor_codigo = excluded.proveedor_codigo, numero = excluded.numero, fecha = excluded.fecha,
      fecha_hora = excluded.fecha_hora, desde = excluded.desde, hasta = excluded.hasta, fecha_vencimiento = excluded.fecha_vencimiento,
      pagado = excluded.pagado, fecha_pago = excluded.fecha_pago, subtotal = excluded.subtotal, total_igic = excluded.total_igic,
      total = excluded.total, total_proveedor = excluded.total_proveedor, total_pagado = excluded.total_pagado,
      total_pendiente = excluded.total_pendiente, total_gastos = excluded.total_gastos, modificado_en = excluded.modificado_en, copiado_en = now()
    returning 1)
  select count(*) into n from u;
  return jsonb_build_object('tabla', 'gw_factura_proveedor', 'filas', n);
end $$;

-- PEDIDCAB con los campos nuevos (RECEPCION, ESTADOPED, FECHA_L y su factura).
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
                                          abono, numero_albaran, fecha_albaran, numero_factura, total, recepcion, estado_pedido, fecha_l,
                                          factura_proveedor_oficina, factura_proveedor_id, copiado_en)
    select gw_t(d, 'IDOFICINA'), gw_n(d, 'NUMERO')::bigint, gw_t(d, 'COD_PROV'), gw_t(d, 'ALMACEN'), gw_ts(d, 'FECHAHORA'),
           gw_n(d, 'TIPODOC')::smallint, coalesce(gw_b(d, 'RECIBIDO'), false), coalesce(gw_b(d, 'ACTUAL'), false), coalesce(gw_b(d, 'ABONO'), false),
           gw_t(d, 'NUM_ALBA'), gw_d(d, 'FECHA_ALBA'), gw_t(d, 'NUM_FACTUR'), gw_n(d, 'TOTAL'), coalesce(gw_b(d, 'RECEPCION'), false),
           gw_n(d, 'ESTADOPED')::smallint, gw_d(d, 'FECHA_L'), gw_t(d, 'IDOFIFRA'), gw_n(d, 'IDFACTPROV')::bigint, now()
      from s
    on conflict (oficina, numero) do update set proveedor_codigo = excluded.proveedor_codigo, almacen_codigo = excluded.almacen_codigo,
      fecha_hora = excluded.fecha_hora, tipo_documento = excluded.tipo_documento, recibido = excluded.recibido, actualizado = excluded.actualizado,
      abono = excluded.abono, numero_albaran = excluded.numero_albaran, fecha_albaran = excluded.fecha_albaran,
      numero_factura = excluded.numero_factura, total = excluded.total, recepcion = excluded.recepcion, estado_pedido = excluded.estado_pedido,
      fecha_l = excluded.fecha_l, factura_proveedor_oficina = excluded.factura_proveedor_oficina,
      factura_proveedor_id = excluded.factura_proveedor_id, copiado_en = now()
    returning 1)
  select count(*) into n from u;
  return jsonb_build_object('tabla', 'gw_pedido_proveedor', 'filas', n);
end $$;

do $$
declare f text;
begin
  foreach f in array array['cliente_sucursal', 'gw_venta', 'gw_venta_linea', 'gw_factura', 'gw_cobro', 'gw_pago_gasto', 'gw_caja_movimiento',
                           'gw_caja_cierre', 'gw_pedido_cliente', 'gw_pedido_cliente_linea', 'gw_factura_proveedor', 'gw_pedido_proveedor'] loop
    execute format('revoke all on function public.%I() from public, anon, authenticated', 'fn_carga_gw_' || f);
  end loop;
end $$;

-- El espejo admite las tablas nuevas.
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
         (27, 'PETICION', array['gw_peticion']), (28, 'PETIDETA', array['gw_peticion_seguimiento']),
         (29, 'CLISUCUR', array['cliente_sucursal']), (30, 'VENTAS', array['gw_venta']), (31, 'VENTDETA', array['gw_venta_linea']),
         (32, 'FACTURAS', array['gw_factura']), (33, 'PAGOS', array['gw_cobro']), (34, 'PAGOSGST', array['gw_pago_gasto']),
         (35, 'CAJA', array['gw_caja_movimiento']), (36, 'CAJAAYC', array['gw_caja_cierre']), (37, 'PEDIDOS', array['gw_pedido_cliente']),
         (38, 'PEDIDETA', array['gw_pedido_cliente_linea']), (39, 'FACTPROV', array['gw_factura_proveedor'])
$$;
