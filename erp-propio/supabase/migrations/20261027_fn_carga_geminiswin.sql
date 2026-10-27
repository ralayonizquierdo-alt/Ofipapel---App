-- =============================================================================
-- Carga de datos de GeminisWin (public.carga_dbf) a las tablas del ERP.
--
-- Funciones REPETIBLES (idempotentes): todo es upsert por la clave natural, así
-- que se puede volver a ejecutar cada vez que se refresque carga_dbf y el día de
-- la migración definitiva:
--
--     select fn_carga_gw_todo();
--
-- No borra nada (ni datos de prueba que no coincidan en código), no genera
-- ventas, facturas ni registros VeriFactu. El stock se fija con movimientos de
-- tipo 'inventario' por la DIFERENCIA, de modo que repetir la carga deja el
-- stock igual al del DBF sin sumarlo dos veces.
--
-- Convención de carga_dbf: datos jsonb con los campos DBF en MAYÚSCULAS; un
-- campo vacío / 0 / false NO aparece (= vacío). Fechas 'AAAA-MM-DD'.
-- Documentación: erp-propio/docs/CARGA_GEMINISWIN.md
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ayudantes de lectura del jsonb
-- -----------------------------------------------------------------------------
create or replace function public.gw_t(j jsonb, k text) returns text
language sql immutable as $$ select nullif(btrim(j->>k), '') $$;

create or replace function public.gw_n(j jsonb, k text) returns numeric
language sql immutable as $$
  select case
    when jsonb_typeof(j->k) = 'number' then (j->>k)::numeric
    when btrim(j->>k) ~ '^-?[0-9]+(\.[0-9]+)?$' then btrim(j->>k)::numeric
  end
$$;

create or replace function public.gw_i(j jsonb, k text) returns integer
language sql immutable as $$ select round(public.gw_n(j, k))::integer $$;

create or replace function public.gw_b(j jsonb, k text) returns boolean
language sql immutable as $$
  select coalesce(case
    when jsonb_typeof(j->k) = 'boolean' then (j->k)::boolean
    when lower(btrim(j->>k)) in ('true', 't', 's', 'si', '1') then true
  end, false)
$$;

create or replace function public.gw_d(j jsonb, k text) returns date
language plpgsql immutable as $$
declare v date;
begin
  if public.gw_t(j, k) is null then return null; end if;
  v := left(btrim(j->>k), 10)::date;
  if v < date '1900-01-01' then return null; end if;
  return v;
exception when others then return null;
end $$;

create or replace function public.gw_ts(j jsonb, k text) returns timestamptz
language plpgsql stable as $$
declare v timestamptz;
begin
  if public.gw_t(j, k) is null then return null; end if;
  v := btrim(j->>k)::timestamp at time zone 'Atlantic/Canary';
  if v < timestamptz '1900-01-01' then return null; end if;
  return v;
exception when others then return null;
end $$;

-- Código de país de GeminisWin → código del ERP (ISO2, p. ej. 'ES').
-- En GeminisWin conviven dos códigos para España: el de PAISES (724, ISO
-- numérico) y el '11' que llevan casi todas las fichas (con PAIS = "España",
-- "España - I.Canarias"...). Ambos van a 'ES'. Si el resultado no existe en
-- la tabla pais, devuelve null (y la carga lo cuenta como referencia ausente).
create or replace function public.gw_pais(c text) returns text
language sql stable as $$
  select p.codigo from public.pais p
  where p.codigo = coalesce(
    (select public.gw_t(x.datos, 'ISO2') from public.carga_dbf x
      where x.tabla = 'PAISES' and x.datos->>'CODIGO' = btrim(c) limit 1),
    case when btrim(c) = '11' then 'ES' end)
$$;

-- Quita las claves con valor 0 de un objeto de recuentos.
create or replace function public.gw_sin_ceros(j jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from jsonb_each(coalesce(j, '{}'::jsonb)) where value <> '0'::jsonb
$$;

-- Bloque de informe común.
create or replace function public.gw_res(p_origen text, p_destino text, p_leidas bigint,
  p_ins bigint, p_upd bigint, p_rech jsonb, p_refs jsonb, p_extra jsonb default null) returns jsonb
language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'origen', p_origen, 'destino', p_destino, 'leidas', p_leidas,
    'insertadas', p_ins, 'actualizadas', p_upd,
    'rechazadas', nullif(public.gw_sin_ceros(p_rech), '{}'::jsonb),
    'referencias_a_null', nullif(public.gw_sin_ceros(p_refs), '{}'::jsonb),
    'notas', p_extra))
$$;

-- -----------------------------------------------------------------------------
-- PAISES → pais (clave = ISO2)
-- -----------------------------------------------------------------------------
create or replace function public.fn_carga_gw_pais() returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  with src as (
    select clave, datos d, coalesce(gw_t(datos,'ISO2'), gw_t(datos,'CODIGO')) codigo,
           case when coalesce(gw_t(datos,'ISO2'), gw_t(datos,'CODIGO')) is null then 'sin código' end motivo
    from carga_dbf where tabla = 'PAISES'),
  up as (
    insert into pais (codigo, nombre, iso2, prefijo_tel)
    select codigo, coalesce(gw_t(d,'PAIS'), codigo), gw_t(d,'ISO2'), gw_t(d,'PREFIJO')
    from src where motivo is null
    on conflict (codigo) do update set nombre = excluded.nombre, iso2 = excluded.iso2,
      prefijo_tel = excluded.prefijo_tel, actualizado_en = now()
    returning (xmax = 0) ins)
  select gw_res('PAISES', 'pais', (select count(*) from src),
    (select count(*) from up where ins), (select count(*) from up where not ins),
    (select jsonb_object_agg(motivo, n) from (select motivo, count(*) n from src where motivo is not null group by 1) x),
    null, to_jsonb('El código de país del ERP es el ISO2; los códigos 724 y 11 de GeminisWin se traducen a ES'::text))
  into r;
  return r;
end $$;

-- -----------------------------------------------------------------------------
-- PROVINCIAS → provincia
-- -----------------------------------------------------------------------------
create or replace function public.fn_carga_gw_provincia() returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  with src as (
    select clave, datos d, gw_t(datos,'CODIGO') codigo, gw_pais(gw_t(datos,'CODPAIS')) pais,
           case when gw_t(datos,'CODIGO') is null then 'sin código'
                when gw_pais(gw_t(datos,'CODPAIS')) is null then 'país desconocido' end motivo
    from carga_dbf where tabla = 'PROVINCIAS'),
  up as (
    insert into provincia (codigo, nombre, iso, region, pais_codigo)
    select codigo, coalesce(gw_t(d,'PROVINCIA'), codigo), gw_t(d,'ISO'), gw_t(d,'REGION'), pais
    from src where motivo is null
    on conflict (codigo) do update set nombre = excluded.nombre, iso = excluded.iso,
      region = excluded.region, pais_codigo = excluded.pais_codigo, actualizado_en = now()
    returning (xmax = 0) ins)
  select gw_res('PROVINCIAS', 'provincia', (select count(*) from src),
    (select count(*) from up where ins), (select count(*) from up where not ins),
    (select jsonb_object_agg(motivo, n) from (select motivo, count(*) n from src where motivo is not null group by 1) x), null)
  into r;
  return r;
end $$;

-- -----------------------------------------------------------------------------
-- FOMA → forma_pago (las referencias a sí misma, en una segunda pasada)
-- -----------------------------------------------------------------------------
create or replace function public.fn_carga_gw_forma_pago() returns jsonb
language plpgsql as $$
declare r jsonb; v_refs jsonb;
begin
  with src as (
    select clave, datos d, gw_t(datos,'FORMA_COD') codigo,
           case when gw_t(datos,'FORMA_COD') is null then 'código vacío (la forma CONTADO de GeminisWin no tiene código)' end motivo
    from carga_dbf where tabla = 'FOMA'),
  up as (
    insert into forma_pago (codigo, descripcion, descripcion_corta, tipo, tipo_contado, cuenta_contable,
      domiciliacion_bancaria, comision_bancaria_pct, cuenta_contable_comision, desglosa_comision_bancaria,
      no_ver_en_ventas, no_ver_en_compras, generar_pagos_automaticos, generador_num_pagos,
      cadencia_nivel0, cadencia_nivel1, cadencia_nivel2, cadencia_nivel3, cadencia_nivel4, cadencia_nivel5, cadencia_nivel6,
      ajuste_vencimiento_tipo0, dia_mes_ajuste0, ajuste_vencimiento_tipo1, dia_mes_ajuste1)
    select codigo, coalesce(gw_t(d,'FORMA_DEN'), codigo), gw_t(d,'DESCRCORTA'), coalesce(gw_i(d,'FORMA_TIPO'), 0),
      gw_i(d,'TIPO_CONT'), gw_t(d,'CTACONTAB'), gw_b(d,'DOMIC_BANC'), gw_n(d,'COMIS_BANC'), gw_t(d,'CTACONTCOM'),
      gw_b(d,'DESGCOMBAN'), gw_b(d,'NOVERENVTA'), gw_b(d,'NOVERENCMP'), gw_b(d,'GENERARPAG'), gw_i(d,'NUM_PAGOS'),
      gw_i(d,'CADENCIA0'), gw_i(d,'CADENCIA1'), gw_i(d,'CADENCIA2'), gw_i(d,'CADENCIA3'), gw_i(d,'CADENCIA4'),
      gw_i(d,'CADENCIA5'), gw_i(d,'CADENCIA6'),
      gw_i(d,'TIPAJVENC0'), gw_i(d,'DIAMES0'), gw_i(d,'TIPAJVENC1'), gw_i(d,'DIAMES1')
    from src where motivo is null
    on conflict (codigo) do update set descripcion = excluded.descripcion, descripcion_corta = excluded.descripcion_corta,
      tipo = excluded.tipo, tipo_contado = excluded.tipo_contado, cuenta_contable = excluded.cuenta_contable,
      domiciliacion_bancaria = excluded.domiciliacion_bancaria, comision_bancaria_pct = excluded.comision_bancaria_pct,
      cuenta_contable_comision = excluded.cuenta_contable_comision, desglosa_comision_bancaria = excluded.desglosa_comision_bancaria,
      no_ver_en_ventas = excluded.no_ver_en_ventas, no_ver_en_compras = excluded.no_ver_en_compras,
      generar_pagos_automaticos = excluded.generar_pagos_automaticos, generador_num_pagos = excluded.generador_num_pagos,
      cadencia_nivel0 = excluded.cadencia_nivel0, cadencia_nivel1 = excluded.cadencia_nivel1, cadencia_nivel2 = excluded.cadencia_nivel2,
      cadencia_nivel3 = excluded.cadencia_nivel3, cadencia_nivel4 = excluded.cadencia_nivel4, cadencia_nivel5 = excluded.cadencia_nivel5,
      cadencia_nivel6 = excluded.cadencia_nivel6, ajuste_vencimiento_tipo0 = excluded.ajuste_vencimiento_tipo0,
      dia_mes_ajuste0 = excluded.dia_mes_ajuste0, ajuste_vencimiento_tipo1 = excluded.ajuste_vencimiento_tipo1,
      dia_mes_ajuste1 = excluded.dia_mes_ajuste1, actualizado_en = now()
    returning (xmax = 0) ins)
  select gw_res('FOMA', 'forma_pago', (select count(*) from src),
    (select count(*) from up where ins), (select count(*) from up where not ins),
    (select jsonb_object_agg(motivo, n) from (select motivo, count(*) n from src where motivo is not null group by 1) x), null)
  into r;

  -- Segunda pasada: forma de pago de la comisión y de los vencimientos (FK a la propia tabla).
  with s as (
    select gw_t(datos,'FORMA_COD') codigo, gw_t(datos,'F_PAGOCOMB') com, gw_t(datos,'F_PAGOVENC') ven
    from carga_dbf where tabla = 'FOMA' and gw_t(datos,'FORMA_COD') is not null),
  u as (
    update forma_pago f set
      forma_pago_comision_codigo = (select codigo from forma_pago x where x.codigo = s.com),
      forma_pago_vencimientos_codigo = (select codigo from forma_pago x where x.codigo = s.ven)
    from s where f.codigo = s.codigo
    returning s.com, f.forma_pago_comision_codigo c2, s.ven, f.forma_pago_vencimientos_codigo v2)
  select jsonb_build_object('forma_pago_comision', count(*) filter (where com is not null and c2 is null),
                            'forma_pago_vencimientos', count(*) filter (where ven is not null and v2 is null))
  into v_refs from u;
  return r || jsonb_build_object('referencias_a_null', gw_sin_ceros(v_refs));
