-- Circuito de reparto en el ERP con las ventas de GeminisWin (18/11/2026, Rober).
--
-- Hasta ahora los repartos se generaban y se cerraban en GeminisWin y el puente los traía a la app. Desde aquí,
-- ruta a ruta, se generan y se cierran en el ERP, y Cande liquida en el ERP lo que le entregan los repartidores:
--
--   1. VENTAS NUEVAS. El puente (puente_reparto.py) manda además las ventas nuevas de GeminisWin con la ruta y la
--      dirección del cliente o de su sucursal, y en cada pasada vuelve a leer las que el ERP le pide vigilar
--      (fn_reparto_gw_vigilar): así se sabe si se han facturado, si GeminisWin las ha metido en un reparto suyo y
--      si ya están cobradas. Se enciende con el parámetro reparto.puente_gw_ventas.
--   2. GENERAR Y CERRAR. En Ventas → Repartos → «Generar repartos» se ve por ruta la propuesta: las ventas de
--      clientes de esa ruta que no han ido en ningún reparto y las que no se entregaron en el anterior. Se elige
--      repartidor y se genera. Al generar se cierra el reparto anterior de esa ruta: lo que quedó sin entregar
--      vuelve a salir en la propuesta, marcado como «viene del anterior».
--      Solo las rutas del parámetro reparto.erp_rutas se generan aquí. Las demás se pueden COMPARAR: lo que el
--      ERP habría generado al lado de lo que ha generado GeminisWin, para probar antes de cambiar.
--   3. LIQUIDAR. En la app, la Caja de administración (usuario CAJA) marca las facturas que le entrega el
--      repartidor y pulsa «Liquidar»: queda guardado quién, cuándo, cuánto tenía que entregar y cuánto entregó
--      (reparto_liquidacion), y las facturas pasan a «Liquidada». El cobro se sigue apuntando en GeminisWin desde
--      la pantalla de cobros de siempre; hasta que el puente lo ve pagado allí, la factura sale en la lista
--      «Falta apuntar en GeminisWin».
--
-- Lo que no cambia: ventas, facturas y cobros siguen en GeminisWin; el reparto es control interno y GeminisWin no
-- necesita saber nada de él. Nunca se escribe en los ficheros de GeminisWin.
--
-- Los repartos generados aquí son de origen «geminiswin» (sus ventas son de GeminisWin y se leen de
-- reparto_gw_venta, igual que los traídos por el puente) con la marca generado_erp: el puente no los toca y, al
-- revés que los traídos, se cierran y se cambian en el ERP. Se numeran en la tienda del parámetro
-- reparto.erp_tienda a partir de 900001, para que nunca coincidan con los números de GeminisWin.

---------------------------------------------------------------------------------------------------- estructura
alter table public.reparto add column if not exists generado_erp boolean not null default false;
comment on column public.reparto.generado_erp is
  'Reparto generado en el ERP con ventas de GeminisWin (Ventas → Repartos → Generar repartos). El puente no lo toca; se cierra en el ERP.';

alter table public.reparto_gw_venta
  add column if not exists sucursal_codigo text,
  add column if not exists hora text,
  add column if not exists tienda_pedido text,
  add column if not exists ruta_venta text,
  add column if not exists ruta_cliente text,
  add column if not exists orden_ruta integer,
  add column if not exists generico boolean,
  add column if not exists gw_estado smallint,
  add column if not exists gw_reparto text,
  add column if not exists fecha_pago date,
  add column if not exists contacto text,
  add column if not exists direccion text,
  add column if not exists codigo_postal text,
  add column if not exists poblacion text,
  add column if not exists telefono_fijo text,
  add column if not exists telefono_movil text,
  add column if not exists email text,
  add column if not exists nueva boolean not null default false;
comment on column public.reparto_gw_venta.ruta_venta is 'VENTAS.IDRUTA: ruta puesta en la propia venta (manda sobre la de la ficha).';
comment on column public.reparto_gw_venta.ruta_cliente is 'Ruta de la sucursal de la venta o, si no tiene, la del cliente (CLISUCUR / CLIENTES.IDRUTA).';
comment on column public.reparto_gw_venta.gw_estado is 'VENTAS.REPARTO: estado de la venta en los repartos de GeminisWin (2 en reparto abierto, 4 entregado, 5 liquidado, 7 no entregado).';
comment on column public.reparto_gw_venta.gw_reparto is 'VENTAS.IDOFIPREP-IDREPARTO: reparto de GeminisWin en el que está.';
comment on column public.reparto_gw_venta.nueva is 'Llegó por la lista de ventas nuevas del puente: puede proponerse para un reparto del ERP.';
create index if not exists reparto_gw_venta_nueva_fecha_idx on public.reparto_gw_venta (fecha) where nueva;
create index if not exists reparto_linea_venta_idx on public.reparto_linea (venta_tienda_codigo, venta_numero);

alter table public.reparto_gw_pasada add column if not exists tipo text not null default 'repartos';

-- Liquidaciones de la caja de administración.
create table if not exists public.reparto_liquidacion (
  id bigint generated always as identity primary key,
  repartidor_codigo text references public.repartidor(codigo),
  ruta_codigo text,
  recibido_por text not null,
  en timestamptz not null default now(),
  esperado numeric(14, 2) not null default 0,
  entregado numeric(14, 2) not null,
  facturas integer not null default 0,
  lineas jsonb not null default '[]'::jsonb,
  nota text,
  anulada_en timestamptz,
  anulada_por text
);
comment on table public.reparto_liquidacion is
  'Lo que un repartidor entrega en administración: facturas de contado cobradas, importe que tenía que entregar y lo que entregó. La hace la Caja de la app de reparto (fn_app_rep_liquidar).';
alter table public.reparto_liquidacion enable row level security;
do $$ begin
  if not exists (select 1 from pg_policy where polname = 'reparto_liquidacion_lee' and polrelid = 'public.reparto_liquidacion'::regclass) then
    create policy reparto_liquidacion_lee on public.reparto_liquidacion for select to authenticated using ((select public.fn_puede('/repartos')));
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_auditoria_reparto_liquidacion') then
    create trigger trg_auditoria_reparto_liquidacion after insert or update on public.reparto_liquidacion
      for each row execute function public.fn_auditoria_trigger();
  end if;