end $$;

-- -----------------------------------------------------------------------------
-- ALMACEN → almacen
-- -----------------------------------------------------------------------------
create or replace function public.fn_carga_gw_almacen() returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  with src as (
    select clave, datos d, gw_t(datos,'CODALMAC') codigo,
      gw_t(datos,'CODPROV') prov_raw, (select codigo from provincia p where p.codigo = gw_t(datos,'CODPROV')) prov,
      gw_t(datos,'CODPAIS') pais_raw, gw_pais(gw_t(datos,'CODPAIS')) pais,
      case when gw_t(datos,'CODALMAC') is null then 'sin código' end motivo
    from carga_dbf where tabla = 'ALMACEN'),
  up as (
    insert into almacen (codigo, nombre, direccion, codigo_postal, provincia_codigo, pais_codigo, poblacion,
      persona_cargo, tope_periodo, fecha_alta)
    select codigo, coalesce(gw_t(d,'NOMBRE'), codigo), gw_t(d,'DIRECCION'), gw_t(d,'CODPOSTAL'), prov, pais,
      gw_t(d,'POBLACION'), gw_t(d,'PERS_CARGO'), gw_i(d,'TOPEPERIOD'), gw_d(d,'F_ALTA')
    from src where motivo is null
    on conflict (codigo) do update set nombre = excluded.nombre, direccion = excluded.direccion,
      codigo_postal = excluded.codigo_postal, provincia_codigo = excluded.provincia_codigo,
      pais_codigo = excluded.pais_codigo, poblacion = excluded.poblacion, persona_cargo = excluded.persona_cargo,
      tope_periodo = excluded.tope_periodo, fecha_alta = excluded.fecha_alta, actualizado_en = now()
    returning (xmax = 0) ins)
  select gw_res('ALMACEN', 'almacen', (select count(*) from src),
    (select count(*) from up where ins), (select count(*) from up where not ins),
    (select jsonb_object_agg(motivo, n) from (select motivo, count(*) n from src where motivo is not null group by 1) x),
    (select jsonb_build_object('provincia', count(*) filter (where prov_raw is not null and prov is null),
                               'pais', count(*) filter (where pais_raw is not null and pais is null)) from src where motivo is null))
  into r;
  return r;
end $$;

-- -----------------------------------------------------------------------------
-- OFICINA → tienda_terminal
-- El tipo NO viene en el DBF: se deduce de la descripción (ver documentación).
-- -----------------------------------------------------------------------------
create or replace function public.fn_carga_gw_tienda_terminal() returns jsonb
language plpgsql as $$
declare r jsonb; v_refs jsonb; v_empresa text;
begin
  select min(codigo) into v_empresa from empresa having count(*) = 1;

  with src as (
    select clave, datos d, gw_t(datos,'OFICINA') codigo,
      case when gw_b(datos,'ESCAJCENTR') then 'caja_central'
           when gw_t(datos,'DESCRIP') ilike '%tienda web%' then 'tienda_web'
           when gw_t(datos,'DESCRIP') ilike 'tableta%' then 'tableta'
           when gw_t(datos,'DESCRIP') ilike 'tienda%' then 'tienda'
           else 'oficina_interna' end tipo,
      gw_t(datos,'ALMACEN') alm_raw, (select codigo from almacen a where a.codigo = gw_t(datos,'ALMACEN')) alm,
      gw_t(datos,'CODPROV') prov_raw, (select codigo from provincia p where p.codigo = gw_t(datos,'CODPROV')) prov,
      gw_t(datos,'CODPAIS') pais_raw, gw_pais(gw_t(datos,'CODPAIS')) pais,
      case when gw_t(datos,'OFICINA') is null then 'sin código' end motivo
    from carga_dbf where tabla = 'OFICINA'),
  up as (
    insert into tienda_terminal (codigo, descripcion, tipo, almacen_codigo, empresa_codigo, es_caja_central,
      direccion, codigo_postal, provincia_codigo, pais_codigo, poblacion, telefono_fijo, fax, email,
      fondo_caja_inicial, igic_incluido_nivel0, igic_incluido_nivel1, igic_incluido_nivel2, igic_incluido_nivel3,
      igic_incluido_nivel4, igic_incluido_nivel5, igic_incluido_nivel6, fecha_alta)
    select codigo, coalesce(gw_t(d,'DESCRIP'), codigo), tipo, alm, v_empresa, gw_b(d,'ESCAJCENTR'),
      gw_t(d,'DIRECCION'), gw_t(d,'CODPOSTAL'), prov, pais, gw_t(d,'POBLACION'), gw_t(d,'TLF_FIJO'), gw_t(d,'TLF_FAX'),
      gw_t(d,'DIREMAIL'), gw_n(d,'FONDOCAJA'), gw_b(d,'IGICINC0'), gw_b(d,'IGICINC1'), gw_b(d,'IGICINC2'),
      gw_b(d,'IGICINC3'), gw_b(d,'IGICINC4'), gw_b(d,'IGICINC5'), gw_b(d,'IGICINC6'), gw_d(d,'F_ALTA')
    from src where motivo is null
    on conflict (codigo) do update set descripcion = excluded.descripcion, tipo = excluded.tipo,
      almacen_codigo = excluded.almacen_codigo,
      empresa_codigo = coalesce(tienda_terminal.empresa_codigo, excluded.empresa_codigo),
      es_caja_central = excluded.es_caja_central, direccion = excluded.direccion, codigo_postal = excluded.codigo_postal,
      provincia_codigo = excluded.provincia_codigo, pais_codigo = excluded.pais_codigo, poblacion = excluded.poblacion,
      telefono_fijo = excluded.telefono_fijo, fax = excluded.fax, email = excluded.email,
      fondo_caja_inicial = excluded.fondo_caja_inicial, igic_incluido_nivel0 = excluded.igic_incluido_nivel0,
      igic_incluido_nivel1 = excluded.igic_incluido_nivel1, igic_incluido_nivel2 = excluded.igic_incluido_nivel2,
      igic_incluido_nivel3 = excluded.igic_incluido_nivel3, igic_incluido_nivel4 = excluded.igic_incluido_nivel4,
      igic_incluido_nivel5 = excluded.igic_incluido_nivel5, igic_incluido_nivel6 = excluded.igic_incluido_nivel6,
      fecha_alta = excluded.fecha_alta, actualizado_en = now()
    returning (xmax = 0) ins)
  select gw_res('OFICINA', 'tienda_terminal', (select count(*) from src),
    (select count(*) from up where ins), (select count(*) from up where not ins),
    (select jsonb_object_agg(motivo, n) from (select motivo, count(*) n from src where motivo is not null group by 1) x),
    (select jsonb_build_object('almacen', count(*) filter (where alm_raw is not null and alm is null),
                               'provincia', count(*) filter (where prov_raw is not null and prov is null),
                               'pais', count(*) filter (where pais_raw is not null and pais is null)) from src where motivo is null))
  into r;

  -- Segunda pasada: oficina central (FK a la propia tabla).
  with s as (select gw_t(datos,'OFICINA') codigo, gw_t(datos,'OFICENTRAL') ofc
             from carga_dbf where tabla = 'OFICINA' and gw_t(datos,'OFICINA') is not null),
  u as (update tienda_terminal t set oficina_central_codigo =
          (select codigo from tienda_terminal x where x.codigo = s.ofc and x.codigo <> t.codigo)
        from s where t.codigo = s.codigo returning s.ofc, t.oficina_central_codigo o2, t.codigo)
  select jsonb_build_object('oficina_central', count(*) filter (where ofc is not null and ofc <> codigo and o2 is null))
  into v_refs from u;
  return jsonb_set(r, '{referencias_a_null}', coalesce(r->'referencias_a_null', '{}'::jsonb) || gw_sin_ceros(v_refs));
end $$;

-- -----------------------------------------------------------------------------
-- ZONATERR → zona_territorial
-- -----------------------------------------------------------------------------
create or replace function public.fn_carga_gw_zona_territorial() returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  with src as (
    select clave, datos d, gw_t(datos,'ZONATERRIT') codigo,
      case when gw_t(datos,'ZONATERRIT') is null then 'sin código' end motivo
    from carga_dbf where tabla = 'ZONATERR'),
  up as (
    insert into zona_territorial (codigo, descripcion)
    select codigo, coalesce(gw_t(d,'DESCRIP'), codigo) from src where motivo is null
    on conflict (codigo) do update set descripcion = excluded.descripcion, actualizado_en = now()
    returning (xmax = 0) ins)
  select gw_res('ZONATERR', 'zona_territorial', (select count(*) from src),
    (select count(*) from up where ins), (select count(*) from up where not ins),
    (select jsonb_object_agg(motivo, n) from (select motivo, count(*) n from src where motivo is not null group by 1) x), null)
  into r;
  return r;
end $$;

-- -----------------------------------------------------------------------------
-- RUTAS → ruta_reparto (el trigger sincroniza la tabla ruta)
-- -----------------------------------------------------------------------------
create or replace function public.fn_carga_gw_ruta_reparto() returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  with src as (
    select clave, datos d, gw_t(datos,'IDRUTA') codigo,
      case when gw_t(datos,'IDRUTA') is null then 'sin código' end motivo
    from carga_dbf where tabla = 'RUTAS'),
  up as (
    insert into ruta_reparto (codigo, descripcion, deshabilitada)
    select codigo, coalesce(gw_t(d,'DESCRIP'), codigo), gw_b(d,'DESHABILIT') from src where motivo is null
    on conflict (codigo) do update set descripcion = excluded.descripcion, deshabilitada = excluded.deshabilitada,
      actualizado_en = now()
    returning (xmax = 0) ins)
  select gw_res('RUTAS', 'ruta_reparto (+ ruta por trigger)', (select count(*) from src),
    (select count(*) from up where ins), (select count(*) from up where not ins),
    (select jsonb_object_agg(motivo, n) from (select motivo, count(*) n from src where motivo is not null group by 1) x), null)
  into r;
  return r;
end $$;

-- -----------------------------------------------------------------------------
-- RUTAZONA → ruta_reparto_zona
-- -----------------------------------------------------------------------------
create or replace function public.fn_carga_gw_ruta_reparto_zona() returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  with src as (
    select clave, datos d, gw_t(datos,'IDRUTA') ruta, gw_t(datos,'IDZONA') zona,
      case when not exists (select 1 from ruta_reparto x where x.codigo = gw_t(datos,'IDRUTA')) then 'ruta inexistente'
           when not exists (select 1 from zona_territorial x where x.codigo = gw_t(datos,'IDZONA')) then 'zona inexistente' end motivo
    from carga_dbf where tabla = 'RUTAZONA'),
  up as (
    insert into ruta_reparto_zona (ruta_codigo, zona_territorial_codigo, orden, ruta_habilitada)
    select ruta, zona, gw_i(d,'N_ORDEN'), gw_b(d,'RUTAHABILI') from src where motivo is null
    on conflict (ruta_codigo, zona_territorial_codigo) do update set orden = excluded.orden,
      ruta_habilitada = excluded.ruta_habilitada, actualizado_en = now()
    returning (xmax = 0) ins)
  select gw_res('RUTAZONA', 'ruta_reparto_zona', (select count(*) from src),
    (select count(*) from up where ins), (select count(*) from up where not ins),
    (select jsonb_object_agg(motivo, n) from (select motivo, count(*) n from src where motivo is not null group by 1) x), null)
  into r;
  return r;
end $$;

-- -----------------------------------------------------------------------------
-- REPARTIDOR → repartidor
-- -----------------------------------------------------------------------------
create or replace function public.fn_carga_gw_repartidor() returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  with src as (
    select clave, datos d, gw_t(datos,'IDREPARTID') codigo,
      gw_t(datos,'CODPROV') prov_raw, (select codigo from provincia p where p.codigo = gw_t(datos,'CODPROV')) prov,
      gw_t(datos,'CODPAIS') pais_raw, gw_pais(gw_t(datos,'CODPAIS')) pais,
      case when gw_t(datos,'IDREPARTID') is null then 'sin código' end motivo
    from carga_dbf where tabla = 'REPARTIDOR'),
  up as (
    insert into repartidor (codigo, nombre, nombre_corto, direccion, codigo_postal, provincia_codigo, pais_codigo,
      poblacion, telefono_fijo, telefono_movil, email, deshabilitado)
    select codigo, coalesce(gw_t(d,'NOMBRE'), codigo), gw_t(d,'NOMBCORTO'), gw_t(d,'DIRECCION'), gw_t(d,'CODPOSTAL'),
      prov, pais, gw_t(d,'POBLACION'), gw_t(d,'TLF_FIJO'), gw_t(d,'TLF_MOVIL'), gw_t(d,'DIREMAIL'), gw_b(d,'DESHABILIT')
    from src where motivo is null
    on conflict (codigo) do update set nombre = excluded.nombre, nombre_corto = excluded.nombre_corto,
      direccion = excluded.direccion, codigo_postal = excluded.codigo_postal, provincia_codigo = excluded.provincia_codigo,
      pais_codigo = excluded.pais_codigo, poblacion = excluded.poblacion, telefono_fijo = excluded.telefono_fijo,
      telefono_movil = excluded.telefono_movil, email = excluded.email, deshabilitado = excluded.deshabilitado,
      actualizado_en = now()
    returning (xmax = 0) ins)
  select gw_res('REPARTIDOR', 'repartidor', (select count(*) from src),
    (select count(*) from up where ins), (select count(*) from up where not ins),
    (select jsonb_object_agg(motivo, n) from (select motivo, count(*) n from src where motivo is not null group by 1) x),
    (select jsonb_build_object('provincia', count(*) filter (where prov_raw is not null and prov is null),
                               'pais', count(*) filter (where pais_raw is not null and pais is null)) from src where motivo is null))
  into r;
  return r;
end $$;

-- -----------------------------------------------------------------------------
-- RUTAREPA → ruta_reparto_repartidor
-- -----------------------------------------------------------------------------
create or replace function public.fn_carga_gw_ruta_reparto_repartidor() returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  with src as (
    select clave, datos d, gw_t(datos,'IDRUTA') ruta, gw_t(datos,'IDREPARTID') rep,
      case when not exists (select 1 from ruta_reparto x where x.codigo = gw_t(datos,'IDRUTA')) then 'ruta inexistente'
           when not exists (select 1 from repartidor x where x.codigo = gw_t(datos,'IDREPARTID')) then 'repartidor inexistente' end motivo
    from carga_dbf where tabla = 'RUTAREPA'),
  up as (
    insert into ruta_reparto_repartidor (ruta_codigo, repartidor_codigo, ruta_habilitada, repartidor_habilitado)
    select ruta, rep, gw_b(d,'RUTAHABILI'), gw_b(d,'REPAHABILI') from src where motivo is null
    on conflict (ruta_codigo, repartidor_codigo) do update set ruta_habilitada = excluded.ruta_habilitada,
      repartidor_habilitado = excluded.repartidor_habilitado, actualizado_en = now()
    returning (xmax = 0) ins)
  select gw_res('RUTAREPA', 'ruta_reparto_repartidor', (select count(*) from src),
    (select count(*) from up where ins), (select count(*) from up where not ins),
    (select jsonb_object_agg(motivo, n) from (select motivo, count(*) n from src where motivo is not null group by 1) x), null)
  into r;
  return r;
end $$;

-- -----------------------------------------------------------------------------
-- VENDEDOR → vendedor (+ vendedor_comision_nivel con COMISION0..6)
-- -----------------------------------------------------------------------------
create or replace function public.fn_carga_gw_vendedor() returns jsonb
language plpgsql as $$
declare r jsonb; v_niv bigint;
begin
  with src as (
    select clave, datos d, gw_t(datos,'IDVENDEDOR') codigo,
      gw_t(datos,'OFICINA') ofi_raw, (select codigo from tienda_terminal t where t.codigo = gw_t(datos,'OFICINA')) ofi,
      gw_t(datos,'CODPROV') prov_raw, (select codigo from provincia p where p.codigo = gw_t(datos,'CODPROV')) prov,
      gw_t(datos,'CODPAIS') pais_raw, gw_pais(gw_t(datos,'CODPAIS')) pais,
      case when gw_t(datos,'IDVENDEDOR') is null then 'sin código' end motivo
    from carga_dbf where tabla = 'VENDEDOR'),
  up as (
    insert into vendedor (codigo, nombre, nombre_corto, direccion, codigo_postal, provincia_codigo, pais_codigo,
      poblacion, telefono_fijo, telefono_movil, email, tienda_terminal_codigo, comision_general_pct,
      comision_oferta_pct, computa_beneficio, estado_civil, fecha_alta, fecha_baja, activo)
    select codigo, coalesce(gw_t(d,'NOMBRE'), codigo), gw_t(d,'NOMBCORTO'), gw_t(d,'DIRECCION'), gw_t(d,'CODPOSTAL'),
      prov, pais, gw_t(d,'POBLACION'), gw_t(d,'TLF_FIJO'), gw_t(d,'TLF_MOVIL'), gw_t(d,'DIREMAIL'), ofi,
      gw_n(d,'COMISION'), gw_n(d,'COMISOFERT'), gw_b(d,'COMPORBEN'), gw_t(d,'ESTADOCIVI'),
      gw_d(d,'F_ALTA'), gw_d(d,'F_BAJA'), (gw_d(d,'F_BAJA') is null or gw_d(d,'F_BAJA') > current_date)
    from src where motivo is null
    on conflict (codigo) do update set nombre = excluded.nombre, nombre_corto = excluded.nombre_corto,
      direccion = excluded.direccion, codigo_postal = excluded.codigo_postal, provincia_codigo = excluded.provincia_codigo,
      pais_codigo = excluded.pais_codigo, poblacion = excluded.poblacion, telefono_fijo = excluded.telefono_fijo,
      telefono_movil = excluded.telefono_movil, email = excluded.email,
      tienda_terminal_codigo = excluded.tienda_terminal_codigo, comision_general_pct = excluded.comision_general_pct,
      comision_oferta_pct = excluded.comision_oferta_pct, computa_beneficio = excluded.computa_beneficio,
      estado_civil = excluded.estado_civil, fecha_alta = excluded.fecha_alta, fecha_baja = excluded.fecha_baja,
      activo = excluded.activo, actualizado_en = now()
    returning (xmax = 0) ins)
  select gw_res('VENDEDOR', 'vendedor', (select count(*) from src),
    (select count(*) from up where ins), (select count(*) from up where not ins),
    (select jsonb_object_agg(motivo, n) from (select motivo, count(*) n from src where motivo is not null group by 1) x),
    (select jsonb_build_object('tienda_terminal (OFICINA)', count(*) filter (where ofi_raw is not null and ofi is null),
                               'provincia', count(*) filter (where prov_raw is not null and prov is null),
                               'pais', count(*) filter (where pais_raw is not null and pais is null)) from src where motivo is null))
  into r;

  with s as (
    select gw_t(c.datos,'IDVENDEDOR') codigo, n::smallint nivel, gw_n(c.datos, 'COMISION' || n) pct
    from carga_dbf c cross join generate_series(0, 6) n
    where c.tabla = 'VENDEDOR' and gw_n(c.datos, 'COMISION' || n) is not null
      and exists (select 1 from vendedor v where v.codigo = gw_t(c.datos,'IDVENDEDOR'))),
  u as (insert into vendedor_comision_nivel (vendedor_codigo, nivel_tarifa, comision_pct)
        select codigo, nivel, pct from s
        on conflict (vendedor_codigo, nivel_tarifa) do update set comision_pct = excluded.comision_pct
        returning 1)
  select count(*) into v_niv from u;
  return r || jsonb_build_object('comisiones_por_nivel', v_niv);
end $$;

-- -----------------------------------------------------------------------------
-- TRANSPOR → transportista
-- -----------------------------------------------------------------------------
create or replace function public.fn_carga_gw_transportista() returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  with src as (
    select clave, datos d, gw_t(datos,'CODIGO') codigo,
      gw_t(datos,'FORMA_COD') fp_raw, (select codigo from forma_pago f where f.codigo = gw_t(datos,'FORMA_COD')) fp,
      gw_t(datos,'CODPROV') prov_raw, (select codigo from provincia p where p.codigo = gw_t(datos,'CODPROV')) prov,
      gw_t(datos,'CODPAIS') pais_raw, gw_pais(gw_t(datos,'CODPAIS')) pais,
      case when gw_t(datos,'CODIGO') is null then 'sin código' end motivo
    from carga_dbf where tabla = 'TRANSPOR'),
  up as (
    insert into transportista (codigo, nombre, razon_social, nif, direccion, codigo_postal, provincia_codigo,
      pais_codigo, poblacion, telefono_fijo, telefono_movil, fax, contacto, email, web, forma_pago_codigo,
      dias_pago_1_tipo, dias_pago_2_tipo, dias_demora_pago, deuda_actual, cuenta_contable_400, cuenta_contable_411,
      cuenta_contable_572, cuenta_contable_624, fecha_alta, fecha_baja, activo)
    select codigo, coalesce(gw_t(d,'NOMBRE'), codigo), gw_t(d,'RAZONSOC'), gw_t(d,'NIF'), gw_t(d,'DIRECCION'),
      gw_t(d,'CODPOSTAL'), prov, pais, gw_t(d,'POBLACION'), gw_t(d,'TLF_FIJO'), gw_t(d,'TLF_MOVIL'), gw_t(d,'TLF_FAX'),
      gw_t(d,'CONTACTO'), gw_t(d,'DIREMAIL'), gw_t(d,'DIRWEB'), fp, gw_i(d,'TIPDIASPA1'), gw_i(d,'TIPDIASPA2'),
      gw_i(d,'DIASDEMPAG'), gw_n(d,'DEUDA'), gw_t(d,'TRANSPO410'), gw_t(d,'TRANSPO411'), gw_t(d,'TRANSPO572'),
      gw_t(d,'TRANSPO624'), gw_d(d,'F_ALTA'), gw_d(d,'F_BAJA'),
      (gw_d(d,'F_BAJA') is null or gw_d(d,'F_BAJA') > current_date)
    from src where motivo is null
    on conflict (codigo) do update set nombre = excluded.nombre, razon_social = excluded.razon_social,
      nif = excluded.nif, direccion = excluded.direccion, codigo_postal = excluded.codigo_postal,
      provincia_codigo = excluded.provincia_codigo, pais_codigo = excluded.pais_codigo, poblacion = excluded.poblacion,
      telefono_fijo = excluded.telefono_fijo, telefono_movil = excluded.telefono_movil, fax = excluded.fax,
      contacto = excluded.contacto, email = excluded.email, web = excluded.web,
      forma_pago_codigo = excluded.forma_pago_codigo, dias_pago_1_tipo = excluded.dias_pago_1_tipo,
      dias_pago_2_tipo = excluded.dias_pago_2_tipo, dias_demora_pago = excluded.dias_demora_pago,
      deuda_actual = excluded.deuda_actual, cuenta_contable_400 = excluded.cuenta_contable_400,
      cuenta_contable_411 = excluded.cuenta_contable_411, cuenta_contable_572 = excluded.cuenta_contable_572,
      cuenta_contable_624 = excluded.cuenta_contable_624, fecha_alta = excluded.fecha_alta,
      fecha_baja = excluded.fecha_baja, activo = excluded.activo, actualizado_en = now()
    returning (xmax = 0) ins)
  select gw_res('TRANSPOR', 'transportista', (select count(*) from src),
    (select count(*) from up where ins), (select count(*) from up where not ins),
    (select jsonb_object_agg(motivo, n) from (select motivo, count(*) n from src where motivo is not null group by 1) x),
    (select jsonb_build_object('forma_pago', count(*) filter (where fp_raw is not null and fp is null),
                               'provincia', count(*) filter (where prov_raw is not null and prov is null),
                               'pais', count(*) filter (where pais_raw is not null and pais is null)) from src where motivo is null))
  into r;
  return r;