end $$;
revoke all on public.reparto_liquidacion from anon;

alter table public.reparto_linea
  add column if not exists liquidacion_id bigint references public.reparto_liquidacion(id),
  add column if not exists liquidado_en timestamptz;

insert into public.parametro (clave, valor, descripcion) values
  ('reparto.puente_gw_ventas', 'false'::jsonb,
   'Puente con GeminisWin: si es true, además de los repartos manda las ventas nuevas y vigila los cobros (para generar repartos en el ERP y para la Caja).'),
  ('reparto.erp_rutas', '[]'::jsonb,
   'Rutas cuyos repartos se generan y se cierran en el ERP (Ventas → Repartos → Generar repartos). Las demás siguen en GeminisWin.'),
  ('reparto.erp_tienda', '"47"'::jsonb, 'Tienda en la que se numeran los repartos generados en el ERP (a partir de 900001).'),
  ('reparto.erp_tiendas_venta', '["54"]'::jsonb,
   'Tiendas cuyas ventas a clientes con ruta se proponen marcadas para el reparto. Las de otras tiendas salen sin marcar.'),
  ('reparto.erp_dias', '7'::jsonb, 'Hasta cuántos días atrás se proponen ventas que no han ido en ningún reparto.')
on conflict (clave) do nothing;

------------------------------------------------------------------------------------------- puente: ventas
-- Recibe del puente ventas nuevas y ventas vigiladas, ya leídas de GeminisWin. Solo service_role (función
-- reparto-gw-ingesta, con la clave del puente).
create or replace function public.fn_reparto_gw_ventas(p jsonb)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_nuevas int := 0; v_camb int := 0; v_leidas int;
begin
  if jsonb_typeof(p -> 'ventas') <> 'array' then raise exception 'Falta la lista de ventas.' using errcode = '22023'; end if;
  v_leidas := jsonb_array_length(p -> 'ventas');
  with e as (
    select distinct on (btrim(x.o), x.v) x.* from jsonb_to_recordset(p -> 'ventas') as x(
      o text, v bigint, f date, h text, c text, s text, n text, fp smallint, ft text, t numeric, pg numeric, pd numeric, fpg date, fa text,
      op text, rv text, rc text, orr integer, ge boolean, er smallint, rp text, ct text, di text, cp text, po text, tf text, tm text, em text, nv boolean)
     where nullif(btrim(x.o), '') is not null and x.v is not null
     order by btrim(x.o), x.v),
  ins as (
    insert into reparto_gw_venta as g (venta_tienda_codigo, venta_numero, cliente_codigo, nombre_cliente, fecha, total, total_pagado, total_pendiente,
                                       forma_pago, forma_pago_texto, factura_numero, sucursal_codigo, hora, tienda_pedido, ruta_venta, ruta_cliente, orden_ruta,
                                       generico, gw_estado, gw_reparto, fecha_pago, contacto, direccion, codigo_postal, poblacion, telefono_fijo,
                                       telefono_movil, email, nueva)
    select btrim(o), v, nullif(btrim(c), ''), nullif(btrim(n), ''), f, t, pg, pd, fp, nullif(btrim(ft), ''), nullif(btrim(fa), ''),
           nullif(btrim(s), ''), nullif(btrim(h), ''), nullif(btrim(op), ''), nullif(btrim(rv), ''), nullif(btrim(rc), ''), orr, ge, er,
           nullif(btrim(rp), ''), fpg, nullif(btrim(ct), ''), nullif(btrim(di), ''), nullif(btrim(cp), ''), nullif(btrim(po), ''),
           nullif(btrim(tf), ''), nullif(btrim(tm), ''), nullif(btrim(em), ''), coalesce(nv, false)
      from e
    on conflict (venta_tienda_codigo, venta_numero) do update set
      cliente_codigo = coalesce(excluded.cliente_codigo, g.cliente_codigo), nombre_cliente = coalesce(excluded.nombre_cliente, g.nombre_cliente),
      fecha = coalesce(excluded.fecha, g.fecha), total = coalesce(excluded.total, g.total), total_pagado = coalesce(excluded.total_pagado, g.total_pagado),
      total_pendiente = coalesce(excluded.total_pendiente, g.total_pendiente), forma_pago = coalesce(excluded.forma_pago, g.forma_pago),
      forma_pago_texto = coalesce(excluded.forma_pago_texto, g.forma_pago_texto), factura_numero = coalesce(excluded.factura_numero, g.factura_numero),
      sucursal_codigo = excluded.sucursal_codigo, hora = coalesce(excluded.hora, g.hora), tienda_pedido = excluded.tienda_pedido,
      ruta_venta = excluded.ruta_venta, ruta_cliente = coalesce(excluded.ruta_cliente, g.ruta_cliente), orden_ruta = coalesce(excluded.orden_ruta, g.orden_ruta),
      generico = coalesce(excluded.generico, g.generico), gw_estado = excluded.gw_estado, gw_reparto = excluded.gw_reparto,
      fecha_pago = excluded.fecha_pago, contacto = coalesce(excluded.contacto, g.contacto), direccion = coalesce(excluded.direccion, g.direccion),
      codigo_postal = coalesce(excluded.codigo_postal, g.codigo_postal), poblacion = coalesce(excluded.poblacion, g.poblacion),
      telefono_fijo = coalesce(excluded.telefono_fijo, g.telefono_fijo), telefono_movil = coalesce(excluded.telefono_movil, g.telefono_movil),
      email = coalesce(excluded.email, g.email), nueva = g.nueva or excluded.nueva, actualizado_en = now()
    where (g.total, g.total_pagado, g.total_pendiente, g.factura_numero, g.gw_estado, g.gw_reparto, g.fecha_pago, g.ruta_venta, g.ruta_cliente,
           g.direccion, g.nueva, g.sucursal_codigo, g.tienda_pedido, g.nombre_cliente, g.generico, g.contacto, g.telefono_movil)
          is distinct from
          (coalesce(excluded.total, g.total), coalesce(excluded.total_pagado, g.total_pagado), coalesce(excluded.total_pendiente, g.total_pendiente),
           coalesce(excluded.factura_numero, g.factura_numero), excluded.gw_estado, excluded.gw_reparto, excluded.fecha_pago, excluded.ruta_venta,
           coalesce(excluded.ruta_cliente, g.ruta_cliente), coalesce(excluded.direccion, g.direccion), g.nueva or excluded.nueva,
           excluded.sucursal_codigo, excluded.tienda_pedido, coalesce(excluded.nombre_cliente, g.nombre_cliente), coalesce(excluded.generico, g.generico),
           coalesce(excluded.contacto, g.contacto), coalesce(excluded.telefono_movil, g.telefono_movil))
    returning (xmax = 0) as alta)
  select count(*) filter (where alta), count(*) filter (where not alta) into v_nuevas, v_camb from ins;

  insert into reparto_gw_pasada (tipo, repartos, lineas_nuevas, lineas_cambiadas, lineas_quitadas)
  values ('ventas', v_leidas, v_nuevas, v_camb, 0);
  return jsonb_build_object('ok', true, 'leidas', v_leidas, 'nuevas', v_nuevas, 'cambiadas', v_camb);