end $$;

-- -----------------------------------------------------------------------------
-- PLANTTAR → plantilla_tarifa (+ plantilla_tarifa_nivel 0..6)
-- -----------------------------------------------------------------------------
create or replace function public.fn_carga_gw_plantilla_tarifa() returns jsonb
language plpgsql as $$
declare r jsonb; v_niv bigint;
begin
  with src as (
    select clave, datos d, gw_t(datos,'CODTAR') codigo,
      case when gw_t(datos,'CODTAR') is null then 'sin código' end motivo
    from carga_dbf where tabla = 'PLANTTAR'),
  up as (
    insert into plantilla_tarifa (codigo, descripcion, descuento_maximo_cliente_pct)
    select codigo, coalesce(gw_t(d,'DESCRIPTAR'), codigo), gw_n(d,'DTOMAXCLI') from src where motivo is null
    on conflict (codigo) do update set descripcion = excluded.descripcion,
      descuento_maximo_cliente_pct = excluded.descuento_maximo_cliente_pct, actualizado_en = now()
    returning (xmax = 0) ins)
  select gw_res('PLANTTAR', 'plantilla_tarifa', (select count(*) from src),
    (select count(*) from up where ins), (select count(*) from up where not ins),
    (select jsonb_object_agg(motivo, n) from (select motivo, count(*) n from src where motivo is not null group by 1) x), null)
  into r;

  with s as (
    select gw_t(c.datos,'CODTAR') codigo, n::smallint nivel,
      coalesce(gw_n(c.datos, 'INC_PVP' || n), 0) inc,
      case when gw_t(c.datos, 'POD' || n) in ('P','D','N') then gw_t(c.datos, 'POD' || n) end modo,
      gw_t(c.datos, 'VERDTO_' || n) = 'S' verdto
    from carga_dbf c cross join generate_series(0, 6) n
    where c.tabla = 'PLANTTAR' and gw_t(c.datos,'CODTAR') is not null),
  u as (insert into plantilla_tarifa_nivel (plantilla_tarifa_codigo, nivel_tarifa, incremento_pct, modo_calculo, permite_descuento_linea)
        select codigo, nivel, inc, modo, coalesce(verdto, false) from s
        on conflict (plantilla_tarifa_codigo, nivel_tarifa) do update set incremento_pct = excluded.incremento_pct,
          modo_calculo = excluded.modo_calculo, permite_descuento_linea = excluded.permite_descuento_linea
        returning 1)
  select count(*) into v_niv from u;
  return r || jsonb_build_object('niveles_cargados', v_niv);
end $$;

-- -----------------------------------------------------------------------------
-- FAMILIAS → familia
-- -----------------------------------------------------------------------------
create or replace function public.fn_carga_gw_familia() returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  with src as (
    select clave, datos d, gw_t(datos,'COD_FAM') codigo,
      gw_t(datos,'CODTAR') tar_raw, (select codigo from plantilla_tarifa p where p.codigo = gw_t(datos,'CODTAR')) tar,
      case when gw_t(datos,'COD_FAM') is null then 'sin código' end motivo
    from carga_dbf where tabla = 'FAMILIAS'),
  up as (
    insert into familia (codigo, descripcion, plantilla_tarifa_codigo, descuento_pct, no_ver_en_venta,
      web_publicada, web_codigo, web_descripcion, web_fecha_baja, web_id_link)
    select codigo, coalesce(gw_t(d,'DESCRIP'), codigo), tar, gw_n(d,'DESCUENTO'), gw_b(d,'NOVERENVTA'),
      gw_b(d,'WEBPUBLIC'), gw_t(d,'WEBCODFAM'), gw_t(d,'WEBDESCRIP'), gw_d(d,'WEB_F_BAJA'), gw_i(d,'WEBIDLINK')
    from src where motivo is null
    on conflict (codigo) do update set descripcion = excluded.descripcion,
      plantilla_tarifa_codigo = excluded.plantilla_tarifa_codigo, descuento_pct = excluded.descuento_pct,
      no_ver_en_venta = excluded.no_ver_en_venta, web_publicada = excluded.web_publicada,
      web_codigo = excluded.web_codigo, web_descripcion = excluded.web_descripcion,
      web_fecha_baja = excluded.web_fecha_baja, web_id_link = excluded.web_id_link, actualizado_en = now()
    returning (xmax = 0) ins)
  select gw_res('FAMILIAS', 'familia', (select count(*) from src),
    (select count(*) from up where ins), (select count(*) from up where not ins),
    (select jsonb_object_agg(motivo, n) from (select motivo, count(*) n from src where motivo is not null group by 1) x),
    (select jsonb_build_object('plantilla_tarifa', count(*) filter (where tar_raw is not null and tar is null)) from src where motivo is null))
  into r;
  return r;
end $$;

-- -----------------------------------------------------------------------------
-- MARCAS → marca. Además crea (solo con su nombre, que es la clave) las marcas
-- que usan los artículos y no están en MARCAS.
-- -----------------------------------------------------------------------------
create or replace function public.fn_carga_gw_marca() returns jsonb
language plpgsql as $$
declare r jsonb; v_extra bigint;
begin
  with src as (
    select clave, datos d, gw_t(datos,'MARCA') codigo,
      case when gw_t(datos,'MARCA') is null then 'sin código' end motivo
    from carga_dbf where tabla = 'MARCAS'),
  up as (
    insert into marca (codigo, web_publicada)
    select distinct on (codigo) codigo, gw_b(d,'WEBPUBLIC') from src where motivo is null order by codigo
    on conflict (codigo) do update set web_publicada = excluded.web_publicada, actualizado_en = now()
    returning (xmax = 0) ins)
  select gw_res('MARCAS', 'marca', (select count(*) from src),
    (select count(*) from up where ins), (select count(*) from up where not ins),
    (select jsonb_object_agg(motivo, n) from (select motivo, count(*) n from src where motivo is not null group by 1) x), null)
  into r;

  with u as (
    insert into marca (codigo)
    select distinct gw_t(datos,'MARCA') from carga_dbf a
    where a.tabla = 'ARTICULO' and gw_t(datos,'MARCA') is not null
      and not exists (select 1 from carga_dbf m where m.tabla = 'MARCAS' and gw_t(m.datos,'MARCA') = gw_t(a.datos,'MARCA'))
    on conflict (codigo) do nothing
    returning 1)
  select count(*) into v_extra from u;
  return r || jsonb_build_object('marcas_creadas_desde_articulos',
    (select count(distinct gw_t(datos,'MARCA')) from carga_dbf a
      where a.tabla = 'ARTICULO' and gw_t(datos,'MARCA') is not null
        and not exists (select 1 from carga_dbf m where m.tabla = 'MARCAS' and gw_t(m.datos,'MARCA') = gw_t(a.datos,'MARCA'))),
    'marcas_creadas_desde_articulos_en_esta_ejecucion', v_extra);
end $$;

-- -----------------------------------------------------------------------------
-- PROVEEDO → proveedor
-- -----------------------------------------------------------------------------
create or replace function public.fn_carga_gw_proveedor() returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  with src as (
    select clave, datos d, gw_t(datos,'CODIGO') codigo,
      gw_t(datos,'FORMA_COD') fp_raw, (select codigo from forma_pago f where f.codigo = gw_t(datos,'FORMA_COD')) fp,
      gw_t(datos,'CODALMAC') alm_raw, (select codigo from almacen a where a.codigo = gw_t(datos,'CODALMAC')) alm,
      gw_t(datos,'CODTAR') tar_raw, (select codigo from plantilla_tarifa p where p.codigo = gw_t(datos,'CODTAR')) tar,
      gw_t(datos,'CODPROV') prov_raw, (select codigo from provincia p where p.codigo = gw_t(datos,'CODPROV')) prov,
      gw_t(datos,'CODPAIS') pais_raw, gw_pais(gw_t(datos,'CODPAIS')) pais,
      case when gw_t(datos,'CODIGO') is null then 'sin código' end motivo
    from carga_dbf where tabla = 'PROVEEDO'),
  up as (
    insert into proveedor (codigo, nombre, razon_social, nif, direccion, codigo_postal, provincia_codigo, pais_codigo,
      poblacion, telefono_fijo, telefono_movil, fax, contacto, email, web, forma_pago_codigo, tipo_documento_defecto,
      dias_pago_1_tipo, dias_pago_2_tipo, num_pagos_demora, dias_entrega, deuda_actual, pendiente_pago,
      es_proveedor_dependiente, no_aplica_impuesto2, almacen_defecto_codigo, es_precio_local, descuento_pie_pct,
      plantilla_tarifa_codigo, cuenta_contable_400, cuenta_contable_600, fecha_alta, fecha_baja,
      fecha_ultima_compra, fecha_ultimo_pedido, id_sinli, activo)
    select codigo, coalesce(gw_t(d,'NOMBRE'), codigo), gw_t(d,'RAZONSOC'), gw_t(d,'NIF'), gw_t(d,'DIRECCION'),
      gw_t(d,'CODPOSTAL'), prov, pais, gw_t(d,'POBLACION'), gw_t(d,'TLF_FIJO'), gw_t(d,'TLF_MOVIL'), gw_t(d,'TLF_FAX'),
      gw_t(d,'CONTACTO'), gw_t(d,'DIREMAIL'), gw_t(d,'DIRWEB'), fp, gw_i(d,'TIPODOCDEF'),
      gw_i(d,'TIPDIASPA1'), gw_i(d,'TIPDIASPA2'), gw_i(d,'NUMPAGDEM'), gw_i(d,'DIAS_ENTR'), gw_n(d,'DEUDA'),
      gw_n(d,'PENDIENTES'), gw_b(d,'ESDEPENIN'), gw_b(d,'NOIMPU2_L'), alm, gw_b(d,'ESPRLOCAL'), gw_n(d,'DTOPIE'),
      tar, gw_t(d,'PROVEED400'), gw_t(d,'PROVEED600'), gw_d(d,'F_ALTA'), gw_d(d,'F_BAJA'),
      gw_d(d,'F_ULT_COMP'), gw_d(d,'F_ULT_PED'), gw_t(d,'SINLIID'),
      (gw_d(d,'F_BAJA') is null or gw_d(d,'F_BAJA') > current_date)
    from src where motivo is null
    on conflict (codigo) do update set nombre = excluded.nombre, razon_social = excluded.razon_social,
      nif = excluded.nif, direccion = excluded.direccion, codigo_postal = excluded.codigo_postal,
      provincia_codigo = excluded.provincia_codigo, pais_codigo = excluded.pais_codigo, poblacion = excluded.poblacion,
      telefono_fijo = excluded.telefono_fijo, telefono_movil = excluded.telefono_movil, fax = excluded.fax,
      contacto = excluded.contacto, email = excluded.email, web = excluded.web,
      forma_pago_codigo = excluded.forma_pago_codigo, tipo_documento_defecto = excluded.tipo_documento_defecto,
      dias_pago_1_tipo = excluded.dias_pago_1_tipo, dias_pago_2_tipo = excluded.dias_pago_2_tipo,
      num_pagos_demora = excluded.num_pagos_demora, dias_entrega = excluded.dias_entrega,
      deuda_actual = excluded.deuda_actual, pendiente_pago = excluded.pendiente_pago,
      es_proveedor_dependiente = excluded.es_proveedor_dependiente, no_aplica_impuesto2 = excluded.no_aplica_impuesto2,
      almacen_defecto_codigo = excluded.almacen_defecto_codigo, es_precio_local = excluded.es_precio_local,
      descuento_pie_pct = excluded.descuento_pie_pct, plantilla_tarifa_codigo = excluded.plantilla_tarifa_codigo,
      cuenta_contable_400 = excluded.cuenta_contable_400, cuenta_contable_600 = excluded.cuenta_contable_600,
      fecha_alta = excluded.fecha_alta, fecha_baja = excluded.fecha_baja,
      fecha_ultima_compra = excluded.fecha_ultima_compra, fecha_ultimo_pedido = excluded.fecha_ultimo_pedido,
      id_sinli = excluded.id_sinli, activo = excluded.activo, actualizado_en = now()
    returning (xmax = 0) ins)
  select gw_res('PROVEEDO', 'proveedor', (select count(*) from src),
    (select count(*) from up where ins), (select count(*) from up where not ins),
    (select jsonb_object_agg(motivo, n) from (select motivo, count(*) n from src where motivo is not null group by 1) x),
    (select jsonb_build_object('forma_pago', count(*) filter (where fp_raw is not null and fp is null),
                               'almacen (CODALMAC)', count(*) filter (where alm_raw is not null and alm is null),
                               'plantilla_tarifa', count(*) filter (where tar_raw is not null and tar is null),
                               'provincia', count(*) filter (where prov_raw is not null and prov is null),
                               'pais', count(*) filter (where pais_raw is not null and pais is null)) from src where motivo is null))
  into r;
  return r;
end $$;

-- -----------------------------------------------------------------------------
-- TIPOCLIE → tipo_cliente
-- -----------------------------------------------------------------------------
create or replace function public.fn_carga_gw_tipo_cliente() returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  with src as (
    select clave, datos d, gw_t(datos,'TIPOCLIENT') codigo,
      gw_t(datos,'FORMA_P') fp_raw, (select codigo from forma_pago f where f.codigo = gw_t(datos,'FORMA_P')) fp,
      gw_t(datos,'ZONATERRIT') zona_raw, (select codigo from zona_territorial z where z.codigo = gw_t(datos,'ZONATERRIT')) zona,
      gw_t(datos,'VENDEDOR') vend_raw, (select codigo from vendedor v where v.codigo = gw_t(datos,'VENDEDOR')) vend,
      case when gw_t(datos,'TIPOCLIENT') is null then 'sin código' end motivo
    from carga_dbf where tabla = 'TIPOCLIE'),
  up as (
    insert into tipo_cliente (codigo, descripcion, actividad, productos, forma_pago_codigo, zona_territorial_codigo,
      vendedor_codigo, tarifa_nivel_defecto, no_permite_modificar_tarifa, descuento_pct, limite_deuda,
      previsto_ventas, tipo_factura, dias_pago_1_tipo, dias_pago_2_tipo, fecha_alta)
    select codigo, coalesce(gw_t(d,'DESCRIP'), codigo), gw_t(d,'ACTIVIDAD'), gw_t(d,'PRODUCTOS'), fp, zona, vend,
      gw_i(d,'TARIFA'), gw_b(d,'NOMODIFTAR'), gw_n(d,'DESCUENTO'), gw_n(d,'LIMITEDEUD'), gw_n(d,'PREV_VENTA'),
      gw_i(d,'TIPOFACT'), gw_i(d,'TIPDIASPA1'), gw_i(d,'TIPDIASPA2'), gw_d(d,'F_ALTA')
    from src where motivo is null
    on conflict (codigo) do update set descripcion = excluded.descripcion, actividad = excluded.actividad,
      productos = excluded.productos, forma_pago_codigo = excluded.forma_pago_codigo,
      zona_territorial_codigo = excluded.zona_territorial_codigo, vendedor_codigo = excluded.vendedor_codigo,
      tarifa_nivel_defecto = excluded.tarifa_nivel_defecto, no_permite_modificar_tarifa = excluded.no_permite_modificar_tarifa,
      descuento_pct = excluded.descuento_pct, limite_deuda = excluded.limite_deuda,
      previsto_ventas = excluded.previsto_ventas, tipo_factura = excluded.tipo_factura,
      dias_pago_1_tipo = excluded.dias_pago_1_tipo, dias_pago_2_tipo = excluded.dias_pago_2_tipo,
      fecha_alta = excluded.fecha_alta, actualizado_en = now()
    returning (xmax = 0) ins)
  select gw_res('TIPOCLIE', 'tipo_cliente', (select count(*) from src),
    (select count(*) from up where ins), (select count(*) from up where not ins),
    (select jsonb_object_agg(motivo, n) from (select motivo, count(*) n from src where motivo is not null group by 1) x),
    (select jsonb_build_object('forma_pago', count(*) filter (where fp_raw is not null and fp is null),
                               'zona_territorial', count(*) filter (where zona_raw is not null and zona is null),
                               'vendedor', count(*) filter (where vend_raw is not null and vend is null)) from src where motivo is null))
  into r;
  return r;
end $$;