end $$;
revoke all on function public.fn_reparto_gw_ventas(jsonb) from public, anon, authenticated;
grant execute on function public.fn_reparto_gw_ventas(jsonb) to service_role;

-- Ventas que el puente tiene que volver a leer en cada pasada: las que se pueden proponer para un reparto (para
-- saber si se facturan o GeminisWin las mete en un reparto suyo) y las entregadas de contado que siguen sin
-- cobrar o están liquidadas aquí pero no apuntadas en GeminisWin (para la Caja). Como mucho 5.000.
create or replace function public.fn_reparto_gw_vigilar()
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select coalesce(jsonb_agg(jsonb_build_array(x.vt, x.vn)), '[]'::jsonb)
    from (
      select vt, vn from (
        select g.venta_tienda_codigo vt, g.venta_numero vn, 1 prio, g.fecha
          from reparto_gw_venta g left join cliente c on c.codigo = g.cliente_codigo
         where g.nueva and g.fecha >= current_date - 12 and coalesce(g.gw_estado, 0) not in (4, 5, 6, 8, 10)
           and coalesce(nullif(g.ruta_venta, ''), nullif(g.ruta_cliente, ''), c.ruta_codigo) is not null
        union all
        select l.venta_tienda_codigo, l.venta_numero, 0, r.fecha
          from reparto_linea l
          join reparto r on r.tienda_terminal_codigo = l.tienda_terminal_codigo and r.numero = l.numero and r.origen = 'geminiswin'
          join reparto_gw_venta g on g.venta_tienda_codigo = l.venta_tienda_codigo and g.venta_numero = l.venta_numero
         where coalesce(g.total_pendiente, g.total - coalesce(g.total_pagado, 0)) > 0.005
           and ((l.estado in ('entregado', 'liquidado') and r.fecha >= current_date - 15)
                or (l.liquidacion_id is not null and r.fecha >= current_date - 45))
      ) u
      group by vt, vn order by min(prio), max(fecha) desc limit 5000) x
$$;
revoke all on function public.fn_reparto_gw_vigilar() from public, anon, authenticated;
grant execute on function public.fn_reparto_gw_vigilar() to service_role;

------------------------------------------------------------------------------------- generar en el ERP
-- Siguiente día de reparto: mañana, y el viernes (o el fin de semana) el lunes.
create or replace function reparto_privado.erp_siguiente_dia()
returns date language sql stable set search_path to 'public', 'pg_temp' as $$
  select case extract(isodow from fn_app_rep_hoy())::int when 5 then fn_app_rep_hoy() + 3 when 6 then fn_app_rep_hoy() + 2 else fn_app_rep_hoy() + 1 end
$$;