-- -----------------------------------------------------------------------------
-- CLIENTES → cliente
-- -----------------------------------------------------------------------------
create or replace function public.fn_carga_gw_cliente() returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  with src as (
    select clave, datos d, gw_t(datos,'IDCLIENTE') codigo,
      gw_t(datos,'TIPOCLIENT') tc_raw, (select codigo from tipo_cliente t where t.codigo = gw_t(datos,'TIPOCLIENT')) tc,
      gw_t(datos,'FORMA_P') fp_raw, (select codigo from forma_pago f where f.codigo = gw_t(datos,'FORMA_P')) fp,
      gw_t(datos,'ZONATERRIT') zona_raw, (select codigo from zona_territorial z where z.codigo = gw_t(datos,'ZONATERRIT')) zona,
      gw_t(datos,'VENDEDOR') vend_raw, (select codigo from vendedor v where v.codigo = gw_t(datos,'VENDEDOR')) vend,
      gw_t(datos,'IDRUTA') ruta_raw, (select codigo from ruta x where x.codigo = gw_t(datos,'IDRUTA')) ruta,
      gw_t(datos,'CLIOFICINA') ofi_raw, (select codigo from tienda_terminal t where t.codigo = gw_t(datos,'CLIOFICINA')) ofi,
      gw_t(datos,'CODPROV') prov_raw, (select codigo from provincia p where p.codigo = gw_t(datos,'CODPROV')) prov,
      gw_t(datos,'CODPAIS') pais_raw, gw_pais(gw_t(datos,'CODPAIS')) pais,
      case when gw_t(datos,'IDCLIENTE') is null then 'sin código' end motivo
    from carga_dbf where tabla = 'CLIENTES'),
  up as (
    insert into cliente (codigo, nombre, razon_social, nif, gerente, codigo_barras, contacto, direccion, codigo_postal,
      provincia_codigo, pais_codigo, poblacion, telefono_fijo, telefono_movil, fax, email, web, actividad, productos,
      tipo_cliente_codigo, forma_pago_codigo, tipo_credito, zona_territorial_codigo, tarifa_nivel_defecto,
      no_permite_modificar_tarifa, descuento_pct, descuento_en_pie, pvp_fijos, no_aplica_impuesto2, limite_deuda,
      deuda_actual, fecha_saldo_inicial, fecha_ultima_venta, dias_pago_1_tipo, dias_pago_1, dias_pago_2_tipo,
      dias_pago_2, dias_demora_pago, avisar_jefe_compras, tipo_factura_global, "nº_copias_factura",
      tienda_defecto_codigo, tipo_documento_contado, tipo_documento_credito,
      face_organo_gestor, face_organo_gestor_nombre, face_unidad_tramitadora, face_unidad_tramitadora_nombre,
      face_oficina_contable, face_oficina_contable_nombre, vendedor_codigo, ruta_codigo, orden_en_ruta,
      es_generico, es_peligroso, comentario, web_publicado, web_fecha_baja, web_id_cliente, web_id_sucursal,
      web_usuario, web_nombre_pila, web_apellidos, web_fact_nombre_pila, web_fact_apellidos,
      web_factura_datos_distintos, fecha_alta, fecha_baja, activo)
    select codigo, coalesce(gw_t(d,'NOMBRE'), gw_t(d,'RAZONSOC'), codigo), gw_t(d,'RAZONSOC'), gw_t(d,'NIF'),
      gw_t(d,'GERENTE'), gw_t(d,'COD_BARRAS'), gw_t(d,'CONTACTO'), gw_t(d,'DIRECCION'), gw_t(d,'CODPOSTAL'),
      prov, pais, gw_t(d,'POBLACION'), gw_t(d,'TLF_FIJO'), gw_t(d,'TLF_MOVIL'), gw_t(d,'TLF_FAX'),
      gw_t(d,'DIREMAIL'), gw_t(d,'DIRWEB'), gw_t(d,'ACTIVIDAD'), gw_t(d,'PRODUCTOS'),
      tc, fp, gw_t(d,'TIPOCREDIT'), zona, gw_i(d,'TARIFA'),
      gw_b(d,'NOMODIFTAR'), gw_n(d,'DESCUENTO'), gw_b(d,'DTOENPIE'), gw_b(d,'PVPFIJOS'), gw_b(d,'NOIMPU2_L'),
      gw_n(d,'LIMITEDEUD'), gw_n(d,'DEUDA'), gw_ts(d,'F_SALDOINI'), gw_d(d,'FECHAVENTA'),
      gw_i(d,'TIPDIASPA1'), gw_i(d,'DIASPAGO1'), gw_i(d,'TIPDIASPA2'), gw_i(d,'DIASPAGO2'), gw_i(d,'DIASDEMPAG'),
      gw_b(d,'AVIJEFCOMP'), gw_i(d,'TIPOFACT'), gw_i(d,'FACTNOCOP'), ofi, gw_i(d,'TIPODOCCTD'), gw_i(d,'TIPODOCCRD'),
      gw_t(d,'FACEORGGES'), gw_t(d,'FACEOGNAME'), gw_t(d,'FACEUNDTRA'), gw_t(d,'FACEUTNAME'),
      gw_t(d,'FACEOFICON'), gw_t(d,'FACEOCNAME'), vend, ruta, gw_i(d,'N_ORDENRUT'),
      gw_b(d,'ESGENERICO'), gw_b(d,'PELIGROSO'), gw_t(d,'COMENTARIO'), gw_b(d,'WEBPUBLIC'), gw_d(d,'WEB_F_BAJA'),
      gw_i(d,'WEBIDCLI'), gw_t(d,'WEBIDSUCUR'), gw_t(d,'WEBNOMBRE'), gw_t(d,'WEBFNAME'), gw_t(d,'WEBLNAME'),
      gw_t(d,'WEBFEFNAME'), gw_t(d,'WEBFELNAME'), gw_b(d,'WEBFACTDAT'), gw_d(d,'F_ALTA'), gw_d(d,'F_BAJA'),
      (gw_d(d,'F_BAJA') is null or gw_d(d,'F_BAJA') > current_date)
    from src where motivo is null
    on conflict (codigo) do update set nombre = excluded.nombre, razon_social = excluded.razon_social,
      nif = excluded.nif, gerente = excluded.gerente, codigo_barras = excluded.codigo_barras,
      contacto = excluded.contacto, direccion = excluded.direccion, codigo_postal = excluded.codigo_postal,
      provincia_codigo = excluded.provincia_codigo, pais_codigo = excluded.pais_codigo, poblacion = excluded.poblacion,
      telefono_fijo = excluded.telefono_fijo, telefono_movil = excluded.telefono_movil, fax = excluded.fax,
      email = excluded.email, web = excluded.web, actividad = excluded.actividad, productos = excluded.productos,
      tipo_cliente_codigo = excluded.tipo_cliente_codigo, forma_pago_codigo = excluded.forma_pago_codigo,
      tipo_credito = excluded.tipo_credito, zona_territorial_codigo = excluded.zona_territorial_codigo,
      tarifa_nivel_defecto = excluded.tarifa_nivel_defecto, no_permite_modificar_tarifa = excluded.no_permite_modificar_tarifa,
      descuento_pct = excluded.descuento_pct, descuento_en_pie = excluded.descuento_en_pie, pvp_fijos = excluded.pvp_fijos,
      no_aplica_impuesto2 = excluded.no_aplica_impuesto2, limite_deuda = excluded.limite_deuda,
      deuda_actual = excluded.deuda_actual, fecha_saldo_inicial = excluded.fecha_saldo_inicial,
      fecha_ultima_venta = excluded.fecha_ultima_venta, dias_pago_1_tipo = excluded.dias_pago_1_tipo,
      dias_pago_1 = excluded.dias_pago_1, dias_pago_2_tipo = excluded.dias_pago_2_tipo, dias_pago_2 = excluded.dias_pago_2,
      dias_demora_pago = excluded.dias_demora_pago, avisar_jefe_compras = excluded.avisar_jefe_compras,
      tipo_factura_global = excluded.tipo_factura_global, "nº_copias_factura" = excluded."nº_copias_factura",
      tienda_defecto_codigo = excluded.tienda_defecto_codigo, tipo_documento_contado = excluded.tipo_documento_contado,
      tipo_documento_credito = excluded.tipo_documento_credito, face_organo_gestor = excluded.face_organo_gestor,
      face_organo_gestor_nombre = excluded.face_organo_gestor_nombre, face_unidad_tramitadora = excluded.face_unidad_tramitadora,
      face_unidad_tramitadora_nombre = excluded.face_unidad_tramitadora_nombre, face_oficina_contable = excluded.face_oficina_contable,
      face_oficina_contable_nombre = excluded.face_oficina_contable_nombre, vendedor_codigo = excluded.vendedor_codigo,
      ruta_codigo = excluded.ruta_codigo, orden_en_ruta = excluded.orden_en_ruta, es_generico = excluded.es_generico,
      es_peligroso = excluded.es_peligroso, comentario = excluded.comentario, web_publicado = excluded.web_publicado,
      web_fecha_baja = excluded.web_fecha_baja, web_id_cliente = excluded.web_id_cliente,
      web_id_sucursal = excluded.web_id_sucursal, web_usuario = excluded.web_usuario,
      web_nombre_pila = excluded.web_nombre_pila, web_apellidos = excluded.web_apellidos,
      web_fact_nombre_pila = excluded.web_fact_nombre_pila, web_fact_apellidos = excluded.web_fact_apellidos,
      web_factura_datos_distintos = excluded.web_factura_datos_distintos, fecha_alta = excluded.fecha_alta,
      fecha_baja = excluded.fecha_baja, activo = excluded.activo, actualizado_en = now()
    returning (xmax = 0) ins)
  select gw_res('CLIENTES', 'cliente', (select count(*) from src),
    (select count(*) from up where ins), (select count(*) from up where not ins),
    (select jsonb_object_agg(motivo, n) from (select motivo, count(*) n from src where motivo is not null group by 1) x),
    (select jsonb_build_object(
       'tipo_cliente', count(*) filter (where tc_raw is not null and tc is null),
       'forma_pago', count(*) filter (where fp_raw is not null and fp is null),
       'zona_territorial', count(*) filter (where zona_raw is not null and zona is null),
       'vendedor', count(*) filter (where vend_raw is not null and vend is null),
       'ruta', count(*) filter (where ruta_raw is not null and ruta is null),
       'tienda_defecto (CLIOFICINA)', count(*) filter (where ofi_raw is not null and ofi is null),
       'provincia', count(*) filter (where prov_raw is not null and prov is null),
       'pais', count(*) filter (where pais_raw is not null and pais is null)) from src where motivo is null))
  into r;
  return r;
end $$;

-- -----------------------------------------------------------------------------
-- ARTICULO → articulo (precios por nivel en fn_carga_gw_articulo_precio_nivel)
-- -----------------------------------------------------------------------------
create or replace function public.fn_carga_gw_articulo() returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  with src as (
    select clave, datos d, gw_t(datos,'COD_INTERN') codigo,
      gw_t(datos,'COD_FAM') fam_raw, (select codigo from familia f where f.codigo = gw_t(datos,'COD_FAM')) fam,
      gw_t(datos,'MARCA') mar_raw, (select codigo from marca m where m.codigo = gw_t(datos,'MARCA')) mar,
      gw_t(datos,'COD_PROV') prv_raw, (select codigo from proveedor p where p.codigo = gw_t(datos,'COD_PROV')) prv,
      gw_t(datos,'CODARTTAR') tar_raw, (select codigo from plantilla_tarifa p where p.codigo = gw_t(datos,'CODARTTAR')) tar,
      case when gw_t(datos,'COD_INTERN') is null then 'sin código' end motivo
    from carga_dbf where tabla = 'ARTICULO'),
  up as (
    insert into articulo (codigo_interno, descripcion, descripcion_corta, marca_codigo, familia_codigo,
      proveedor_habitual_codigo, codigo_compra_habitual, codigo_venta, codigo_barras_principal, campo_libre,
      unidades_por_caja, cajas_por_bulto, unidad_medida, unidad_medida_base, unidad_medida_valor, vende_por_caja,
      sin_control_stock, stock_minimo, stock_maximo, ubicacion_1, ubicacion_2,
      coste_puro, coste_bruto, coste_neto, precio_medio_compra, precio_liquidado, coste_local,
      igic_pct, impuesto2_pct, impuesto3_pct, pvp, precio_oferta, oferta_fecha_desde, oferta_fecha_hasta,
      descuento_maximo_cliente_pct, fecha_ultima_modificacion_pvp, permite_modificar_pvp_al_vender,
      permite_modificar_pvp_solo_si_es_cero, modificar_pvp_actualiza_articulo, pvp_es_padre_de_variantes,
      web_publicado, web_fecha_baja, web_id_link, web_destacado, web_sin_observaciones, web_sin_oferta,
      ultima_compra_fecha, ultima_venta_fecha, ultima_compra_tienda, ultima_compra_numero,
      ultimo_descuento_compra_pct, ultima_bonificacion_compra, ultimas_unidades_compradas,
      fecha_alta, fecha_baja, activo, plantilla_tarifa_codigo, coste_usado_calculo_pvp, generico, pvp_fijo,
      und_asignar, und_stock_valor, und_vender_por_stock, und_stock_descripcion,
      unidades_pedidas, unidades_reservadas, unidades_compradas,
      composicion_no_sumar_coste, composicion_no_sumar_pvp)
    select codigo, coalesce(gw_t(d,'DESCRIP'), codigo), gw_t(d,'DESCRCORTA'), mar, fam,
      prv, gw_t(d,'COD_COMPRA'), gw_t(d,'COD_VENTA'), gw_t(d,'COD_BARRAS'), gw_t(d,'CMP_LIBRE'),
      gw_n(d,'UNI_CAJA'), gw_n(d,'CAJ_BULTO'), gw_t(d,'UNI_MEDIDA'), gw_t(d,'UNI_MEDBAS'), gw_n(d,'UNI_MEDVAL'),
      gw_b(d,'VENDPORCAJ'), gw_b(d,'SINSTOCK'), gw_n(d,'STOCK_MIN'), gw_n(d,'STOCK_MAX'),
      gw_t(d,'UBICACION1'), gw_t(d,'UBICACION2'),
      gw_n(d,'COSTE_PURO'), gw_n(d,'COSTE_BRUT'), gw_n(d,'COSTE_NETO'), gw_n(d,'PM_COMPRA'), gw_n(d,'PRECIO_LIQ'),
      gw_n(d,'COST_LOCAL'),
      coalesce(gw_n(d,'IGIC'), 0), gw_n(d,'IMPU2'), gw_n(d,'IMPU3'), coalesce(gw_n(d,'PVP_0'), gw_n(d,'PVP'), 0),
      gw_n(d,'PVP_OFERTA'), gw_d(d,'FECHA_OFD'), gw_d(d,'FECHA_OFH'),
      gw_n(d,'DTOMAXCLI'), gw_ts(d,'F_MODPREC'), gw_b(d,'MODITPV'),
      gw_b(d,'MPVPSIPVP0'), gw_b(d,'MPVPUPDART'), gw_b(d,'PVPPADRE'),
      gw_b(d,'WEBPUBLIC'), gw_d(d,'WEB_F_BAJA'), gw_i(d,'WEBIDLINK'), gw_b(d,'WEBDESTACA'), gw_b(d,'WEBNOOBS'),
      gw_b(d,'WEBNOOFERT'),
      gw_d(d,'ULTCOMPRA'), gw_d(d,'ULTVENTA'), gw_t(d,'ULTOFICOMP'), round(gw_n(d,'ULTNUMCOMP'))::bigint,
      gw_n(d,'ULTDTOCOMP'), gw_n(d,'ULTBONCOMP'), gw_n(d,'ULTUNICOMP'),
      gw_d(d,'F_ALTA'), gw_d(d,'F_BAJA'), (gw_d(d,'F_BAJA') is null or gw_d(d,'F_BAJA') > current_date),
      tar, gw_n(d,'COSTEPVP_0'), gw_b(d,'MODDES'), coalesce(gw_i(d,'FOV') = 1, false),
      gw_b(d,'UNDASIGNAD'), coalesce(gw_n(d,'UNDSTOCK'), 1), gw_b(d,'UNDVENDPAD'), gw_t(d,'UNDDESCRST'),
      coalesce(gw_n(d,'UNI_PEDIDA'), 0), coalesce(gw_n(d,'UNI_RESERV'), 0), coalesce(gw_n(d,'UNI_COMPRA'), 0),
      gw_b(d,'NOCALCCTE'), gw_b(d,'NOCALCPVP')
    from src where motivo is null
    on conflict (codigo_interno) do update set descripcion = excluded.descripcion,
      descripcion_corta = excluded.descripcion_corta, marca_codigo = excluded.marca_codigo,
      familia_codigo = excluded.familia_codigo, proveedor_habitual_codigo = excluded.proveedor_habitual_codigo,
      codigo_compra_habitual = excluded.codigo_compra_habitual, codigo_venta = excluded.codigo_venta,
      codigo_barras_principal = excluded.codigo_barras_principal, campo_libre = excluded.campo_libre,
      unidades_por_caja = excluded.unidades_por_caja, cajas_por_bulto = excluded.cajas_por_bulto,
      unidad_medida = excluded.unidad_medida, unidad_medida_base = excluded.unidad_medida_base,
      unidad_medida_valor = excluded.unidad_medida_valor, vende_por_caja = excluded.vende_por_caja,
      sin_control_stock = excluded.sin_control_stock, stock_minimo = excluded.stock_minimo,
      stock_maximo = excluded.stock_maximo, ubicacion_1 = excluded.ubicacion_1, ubicacion_2 = excluded.ubicacion_2,
      coste_puro = excluded.coste_puro, coste_bruto = excluded.coste_bruto, coste_neto = excluded.coste_neto,
      precio_medio_compra = excluded.precio_medio_compra, precio_liquidado = excluded.precio_liquidado,
      coste_local = excluded.coste_local, igic_pct = excluded.igic_pct, impuesto2_pct = excluded.impuesto2_pct,
      impuesto3_pct = excluded.impuesto3_pct, pvp = excluded.pvp, precio_oferta = excluded.precio_oferta,
      oferta_fecha_desde = excluded.oferta_fecha_desde, oferta_fecha_hasta = excluded.oferta_fecha_hasta,
      descuento_maximo_cliente_pct = excluded.descuento_maximo_cliente_pct,
      fecha_ultima_modificacion_pvp = excluded.fecha_ultima_modificacion_pvp,
      permite_modificar_pvp_al_vender = excluded.permite_modificar_pvp_al_vender,
      permite_modificar_pvp_solo_si_es_cero = excluded.permite_modificar_pvp_solo_si_es_cero,
      modificar_pvp_actualiza_articulo = excluded.modificar_pvp_actualiza_articulo,
      pvp_es_padre_de_variantes = excluded.pvp_es_padre_de_variantes, web_publicado = excluded.web_publicado,
      web_fecha_baja = excluded.web_fecha_baja, web_id_link = excluded.web_id_link,
      web_destacado = excluded.web_destacado, web_sin_observaciones = excluded.web_sin_observaciones,
      web_sin_oferta = excluded.web_sin_oferta, ultima_compra_fecha = excluded.ultima_compra_fecha,
      ultima_venta_fecha = excluded.ultima_venta_fecha, ultima_compra_tienda = excluded.ultima_compra_tienda,
      ultima_compra_numero = excluded.ultima_compra_numero,
      ultimo_descuento_compra_pct = excluded.ultimo_descuento_compra_pct,
      ultima_bonificacion_compra = excluded.ultima_bonificacion_compra,
      ultimas_unidades_compradas = excluded.ultimas_unidades_compradas, fecha_alta = excluded.fecha_alta,
      fecha_baja = excluded.fecha_baja, activo = excluded.activo,
      plantilla_tarifa_codigo = excluded.plantilla_tarifa_codigo,
      coste_usado_calculo_pvp = excluded.coste_usado_calculo_pvp, generico = excluded.generico,
      pvp_fijo = excluded.pvp_fijo, und_asignar = excluded.und_asignar, und_stock_valor = excluded.und_stock_valor,
      und_vender_por_stock = excluded.und_vender_por_stock, und_stock_descripcion = excluded.und_stock_descripcion,
      unidades_pedidas = excluded.unidades_pedidas, unidades_reservadas = excluded.unidades_reservadas,
      unidades_compradas = excluded.unidades_compradas,
      composicion_no_sumar_coste = excluded.composicion_no_sumar_coste,
      composicion_no_sumar_pvp = excluded.composicion_no_sumar_pvp, actualizado_en = now()
    returning (xmax = 0) ins)
  select gw_res('ARTICULO', 'articulo', (select count(*) from src),
    (select count(*) from up where ins), (select count(*) from up where not ins),
    (select jsonb_object_agg(motivo, n) from (select motivo, count(*) n from src where motivo is not null group by 1) x),
    (select jsonb_build_object(
       'familia', count(*) filter (where fam_raw is not null and fam is null),
       'marca', count(*) filter (where mar_raw is not null and mar is null),
       'proveedor_habitual', count(*) filter (where prv_raw is not null and prv is null),
       'plantilla_tarifa', count(*) filter (where tar_raw is not null and tar is null)) from src where motivo is null),
    (select jsonb_build_object('proveedor_habitual_ausente_codigos',
       (select jsonb_agg(c) from (select distinct prv_raw c from src where prv_raw is not null and prv is null order by 1 limit 20) z))))
  into r;
  return r;