-- Ventas que se pueden meter en un reparto del día p_fecha, con su ruta. «viene» = ya fue en un reparto y no se
-- entregó (o sigue pendiente en el reparto anterior, que se cerrará al generar). «en_gw» = GeminisWin la tiene en
-- un reparto suyo abierto. Para las rutas que aún se llevan en GeminisWin (comparar), los repartos abiertos de
-- GeminisWin no cuentan: se ve lo que el ERP habría propuesto.
create or replace function reparto_privado.erp_candidatas(p_fecha date)
returns table (vt text, vn bigint, ruta text, de_ruta text, principal boolean, viene boolean, ant_tienda text, ant_numero bigint, antes text, en_gw text)
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  with par as (
    select coalesce((select valor from parametro where clave = 'reparto.erp_rutas'), '[]'::jsonb) rutas_erp,
           coalesce((select valor from parametro where clave = 'reparto.erp_tiendas_venta'), '["54"]'::jsonb) tiendas,
           coalesce((select (valor #>> '{}')::int from parametro where clave = 'reparto.erp_dias'), 7) dias)
  select g.venta_tienda_codigo, g.venta_numero, k.ruta, k.de,
         a.vt is not null or par.tiendas ? g.venta_tienda_codigo,
         a.vt is not null, a.tienda, a.numero, a.obs,
         case when g.gw_estado in (2, 3) then coalesce(g.gw_reparto, 'sí') end
    from reparto_gw_venta g
    cross join par
    left join cliente c on c.codigo = g.cliente_codigo
    cross join lateral (
      select coalesce(nullif(g.ruta_venta, ''), nullif(g.ruta_cliente, ''), c.ruta_codigo) ruta,
             case when nullif(g.ruta_venta, '') is not null then 'venta' else 'ficha' end de) k
    left join lateral (
      select l.tienda_terminal_codigo tienda, l.numero, l.estado_observaciones obs, l.venta_tienda_codigo vt
        from reparto_linea l join reparto r on r.tienda_terminal_codigo = l.tienda_terminal_codigo and r.numero = l.numero
       where l.venta_tienda_codigo = g.venta_tienda_codigo and l.venta_numero = g.venta_numero
         and (l.estado = 'no_entregado' or (l.estado in ('pendiente', 'viene_anterior') and r.generado_erp and r.estado = 2 and r.fecha < p_fecha))
       order by r.fecha desc, r.numero desc limit 1) a on true
   where k.ruta is not null
     and coalesce(g.total, 0) > 0
     and not coalesce(g.generico, c.es_generico, false)
     and (g.fecha >= p_fecha - par.dias or (a.vt is not null and g.fecha >= p_fecha - 45))
     and (g.nueva or a.vt is not null)
     and coalesce(g.gw_estado, 0) not in (4, 5, 6, 8, 10)
     and not exists (
       select 1 from reparto_linea l join reparto r on r.tienda_terminal_codigo = l.tienda_terminal_codigo and r.numero = l.numero
        where l.venta_tienda_codigo = g.venta_tienda_codigo and l.venta_numero = g.venta_numero
          and (l.estado in ('entregado', 'liquidado', 'devuelto')
               or (l.estado in ('pendiente', 'viene_anterior')
                   and not (r.generado_erp and r.estado = 2 and r.fecha < p_fecha)
                   and not (r.origen = 'geminiswin' and not r.generado_erp and r.estado = 2 and not (par.rutas_erp ? k.ruta)))))
$$;

-- Cierra un reparto generado en el ERP: lo que sigue sin marcar pasa a «no entregado» y volverá a proponerse.
create or replace function reparto_privado.erp_cerrar(p_tienda text, p_numero bigint)
returns integer language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_n int;
begin
  update reparto_linea set estado = 'no_entregado', estado_observaciones = coalesce(estado_observaciones || ' · ', '') || 'Sin marcar al cerrar', actualizado_en = now()
   where tienda_terminal_codigo = p_tienda and numero = p_numero and estado in ('pendiente', 'viene_anterior');
  get diagnostics v_n = row_count;
  update reparto r set estado = 4, fecha_hora_reparto = now(), actualizado_en = now(),
         total_ventas = (select coalesce(sum(g.total), 0) from reparto_linea l join reparto_gw_venta g on g.venta_tienda_codigo = l.venta_tienda_codigo and g.venta_numero = l.venta_numero
                          where l.tienda_terminal_codigo = p_tienda and l.numero = p_numero and l.estado <> 'anulado'),
         total_pagado = (select coalesce(sum(g.total_pagado), 0) from reparto_linea l join reparto_gw_venta g on g.venta_tienda_codigo = l.venta_tienda_codigo and g.venta_numero = l.venta_numero
                          where l.tienda_terminal_codigo = p_tienda and l.numero = p_numero and l.estado <> 'anulado')
   where r.tienda_terminal_codigo = p_tienda and r.numero = p_numero and r.generado_erp and r.estado = 2;
  return v_n;
end $$;
revoke all on function reparto_privado.erp_candidatas(date) from public, anon, authenticated;
revoke all on function reparto_privado.erp_cerrar(text, bigint) from public, anon, authenticated;

-- Pantalla «Generar repartos»: por ruta, la propuesta, el repartidor de siempre, el reparto ya generado de ese
-- día y, para comparar, el reparto abierto de GeminisWin.
create or replace function public.fn_reparto_erp_panel(p_fecha date default null)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare v_fecha date := coalesce(p_fecha, reparto_privado.erp_siguiente_dia());
  v_rutas jsonb := coalesce((select valor from parametro where clave = 'reparto.erp_rutas'), '[]'::jsonb);
  v_puente jsonb := coalesce((select valor from parametro where clave = 'reparto.puente_gw_rutas'), '[]'::jsonb);
begin
  if not fn_puede('/repartos') then
    raise exception 'No tienes permiso de Repartos. Pídelo a un administrador (Archivo → Usuarios y permisos).' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'fecha', v_fecha, 'hoy', fn_app_rep_hoy(), 'rutas_erp', v_rutas,
    'tienda', coalesce((select valor #>> '{}' from parametro where clave = 'reparto.erp_tienda'), '47'),
    'tiendas_venta', coalesce((select valor from parametro where clave = 'reparto.erp_tiendas_venta'), '["54"]'::jsonb),
    'puente_ventas', coalesce((select valor from parametro where clave = 'reparto.puente_gw_ventas'), 'false'::jsonb),
    'ultima_lectura', (select max(en) from reparto_gw_pasada where tipo = 'ventas'),
    'repartidores', coalesce((
      select jsonb_agg(jsonb_build_object('codigo', d.codigo, 'nombre', coalesce(nullif(d.nombre_corto, ''), d.nombre)) order by coalesce(nullif(d.nombre_corto, ''), d.nombre))
        from repartidor d join repartidor_pin p on p.repartidor_codigo = d.codigo
       where not d.deshabilitado and not p.solo_caja and not p.prueba and d.codigo not in ('OFI', 'PAG', 'PED')), '[]'::jsonb),
    'rutas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'ruta', rr.codigo, 'nombre', rr.descripcion, 'erp', v_rutas ? rr.codigo,
               'repartidor', dflt.rep,
               'abierto', (select jsonb_build_object('tienda', a.tienda_terminal_codigo, 'numero', a.numero, 'repartidor', a.repartidor_codigo,
                                                     'lineas', (select count(*) from reparto_linea l where l.tienda_terminal_codigo = a.tienda_terminal_codigo and l.numero = a.numero and l.estado <> 'anulado'))
                             from reparto a where a.generado_erp and a.estado = 2 and a.ruta_codigo = rr.codigo and a.fecha = v_fecha
                            order by a.numero desc limit 1),
               'anteriores', (select count(*) from reparto a where a.generado_erp and a.estado = 2 and a.ruta_codigo = rr.codigo and a.fecha < v_fecha),
               'propuesta', coalesce((
                  select jsonb_agg(jsonb_build_object(
                           'vt', k.vt, 'vn', k.vn, 'fecha', g.fecha, 'hora', g.hora, 'cliente_codigo', g.cliente_codigo,
                           'cliente', coalesce(g.nombre_cliente, c.nombre, 'Sin nombre'), 'poblacion', coalesce(g.poblacion, c.poblacion),
                           'total', g.total, 'pendiente', g.total_pendiente, 'forma_pago', g.forma_pago_texto, 'factura', g.factura_numero,
                           'principal', k.principal, 'viene', k.viene, 'antes', k.antes, 'en_gw', k.en_gw, 'de_ruta', k.de_ruta)
                         order by k.viene desc, k.principal desc, g.fecha, g.venta_numero)
                    from reparto_privado.erp_candidatas(v_fecha) k
                    join reparto_gw_venta g on g.venta_tienda_codigo = k.vt and g.venta_numero = k.vn
                    left join cliente c on c.codigo = g.cliente_codigo
                   where k.ruta = rr.codigo), '[]'::jsonb),
               'gw', (select jsonb_build_object('tienda', b.tienda_terminal_codigo, 'numero', b.numero, 'fecha', b.fecha,
                                                'ventas', coalesce((select jsonb_agg(jsonb_build_array(l.venta_tienda_codigo, l.venta_numero))
                                                                      from reparto_linea l where l.tienda_terminal_codigo = b.tienda_terminal_codigo
                                                                       and l.numero = b.numero and l.estado <> 'anulado'), '[]'::jsonb))
                        from reparto b where b.origen = 'geminiswin' and not b.generado_erp and b.estado = 2 and b.ruta_codigo = rr.codigo
                       order by b.numero desc limit 1))
             order by rr.codigo)
        from ruta_reparto rr
        cross join lateral (
          select coalesce(
                   (select a.repartidor_codigo from reparto a where a.generado_erp and a.estado = 2 and a.ruta_codigo = rr.codigo and a.fecha = v_fecha
                     order by a.numero desc limit 1),
                   (select a.repartidor_codigo from reparto a where a.ruta_codigo = rr.codigo and a.repartidor_codigo is not null
                       and a.repartidor_codigo not in ('OFI', 'PAG', 'PED')
                     order by a.fecha desc, a.numero desc limit 1)) rep) dflt
       where not rr.deshabilitada and (v_rutas ? rr.codigo or v_puente ? rr.codigo)), '[]'::jsonb));
end $$;
revoke all on function public.fn_reparto_erp_panel(date) from public, anon;
grant execute on function public.fn_reparto_erp_panel(date) to authenticated;

-- Genera (o completa) el reparto de una ruta para un día. Antes cierra los repartos anteriores de esa ruta que
-- sigan abiertos. p_ventas: [{"vt": "54", "vn": 2468816}, …] (lo marcado en la pantalla).
create or replace function public.fn_reparto_erp_generar(p_ruta text, p_fecha date, p_repartidor text, p_ventas jsonb)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_rutas jsonb := coalesce((select valor from parametro where clave = 'reparto.erp_rutas'), '[]'::jsonb);
  v_tienda text := coalesce((select valor #>> '{}' from parametro where clave = 'reparto.erp_tienda'), '47');
  s reparto; a record; x record; v_cerrados jsonb := '[]'::jsonb; v_nuevas int := 0; v_saltadas jsonb := '[]'::jsonb;
begin
  if not fn_puede('/repartos') then
    raise exception 'No tienes permiso de Repartos. Pídelo a un administrador (Archivo → Usuarios y permisos).' using errcode = '42501';
  end if;
  if not (v_rutas ? p_ruta) then
    raise exception 'La ruta % todavía se reparte desde GeminisWin. Para generarla aquí, pulsa antes «Pasar al ERP» en esa ruta.', p_ruta;
  end if;
  if p_fecha is null or p_fecha < fn_app_rep_hoy() then raise exception 'Elige el día del reparto: hoy o un día siguiente.'; end if;
  if p_repartidor is null or not exists (select 1 from repartidor where codigo = p_repartidor and not deshabilitado) then
    raise exception 'Elige el repartidor de la ruta %.', p_ruta;
  end if;
  if jsonb_typeof(p_ventas) <> 'array' then raise exception 'Marca las ventas que van en el reparto.'; end if;
  perform pg_advisory_xact_lock(hashtext('reparto_erp_' || p_ruta));

  -- 1. Cerrar los anteriores de esta ruta que sigan abiertos.
  for a in select tienda_terminal_codigo t, numero n from reparto where generado_erp and estado = 2 and ruta_codigo = p_ruta and fecha < p_fecha for update loop
    perform reparto_privado.erp_cerrar(a.t, a.n);
    v_cerrados := v_cerrados || to_jsonb(a.t || '-' || a.n);
  end loop;

  -- 2. El reparto de ese día: el que ya hay o uno nuevo.
  select * into s from reparto where generado_erp and estado = 2 and ruta_codigo = p_ruta and fecha = p_fecha order by numero desc limit 1 for update;
  if not found then
    insert into reparto (tienda_terminal_codigo, numero, ruta_codigo, fecha, repartidor_codigo, estado, origen, generado_erp)
    values (v_tienda, 900000 + fn_siguiente_numero(v_tienda, 'reparto', ''), p_ruta, p_fecha, p_repartidor, 2, 'geminiswin', true)
    returning * into s;
  elsif s.repartidor_codigo is distinct from p_repartidor then
    update reparto set repartidor_codigo = p_repartidor, actualizado_en = now() where tienda_terminal_codigo = s.tienda_terminal_codigo and numero = s.numero;
  end if;

  -- 3. Las ventas marcadas, solo si siguen libres.
  for x in
    select j.vt, j.vn, k.ruta, k.viene, k.ant_tienda, k.ant_numero, k.antes, k.en_gw, g.contacto, g.direccion, g.codigo_postal, g.poblacion,
           g.telefono_fijo, g.telefono_movil, g.email, g.nombre_cliente, c.contacto c_contacto, c.direccion c_direccion, c.codigo_postal c_cp,
           c.poblacion c_poblacion, c.telefono_fijo c_fijo, c.telefono_movil c_movil, c.email c_email, c.zona_territorial_codigo c_zona
      from (select distinct btrim(e ->> 'vt') vt, (e ->> 'vn')::bigint vn from jsonb_array_elements(p_ventas) e) j
      left join reparto_privado.erp_candidatas(p_fecha) k on k.vt = j.vt and k.vn = j.vn
      left join reparto_gw_venta g on g.venta_tienda_codigo = j.vt and g.venta_numero = j.vn
      left join cliente c on c.codigo = g.cliente_codigo
  loop
    if x.ruta is null or x.en_gw is not null then
      v_saltadas := v_saltadas || jsonb_build_object('vt', x.vt, 'vn', x.vn,
        'motivo', case when x.en_gw is not null then 'GeminisWin la tiene en su reparto ' || x.en_gw else 'ya va en otro reparto o ya se entregó' end);
      continue;
    end if;
    insert into reparto_linea (tienda_terminal_codigo, numero, venta_tienda_codigo, venta_numero, zona_territorial_codigo, contacto, direccion,
                               codigo_postal, poblacion, telefono_fijo, telefono_movil, email, estado,
                               reparto_anterior_tienda_codigo, reparto_anterior_numero, estado_observaciones)
    values (s.tienda_terminal_codigo, s.numero, x.vt, x.vn, x.c_zona,
            coalesce(x.contacto, x.c_contacto, x.nombre_cliente), coalesce(x.direccion, x.c_direccion), coalesce(x.codigo_postal, x.c_cp),
            coalesce(x.poblacion, x.c_poblacion), coalesce(x.telefono_fijo, x.c_fijo), coalesce(x.telefono_movil, x.c_movil), coalesce(x.email, x.c_email),
            case when x.viene then 'viene_anterior' else 'pendiente' end,
            case when x.viene then x.ant_tienda end, case when x.viene then x.ant_numero end,
            case when x.viene then 'Anterior: ' || coalesce(nullif(x.antes, ''), 'no entregado') end)
    on conflict (tienda_terminal_codigo, numero, venta_tienda_codigo, venta_numero) do update
      set estado = excluded.estado, reparto_anterior_tienda_codigo = excluded.reparto_anterior_tienda_codigo,
          reparto_anterior_numero = excluded.reparto_anterior_numero, estado_observaciones = excluded.estado_observaciones, actualizado_en = now()
      where reparto_linea.estado = 'anulado';
    v_nuevas := v_nuevas + 1;
  end loop;

  return jsonb_build_object('ok', true, 'tienda', s.tienda_terminal_codigo, 'numero', s.numero, 'fecha', s.fecha, 'nuevas', v_nuevas,
                            'saltadas', v_saltadas, 'cerrados', v_cerrados);
end $$;
revoke all on function public.fn_reparto_erp_generar(text, date, text, jsonb) from public, anon;
grant execute on function public.fn_reparto_erp_generar(text, date, text, jsonb) to authenticated;

-- Cerrar a mano un reparto generado en el ERP (lo normal es que se cierre solo al generar el siguiente).
create or replace function public.fn_reparto_erp_cerrar(p_tienda text, p_numero bigint)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_n int;
begin
  if not fn_puede('/repartos') then
    raise exception 'No tienes permiso de Repartos. Pídelo a un administrador (Archivo → Usuarios y permisos).' using errcode = '42501';
  end if;
  if not exists (select 1 from reparto where tienda_terminal_codigo = p_tienda and numero = p_numero and generado_erp and estado = 2) then
    raise exception 'Ese reparto no está abierto o no se generó en el ERP (los de GeminisWin se cierran en GeminisWin).';
  end if;
  v_n := reparto_privado.erp_cerrar(p_tienda, p_numero);
  return jsonb_build_object('ok', true, 'sin_marcar', v_n);
end $$;
revoke all on function public.fn_reparto_erp_cerrar(text, bigint) from public, anon;
grant execute on function public.fn_reparto_erp_cerrar(text, bigint) to authenticated;

-- Quitar una venta de un reparto del ERP antes de que el repartidor la toque: vuelve a la propuesta.
create or replace function public.fn_reparto_erp_quitar(p_tienda text, p_numero bigint, p_vt text, p_vn bigint)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare l reparto_linea;
begin
  if not fn_puede('/repartos') then
    raise exception 'No tienes permiso de Repartos. Pídelo a un administrador (Archivo → Usuarios y permisos).' using errcode = '42501';
  end if;
  select l2.* into l from reparto_linea l2 join reparto r on r.tienda_terminal_codigo = l2.tienda_terminal_codigo and r.numero = l2.numero
   where l2.tienda_terminal_codigo = p_tienda and l2.numero = p_numero and l2.venta_tienda_codigo = p_vt and l2.venta_numero = p_vn
     and r.generado_erp and r.estado = 2 for update of l2;
  if not found then raise exception 'Esa venta no está en un reparto abierto del ERP.'; end if;
  if l.estado not in ('pendiente', 'viene_anterior') or l.entregado_en is not null or l.intento1_en is not null then
    raise exception 'El repartidor ya ha marcado esa venta. Si hay que cambiarla, que use «Deshacer» en la app o pásala a otra ruta desde la app.';
  end if;
  update reparto_linea set estado = 'anulado', estado_observaciones = 'Quitada en la oficina', actualizado_en = now()
   where tienda_terminal_codigo = p_tienda and numero = p_numero and venta_tienda_codigo = p_vt and venta_numero = p_vn;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.fn_reparto_erp_quitar(text, bigint, text, bigint) from public, anon;
grant execute on function public.fn_reparto_erp_quitar(text, bigint, text, bigint) to authenticated;

-- Pasar una ruta al ERP o devolverla a GeminisWin.
create or replace function public.fn_reparto_erp_ruta(p_ruta text, p_erp boolean)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v jsonb := coalesce((select valor from parametro where clave = 'reparto.erp_rutas'), '[]'::jsonb);
begin
  if not fn_puede('/repartos') then
    raise exception 'No tienes permiso de Repartos. Pídelo a un administrador (Archivo → Usuarios y permisos).' using errcode = '42501';
  end if;
  if not exists (select 1 from ruta_reparto where codigo = p_ruta) then raise exception 'No existe la ruta %.', p_ruta; end if;
  if not p_erp and exists (select 1 from reparto where generado_erp and estado = 2 and ruta_codigo = p_ruta) then
    raise exception 'La ruta % tiene un reparto abierto generado en el ERP. Ciérralo antes de devolverla a GeminisWin.', p_ruta;
  end if;
  v := (select coalesce(jsonb_agg(to_jsonb(r) order by r), '[]'::jsonb)
          from (select distinct e #>> '{}' r from jsonb_array_elements(v || case when p_erp then jsonb_build_array(p_ruta) else '[]'::jsonb end) e) z
         where p_erp or r <> p_ruta);
  update parametro set valor = v, actualizado_en = now(), actualizado_por = auth.uid() where clave = 'reparto.erp_rutas';
  return jsonb_build_object('ok', true, 'rutas_erp', v);
end $$;
revoke all on function public.fn_reparto_erp_ruta(text, boolean) from public, anon;
grant execute on function public.fn_reparto_erp_ruta(text, boolean) to authenticated;

--------------------------------------------------------------------------------- caja: liquidar en el ERP
-- La Caja marca las facturas que le entrega un repartidor y lo que entrega. Solo usuarios de caja o supervisores.
create or replace function public.fn_app_rep_liquidar(p_token uuid, p_lineas jsonb, p_entregado numeric, p_nota text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_rep text := reparto_privado.sesion(p_token); v_ok boolean; x record; v_esp numeric := 0; v_n int := 0; v_id bigint;
  v_lin jsonb := '[]'::jsonb; v_repartidor text; v_ruta text; v_imp numeric; v_en timestamptz := now();
begin
  select coalesce(supervisor, false) or coalesce(solo_caja, false) into v_ok from repartidor_pin where repartidor_codigo = v_rep;
  if not coalesce(v_ok, false) then raise exception 'Solo la caja de administración puede liquidar.' using errcode = '42501'; end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then raise exception 'Toca las facturas que te entrega el repartidor.'; end if;
  if p_entregado is null or p_entregado < 0 then raise exception 'Escribe en «Te entrega» el dinero que te da el repartidor.'; end if;

  insert into reparto_liquidacion (recibido_por, entregado, nota, en)
  values (v_rep, round(p_entregado, 2), nullif(btrim(left(p_nota, 500)), ''), v_en) returning id into v_id;

  for x in
    select l.tienda_terminal_codigo rt, l.numero rn, l.venta_tienda_codigo vt, l.venta_numero vn, l.estado, l.motivo_no_cobro,
           r.repartidor_codigo rrep, r.ruta_codigo rruta, g.total, g.total_pagado, g.factura_numero, g.nombre_cliente
      from (select distinct btrim(e ->> 'rt') rt, (e ->> 'rn')::bigint rn, btrim(e ->> 'vt') vt, (e ->> 'vn')::bigint vn from jsonb_array_elements(p_lineas) e) j
      join reparto_linea l on l.tienda_terminal_codigo = j.rt and l.numero = j.rn and l.venta_tienda_codigo = j.vt and l.venta_numero = j.vn
      join reparto r on r.tienda_terminal_codigo = l.tienda_terminal_codigo and r.numero = l.numero
      left join reparto_gw_venta g on g.venta_tienda_codigo = l.venta_tienda_codigo and g.venta_numero = l.venta_numero
       for update of l
  loop
    if x.estado <> 'entregado' then
      raise exception 'La factura % ya no está pendiente de liquidar (está «%»). Vuelve a cargar la lista.', coalesce(x.factura_numero, x.vt || '/' || x.vn), x.estado;
    end if;
    if x.motivo_no_cobro is not null then
      raise exception 'La factura % se entregó sin cobrar: la cobra administración, no se liquida aquí.', coalesce(x.factura_numero, x.vt || '/' || x.vn);
    end if;
    v_imp := round(greatest(coalesce(x.total, 0) - coalesce(x.total_pagado, 0), 0), 2);
    v_esp := v_esp + v_imp; v_n := v_n + 1;
    v_repartidor := coalesce(v_repartidor, x.rrep); v_ruta := coalesce(v_ruta, x.rruta);
    update reparto_linea set estado = 'liquidado', liquidacion_id = v_id, liquidado_en = v_en, actualizado_en = now()
     where tienda_terminal_codigo = x.rt and numero = x.rn and venta_tienda_codigo = x.vt and venta_numero = x.vn;
    v_lin := v_lin || jsonb_build_object('rt', x.rt, 'rn', x.rn, 'vt', x.vt, 'vn', x.vn, 'factura', x.factura_numero, 'cliente', x.nombre_cliente, 'importe', v_imp);
  end loop;
  if v_n <> (select count(distinct (e ->> 'rt', e ->> 'rn', e ->> 'vt', e ->> 'vn')) from jsonb_array_elements(p_lineas) e) then
    raise exception 'Alguna de esas facturas ya no está en el reparto. Vuelve a cargar la lista.';
  end if;
  update reparto_liquidacion set esperado = v_esp, facturas = v_n, lineas = v_lin, repartidor_codigo = v_repartidor, ruta_codigo = v_ruta where id = v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'en', v_en, 'esperado', v_esp, 'entregado', round(p_entregado, 2), 'facturas', v_n);
end $$;
revoke all on function public.fn_app_rep_liquidar(uuid, jsonb, numeric, text) from public;
grant execute on function public.fn_app_rep_liquidar(uuid, jsonb, numeric, text) to anon, authenticated;

-- Deshacer una liquidación hecha por error (solo las facturas que sigan liquidadas por ella).
create or replace function public.fn_app_rep_liquidacion_anular(p_token uuid, p_id bigint)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_rep text := reparto_privado.sesion(p_token); v_ok boolean; v_n int;
begin
  select coalesce(supervisor, false) or coalesce(solo_caja, false) into v_ok from repartidor_pin where repartidor_codigo = v_rep;
  if not coalesce(v_ok, false) then raise exception 'Solo la caja de administración puede deshacer una liquidación.' using errcode = '42501'; end if;
  if not exists (select 1 from reparto_liquidacion where id = p_id and anulada_en is null and en > now() - interval '7 days') then
    raise exception 'Esa liquidación no existe, ya está deshecha o tiene más de 7 días (pídeselo a la oficina).';
  end if;
  update reparto_linea set estado = 'entregado', liquidacion_id = null, liquidado_en = null, actualizado_en = now()
   where liquidacion_id = p_id and estado = 'liquidado';
  get diagnostics v_n = row_count;
  update reparto_liquidacion set anulada_en = now(), anulada_por = v_rep where id = p_id;
  return jsonb_build_object('ok', true, 'facturas', v_n);
end $$;
revoke all on function public.fn_app_rep_liquidacion_anular(uuid, bigint) from public;
grant execute on function public.fn_app_rep_liquidacion_anular(uuid, bigint) to anon, authenticated;

-- Para la Caja: sus liquidaciones de los últimos días (para volver a imprimir o deshacer) y las facturas que ya
-- liquidó aquí pero que en GeminisWin siguen sin cobrar («falta apuntar en GeminisWin»).
create or replace function public.fn_app_rep_liquidaciones(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare v_rep text := reparto_privado.sesion(p_token); v_ok boolean;
begin
  select coalesce(supervisor, false) or coalesce(solo_caja, false) into v_ok from repartidor_pin where repartidor_codigo = v_rep;
  if not coalesce(v_ok, false) then raise exception 'Solo la caja de administración puede ver las liquidaciones.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'liquidaciones', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'en', q.en, 'esperado', q.esperado, 'entregado', q.entregado, 'facturas', q.facturas,
                                          'lineas', q.lineas, 'nota', q.nota, 'anulada', q.anulada_en is not null, 'ruta', q.ruta_codigo,
                                          'ruta_nombre', coalesce(rr.descripcion, q.ruta_codigo),
                                          'repartidor', coalesce(nullif(d.nombre_corto, ''), d.nombre, q.repartidor_codigo))
                       order by q.en desc)
        from reparto_liquidacion q
        left join repartidor d on d.codigo = q.repartidor_codigo
        left join ruta_reparto rr on rr.codigo = q.ruta_codigo
       where q.en > now() - interval '7 days'), '[]'::jsonb),
    'apuntar', coalesce((
      select jsonb_agg(jsonb_build_object('vt', l.venta_tienda_codigo, 'vn', l.venta_numero, 'factura', g.factura_numero, 'cliente', g.nombre_cliente,
                                          'importe', round(coalesce(g.total_pendiente, g.total - coalesce(g.total_pagado, 0)), 2),
                                          'liquidacion', l.liquidacion_id, 'liquidado_en', l.liquidado_en)
                       order by l.liquidado_en, l.venta_tienda_codigo, l.venta_numero)
        from reparto_linea l
        join reparto_gw_venta g on g.venta_tienda_codigo = l.venta_tienda_codigo and g.venta_numero = l.venta_numero
       where l.liquidacion_id is not null and l.estado = 'liquidado' and l.liquidado_en > now() - interval '45 days'
         and coalesce(g.total_pendiente, g.total - coalesce(g.total_pagado, 0)) > 0.005), '[]'::jsonb));