end $$;

-- -----------------------------------------------------------------------------
-- ARTICULO.PVP_n / INC_PVPn / PODn / VERDTO_n → articulo_precio_nivel (niveles 0..6)
-- -----------------------------------------------------------------------------
create or replace function public.fn_carga_gw_articulo_precio_nivel() returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  with src as (
    select gw_t(c.datos,'COD_INTERN') art, n::smallint nivel,
      coalesce(gw_n(c.datos, 'PVP_' || n), case when n = 0 then gw_n(c.datos,'PVP') end, 0) pvp,
      coalesce(gw_n(c.datos, 'INC_PVP' || n), 0) inc,
      case when gw_t(c.datos, 'POD' || n) in ('P','D','N') then gw_t(c.datos, 'POD' || n) end modo,
      gw_t(c.datos, 'VERDTO_' || n) = 'S' verdto,
      case when not exists (select 1 from articulo a where a.codigo_interno = gw_t(c.datos,'COD_INTERN'))
           then 'artículo inexistente' end motivo
    from carga_dbf c cross join generate_series(0, 6) n
    where c.tabla = 'ARTICULO'
      and (gw_n(c.datos, 'PVP_' || n) is not null or gw_n(c.datos, 'INC_PVP' || n) is not null
           or gw_t(c.datos, 'POD' || n) is not null)),
  up as (
    insert into articulo_precio_nivel (articulo_codigo, nivel_tarifa, pvp, incremento_pct, modo_calculo, permite_descuento_linea)
    select art, nivel, pvp, inc, modo, coalesce(verdto, false) from src where motivo is null
    on conflict (articulo_codigo, nivel_tarifa) do update set pvp = excluded.pvp, incremento_pct = excluded.incremento_pct,
      modo_calculo = excluded.modo_calculo, permite_descuento_linea = excluded.permite_descuento_linea
    returning (xmax = 0) ins)
  select gw_res('ARTICULO (PVP_0..6)', 'articulo_precio_nivel', (select count(*) from src),
    (select count(*) from up where ins), (select count(*) from up where not ins),
    (select jsonb_object_agg(motivo, n) from (select motivo, count(*) n from src where motivo is not null group by 1) x), null)
  into r;
  return r;
end $$;

-- -----------------------------------------------------------------------------
-- ARTBARRA → articulo_codigo_barras (clave: el propio código de barras)
-- -----------------------------------------------------------------------------
create or replace function public.fn_carga_gw_articulo_codigo_barras() returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  with base as (
    select clave, datos d, btrim(datos->>'COD_BARRAS') cb, gw_t(datos,'COD_INTERN') art,
      exists (select 1 from articulo a where a.codigo_interno = gw_t(datos,'COD_INTERN')) art_ok,
      gw_t(datos,'COD_PROV') prv_raw, (select codigo from proveedor p where p.codigo = gw_t(datos,'COD_PROV')) prv
    from carga_dbf where tabla = 'ARTBARRA'),
  src as (
    select b.*, case
      when nullif(cb, '') is null then 'sin código de barras'
      when not art_ok then 'artículo inexistente'
      when row_number() over (partition by cb order by art) > 1 then 'código de barras repetido (se queda el del primer artículo)'
    end motivo
    from base b),
  up as (
    insert into articulo_codigo_barras (codigo_barras, articulo_codigo, proveedor_codigo, digitos_barras)
    select cb, art, prv, gw_i(d,'DIG_BARRAS') from src where motivo is null
    on conflict (codigo_barras) do update set articulo_codigo = excluded.articulo_codigo,
      proveedor_codigo = excluded.proveedor_codigo, digitos_barras = excluded.digitos_barras, actualizado_en = now()
    returning (xmax = 0) ins)
  select gw_res('ARTBARRA', 'articulo_codigo_barras', (select count(*) from src),
    (select count(*) from up where ins), (select count(*) from up where not ins),
    (select jsonb_object_agg(motivo, jsonb_build_object('filas', n, 'ejemplos', ej)) from
       (select motivo, count(*) n, to_jsonb((array_agg(clave order by clave))[1:3]) ej from src where motivo is not null group by 1) x),
    (select jsonb_build_object('proveedor', count(*) filter (where prv_raw is not null and prv is null)) from src where motivo is null))
  into r;
  return r;
end $$;