end $$;
revoke all on function public.fn_app_rep_liquidaciones(uuid) from public;
grant execute on function public.fn_app_rep_liquidaciones(uuid) to anon, authenticated;

------------------------------------------------------------------------- cambios en funciones que ya había
-- Se hacen sustituyendo trozos del texto de la función que hay en la base de datos, para no repetir aquí
-- funciones enteras. Cada sustitución comprueba que el trozo existe (o que ya está hecha) y, si no, se para.
do $$
declare v text; f text;
  procedure_cambios constant jsonb := jsonb_build_array(
    -- Guarda: los repartos generados en el ERP se cierran y se cambian aquí.
    jsonb_build_array('public.fn_reparto_gw_guarda()',
      $a$if old.origen = 'geminiswin' and (new.estado$a$,
      $a$if old.origen = 'geminiswin' and not old.generado_erp and (new.estado$a$),
    jsonb_build_array('public.fn_reparto_gw_guarda()',
      $a$r.numero = new.numero and r.origen = 'geminiswin') then$a$,
      $a$r.numero = new.numero and r.origen = 'geminiswin' and not r.generado_erp) then$a$),
    -- Puente: no crear repartos nuevos de las rutas que ya se llevan en el ERP (los que ya estaban se terminan).
    jsonb_build_array('public.fn_reparto_gw_ingesta(jsonb)',
      $a$if v_ruta is null or not (v_rutas ? v_ruta) then continue; end if;$a$,
      $a$if v_ruta is null or not (v_rutas ? v_ruta) then continue; end if;
    if coalesce((select valor from parametro where clave = 'reparto.erp_rutas'), '[]'::jsonb) ? v_ruta
       and not exists (select 1 from reparto where tienda_terminal_codigo = v_ofi and numero = v_num) then continue; end if;$a$),
    jsonb_build_array('public.fn_reparto_gw_ingesta(jsonb)',
      $a$if found and v_origen <> 'geminiswin' then$a$,
      $a$if found and (v_origen <> 'geminiswin' or exists (select 1 from reparto where tienda_terminal_codigo = v_ofi and numero = v_num and generado_erp)) then$a$),
    -- Puente: una factura liquidada en la Caja del ERP no vuelve a «entregada» porque GeminisWin aún diga 4.
    jsonb_build_array('public.fn_reparto_gw_ingesta(jsonb)',
      $a$when x.estado = 'liquidado' and v_estado = 'entregado' then 'entregado'$a$,
      $a$when x.estado = 'liquidado' and v_estado = 'entregado' and x.liquidacion_id is null then 'entregado'$a$),
    -- Partes para GeminisWin: solo de los repartos que se llevan allí.
    jsonb_build_array('public.fn_reparto_gw_partes()',
      $a$where r.origen = 'geminiswin' and r.estado = 2$a$,
      $a$where r.origen = 'geminiswin' and not r.generado_erp and r.estado = 2$a$),
    -- Caja: las rutas de días anteriores siguen saliendo mientras tengan cobros sin liquidar (el repartidor
    -- puede entregar el dinero al día siguiente); y cada factura lleva su reparto para poder liquidarla.
    jsonb_build_array('public.fn_app_rep_por_cobrar(uuid)',
      $a$'vt', l.venta_tienda_codigo, 'vn', l.venta_numero,$a$,
      $a$'vt', l.venta_tienda_codigo, 'vn', l.venta_numero, 'rt', l.tienda_terminal_codigo, 'rn', l.numero,$a$),
    jsonb_build_array('public.fn_app_rep_por_cobrar(uuid)',
      $a$where (r.estado = 2 or (r.fecha = v_hoy and not exists (select 1 from reparto n where n.ruta_codigo = r.ruta_codigo and n.numero > r.numero))) and not r.oculto$a$,
      $a$where (r.estado = 2 or (r.fecha = v_hoy and not exists (select 1 from reparto n where n.ruta_codigo = r.ruta_codigo and n.numero > r.numero))
              or (coalesce(v_caja, false) and not coalesce(v_sup, false) and r.fecha > v_hoy - 10)) and not r.oculto$a$));
  c jsonb;
begin
  for c in select * from jsonb_array_elements(procedure_cambios) loop
    f := c ->> 0;
    v := pg_get_functiondef(f::regprocedure);
    if position(c ->> 2 in v) > 0 then continue; end if;            -- ya estaba hecho
    if position(c ->> 1 in v) = 0 then
      raise exception 'No encuentro en % el trozo a cambiar: %', f, left(c ->> 1, 80);
    end if;
    execute replace(v, c ->> 1, c ->> 2);
  end loop;
end $$;