-- -----------------------------------------------------------------------------
-- ARTDPROV (datos y costes) + ARTPROV (códigos de compra) → articulo_proveedor
-- Una fila por (artículo, proveedor). codigo_compra = el de ARTDPROV; si no hay,
-- el primero de ARTPROV. Los demás códigos de ARTPROV no tienen dónde guardarse.
-- -----------------------------------------------------------------------------
create or replace function public.fn_carga_gw_articulo_proveedor() returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  with dp as (
    select gw_t(datos,'COD_PROV') prov, gw_t(datos,'COD_INTERN') art, datos d, clave
    from carga_dbf where tabla = 'ARTDPROV'),
  ap as (
    select gw_t(datos,'COD_PROV') prov, gw_t(datos,'COD_INTERN') art,
      min(gw_t(datos,'COD_COMPRA')) cod, count(*) n, array_agg(gw_t(datos,'COD_COMPRA')) cods, min(clave) clave
    from carga_dbf where tabla = 'ARTPROV' group by 1, 2),
  src as (
    select coalesce(dp.prov, ap.prov) prov, coalesce(dp.art, ap.art) art, dp.d,
      coalesce(gw_t(dp.d,'COD_COMPRA'), ap.cod) cod, coalesce(dp.clave, ap.clave) clave,
      (select count(*) from unnest(ap.cods) c where c is not null and c is distinct from coalesce(gw_t(dp.d,'COD_COMPRA'), ap.cod)) codigos_extra,
      case when dp.d is not null and ap.prov is null and ap.art is null then 'ARTDPROV'
           when dp.d is null then 'ARTPROV' else 'ambos' end origen,
      case when coalesce(dp.prov, ap.prov) is null then 'sin proveedor'
           when not exists (select 1 from proveedor p where p.codigo = coalesce(dp.prov, ap.prov)) then 'proveedor inexistente'
           when not exists (select 1 from articulo a where a.codigo_interno = coalesce(dp.art, ap.art)) then 'artículo inexistente'
      end motivo
    from dp full join ap on coalesce(ap.prov, '') = coalesce(dp.prov, '') and ap.art = dp.art),
  up as (
    insert into articulo_proveedor (articulo_codigo, proveedor_codigo, codigo_compra, coste_puro, coste_neto, coste_bruto,
      precio_medio_compra, ultimo_descuento_pct, impuesto1_pct, impuesto2_pct, impuesto3_pct, ultima_bonificacion,
      ultima_compra_tienda, ultima_compra_numero, ultima_compra_fecha, fecha_prevista_entrega,
      ultimas_unidades_compradas, unidades_pedidas, unidades_compra)
    select art, prov, cod, gw_n(d,'COSTE_PURO'), gw_n(d,'COSTE_NETO'), gw_n(d,'COSTE_BRUT'), gw_n(d,'PM_COMPRA'),
      gw_n(d,'ULTDTOCOMP'), gw_n(d,'T_IMP1'), gw_n(d,'T_IMP2'), gw_n(d,'T_IMP3'), gw_n(d,'ULTBONCOMP'),
      gw_t(d,'ULTOFICOMP'), round(gw_n(d,'ULTNUMCOMP'))::bigint, gw_d(d,'ULTCOMPRA'), gw_d(d,'FECPREVENT'),
      gw_n(d,'ULTUNICOMP'), gw_n(d,'UNI_PEDIDA'), gw_n(d,'UNI_COMPRA')
    from src where motivo is null
    on conflict (articulo_codigo, proveedor_codigo) do update set codigo_compra = excluded.codigo_compra,
      coste_puro = excluded.coste_puro, coste_neto = excluded.coste_neto, coste_bruto = excluded.coste_bruto,
      precio_medio_compra = excluded.precio_medio_compra, ultimo_descuento_pct = excluded.ultimo_descuento_pct,
      impuesto1_pct = excluded.impuesto1_pct, impuesto2_pct = excluded.impuesto2_pct,
      impuesto3_pct = excluded.impuesto3_pct, ultima_bonificacion = excluded.ultima_bonificacion,
      ultima_compra_tienda = excluded.ultima_compra_tienda, ultima_compra_numero = excluded.ultima_compra_numero,
      ultima_compra_fecha = excluded.ultima_compra_fecha, fecha_prevista_entrega = excluded.fecha_prevista_entrega,
      ultimas_unidades_compradas = excluded.ultimas_unidades_compradas, unidades_pedidas = excluded.unidades_pedidas,
      unidades_compra = excluded.unidades_compra, actualizado_en = now()
    returning (xmax = 0) ins)
  select gw_res('ARTDPROV + ARTPROV', 'articulo_proveedor', (select count(*) from src),
    (select count(*) from up where ins), (select count(*) from up where not ins),
    (select jsonb_object_agg(motivo, jsonb_build_object('pares', n, 'proveedores_distintos', np, 'ejemplos', ej)) from
       (select motivo, count(*) n, count(distinct prov) np, to_jsonb((array_agg(distinct prov))[1:5]) ej
        from src where motivo is not null group by 1) x),
    null,
    jsonb_build_object(
      'filas_ARTDPROV', (select count(*) from dp), 'filas_ARTPROV', (select sum(n) from ap),
      'pares_por_origen', (select jsonb_object_agg(origen, n) from (select origen, count(*) n from src group by 1) o),
      'codigos_de_compra_alternativos_no_guardados', (select sum(codigos_extra) from src where motivo is null)))
  into r;
  return r;
end $$;

-- -----------------------------------------------------------------------------
-- ARTICALM → articulo_almacen_stock, vía movimiento_stock tipo 'inventario'.
--   * cantidad_actual: se lleva al valor del DBF con un movimiento de inventario
--     por la DIFERENCIA (el trigger fn_actualizar_stock_desde_movimiento hace el
--     resto). Si ya cuadra, no se crea movimiento → repetir la carga no duplica.
--   * cantidad_inicial / fecha_stock_inicial: se copian tal cual (CANTINIC,
--     FECHSTKINI): son datos informativos de GeminisWin.
-- -----------------------------------------------------------------------------
create or replace function public.fn_carga_gw_articulo_almacen_stock() returns jsonb
language plpgsql as $$
declare r jsonb; v_info bigint;
begin
  with src as (
    select clave, datos d, gw_t(datos,'COD_INTERN') art, gw_t(datos,'CODALMAC') alm,
      coalesce(gw_n(datos,'CANTIDAD'), 0) cant,
      case when gw_t(datos,'CODALMAC') is null then 'sin almacén'
           when not exists (select 1 from almacen a where a.codigo = gw_t(datos,'CODALMAC')) then 'almacén inexistente'
           when not exists (select 1 from articulo a where a.codigo_interno = gw_t(datos,'COD_INTERN')) then 'artículo inexistente'
           when count(*) over (partition by gw_t(datos,'COD_INTERN'), gw_t(datos,'CODALMAC')) > 1 then 'repetido'
      end motivo
    from carga_dbf where tabla = 'ARTICALM'),
  dif as (
    select s.*, s.cant - coalesce((select st.cantidad_actual from articulo_almacen_stock st
                                    where st.articulo_codigo = s.art and st.almacen_codigo = s.alm), 0) delta
    from src s where motivo is null),
  mov as (
    insert into movimiento_stock (tipo_movimiento, sentido, almacen_codigo, articulo_codigo, cantidad,
      documento_origen_tipo, observaciones)
    select 'inventario', sign(delta)::smallint, alm, art, abs(delta), 'carga_geminiswin',
      'Stock inicial de GeminisWin (ARTICALM): ajuste por diferencia'
    from dif where delta <> 0
    returning 1)
  select gw_res('ARTICALM', 'articulo_almacen_stock (vía movimiento_stock inventario)', (select count(*) from src),
    null, null,
    (select jsonb_object_agg(motivo, jsonb_build_object('filas', n, 'ejemplos', ej)) from
       (select motivo, count(*) n, to_jsonb((array_agg(clave order by clave))[1:3]) ej from src where motivo is not null group by 1) x),
    null,
    jsonb_build_object('filas_validas', (select count(*) from dif),
                       'movimientos_de_ajuste_creados', (select count(*) from mov),
                       'filas_que_ya_cuadraban', (select count(*) from dif where delta = 0)))
  into r;

  -- Datos informativos (no mueven stock). Se hace después del insert de movimientos
  -- (el trigger ya ha creado las filas que faltaban).
  with s as (
    select gw_t(datos,'COD_INTERN') art, gw_t(datos,'CODALMAC') alm,
      gw_n(datos,'CANTINIC') ini, gw_ts(datos,'FECHSTKINI') fini
    from carga_dbf where tabla = 'ARTICALM'),
  u as (
    insert into articulo_almacen_stock (articulo_codigo, almacen_codigo, cantidad_inicial, fecha_stock_inicial)
    select s.art, s.alm, s.ini, s.fini from s
    where exists (select 1 from almacen a where a.codigo = s.alm)
      and exists (select 1 from articulo a where a.codigo_interno = s.art)
    on conflict (articulo_codigo, almacen_codigo) do update set cantidad_inicial = excluded.cantidad_inicial,
      fecha_stock_inicial = excluded.fecha_stock_inicial
    returning 1)
  select count(*) into v_info from u;

  return r || jsonb_build_object('filas_stock_actualizadas', v_info);
end $$;

-- -----------------------------------------------------------------------------
-- CLIENART → cliente_articulo_precio
-- -----------------------------------------------------------------------------
create or replace function public.fn_carga_gw_cliente_articulo_precio() returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  with src as (
    select clave, datos d, gw_t(datos,'IDCLIENTE') cli, gw_t(datos,'COD_INTERN') art,
      case when not exists (select 1 from cliente c where c.codigo = gw_t(datos,'IDCLIENTE')) then 'cliente inexistente'
           when not exists (select 1 from articulo a where a.codigo_interno = gw_t(datos,'COD_INTERN')) then 'artículo inexistente'
           when count(*) over (partition by gw_t(datos,'IDCLIENTE'), gw_t(datos,'COD_INTERN')) > 1 then 'repetido'
      end motivo
    from carga_dbf where tabla = 'CLIENART'),
  up as (
    insert into cliente_articulo_precio (cliente_codigo, articulo_codigo, pvp, cantidad_minima, fecha_fin)
    select cli, art, coalesce(gw_n(d,'PVP'), 0), gw_n(d,'CANTIDAD'), gw_d(d,'FECHA_FIN') from src where motivo is null
    on conflict (cliente_codigo, articulo_codigo) do update set pvp = excluded.pvp,
      cantidad_minima = excluded.cantidad_minima, fecha_fin = excluded.fecha_fin, actualizado_en = now()
    returning (xmax = 0) ins)
  select gw_res('CLIENART', 'cliente_articulo_precio', (select count(*) from src),
    (select count(*) from up where ins), (select count(*) from up where not ins),
    (select jsonb_object_agg(motivo, n) from (select motivo, count(*) n from src where motivo is not null group by 1) x), null)
  into r;
  return r;
end $$;

-- -----------------------------------------------------------------------------
-- Principal: todo en orden de dependencias, en una sola transacción.
-- -----------------------------------------------------------------------------
create or replace function public.fn_carga_gw_todo() returns jsonb
language plpgsql as $$
declare
  v_ini timestamptz := clock_timestamp();
  v jsonb := '[]'::jsonb;
  v_res jsonb;
begin
  v := v || fn_carga_gw_pais();
  v := v || fn_carga_gw_provincia();
  v := v || fn_carga_gw_forma_pago();
  v := v || fn_carga_gw_almacen();
  v := v || fn_carga_gw_tienda_terminal();
  v := v || fn_carga_gw_zona_territorial();
  v := v || fn_carga_gw_ruta_reparto();
  v := v || fn_carga_gw_ruta_reparto_zona();
  v := v || fn_carga_gw_repartidor();
  v := v || fn_carga_gw_ruta_reparto_repartidor();
  v := v || fn_carga_gw_vendedor();
  v := v || fn_carga_gw_transportista();
  v := v || fn_carga_gw_plantilla_tarifa();
  v := v || fn_carga_gw_familia();
  v := v || fn_carga_gw_marca();
  v := v || fn_carga_gw_proveedor();
  v := v || fn_carga_gw_tipo_cliente();
  v := v || fn_carga_gw_cliente();
  v := v || fn_carga_gw_articulo();
  v := v || fn_carga_gw_articulo_precio_nivel();
  v := v || fn_carga_gw_articulo_codigo_barras();
  v := v || fn_carga_gw_articulo_proveedor();
  v := v || fn_carga_gw_articulo_almacen_stock();
  v := v || fn_carga_gw_cliente_articulo_precio();

  -- Filas en carga_dbf frente al recuento del DBF original (_RESUMEN).
  select jsonb_object_agg(r.clave, jsonb_build_object('dbf', (r.datos->>'registros')::int, 'carga_dbf', coalesce(c.n, 0)))
  into v_res
  from carga_dbf r
  left join (select tabla, count(*) n from carga_dbf group by 1) c on c.tabla = r.clave
  where r.tabla = '_RESUMEN' and (r.datos->>'registros')::int is distinct from c.n;

  return jsonb_build_object(
    'inicio', v_ini, 'duracion_s', round(extract(epoch from clock_timestamp() - v_ini)::numeric, 1),
    'resumen_dbf_distinto_de_carga_dbf', coalesce(v_res, '{}'::jsonb),
    'tablas', v);
end $$;

-- -----------------------------------------------------------------------------
-- Permisos: solo postgres / service_role (nunca desde la app).
-- -----------------------------------------------------------------------------
do $$
declare f text;
begin
  for f in
    select p.oid::regprocedure::text from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and (p.proname like 'fn\_carga\_gw\_%' or p.proname in ('gw_t','gw_n','gw_i','gw_b','gw_d','gw_ts','gw_pais','gw_sin_ceros','gw_res'))
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
