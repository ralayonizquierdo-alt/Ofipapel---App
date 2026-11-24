-- Rober, 24/11/2026: las ventas de la ruta 08 (islas) no son una ruta aparte: van dentro del reparto de la ruta 04,
-- marcadas «ISLAS» para que el repartidor lo sepa. El cliente CONSERVA su ruta 08 en la ficha; solo cambia dónde se reparte.
--  · reparto.erp_ruta_agrupa = {"08":"04"}: erp_candidatas pone esas ventas en la ruta destino (la 08 ya no propone nada).
--  · reparto_linea.isla: lo marca el generador (y «añadir factura» a mano) con reparto_privado.erp_es_isla; la app lo muestra.
-- Aplicada en Supabase como migración «reparto_islas_van_en_la_ruta_4» (más el revoke de erp_es_isla, ver abajo).
-- Mismo método que el resto de arreglos: se lee la definición viva, se sustituye el texto y se comprueba que ha entrado.
alter table reparto_linea add column if not exists isla boolean not null default false;

insert into parametro (clave, valor, descripcion)
values ('reparto.erp_ruta_agrupa', '{"08":"04"}'::jsonb, 'Rutas que no se reparten solas: sus ventas van dentro del reparto de otra ruta, marcadas ISLAS (clave = ruta del cliente o de la venta, valor = ruta donde se reparte). El cliente conserva su ruta en la ficha.')
on conflict (clave) do nothing;

create or replace function reparto_privado.erp_es_isla(p_vt text, p_vn bigint)
 returns boolean language sql stable security definer
 set search_path to 'public', 'pg_temp'
as $f$
  select coalesce((select p.valor ? coalesce(nullif(g.ruta_venta, ''), nullif(g.ruta_cliente, ''), c.ruta_codigo)
                     from parametro p
                    cross join reparto_gw_venta g
                     left join cliente c on c.codigo = g.cliente_codigo
                    where p.clave = 'reparto.erp_ruta_agrupa' and g.venta_tienda_codigo = p_vt and g.venta_numero = p_vn), false)
$f$;
revoke all on function reparto_privado.erp_es_isla(text, bigint) from public, anon, authenticated;

create or replace function reparto_privado.erp_candidatas(p_fecha date)
 returns table(vt text, vn bigint, ruta text, de_ruta text, principal boolean, viene boolean, ant_tienda text, ant_numero bigint, antes text, en_gw text)
 language sql stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  with par as (
    select coalesce((select valor from parametro where clave = 'reparto.erp_rutas'), '[]'::jsonb) rutas_erp,
           coalesce((select valor from parametro where clave = 'reparto.erp_tiendas_venta'), '["54"]'::jsonb) tiendas,
           coalesce((select (valor #>> '{}')::int from parametro where clave = 'reparto.erp_dias'), 7) dias,
           coalesce((select valor from parametro where clave = 'reparto.erp_ruta_agrupa'), '{}'::jsonb) agrupa)
  select g.venta_tienda_codigo, g.venta_numero, k.ruta, k.de,
         a.vt is not null or par.tiendas ? g.venta_tienda_codigo,
         a.vt is not null, a.tienda, a.numero, a.obs,
         case when g.gw_estado in (2, 3) and not (par.rutas_erp ? k.ruta) then coalesce(g.gw_reparto, 'sí') end
    from reparto_gw_venta g
    cross join par
    left join cliente c on c.codigo = g.cliente_codigo
    cross join lateral (
      select coalesce(par.agrupa ->> k0.ruta0, k0.ruta0) ruta, k0.de
        from (select coalesce(nullif(g.ruta_venta, ''), nullif(g.ruta_cliente, ''), c.ruta_codigo) ruta0,
                     case when nullif(g.ruta_venta, '') is not null then 'venta' else 'ficha' end de) k0) k
    left join lateral (
      select l.tienda_terminal_codigo tienda, l.numero, l.estado_observaciones obs, l.venta_tienda_codigo vt
        from reparto_linea l join reparto r on r.tienda_terminal_codigo = l.tienda_terminal_codigo and r.numero = l.numero
       where l.venta_tienda_codigo = g.venta_tienda_codigo and l.venta_numero = g.venta_numero
         and (l.estado = 'no_entregado' or (l.estado in ('pendiente', 'viene_anterior') and r.generado_erp and r.estado = 2 and r.fecha < p_fecha)
              or (l.estado in ('pendiente', 'viene_anterior') and r.estado <> 2 and g.gw_estado in (2, 3)))
       order by r.fecha desc, r.numero desc limit 1) a on true
   where k.ruta is not null
     and g.total is not null
     and (g.fecha >= p_fecha - par.dias or (a.vt is not null and g.fecha >= p_fecha - 45))
     and (g.nueva or a.vt is not null)
     and (a.vt is not null or coalesce(g.gw_estado, 0) <> 0)
     and coalesce(g.gw_estado, 0) not in (4, 5, 6, 8, 10)
     and not exists (select 1 from reparto_linea n where n.venta_tienda_codigo = g.venta_tienda_codigo and n.venta_numero = g.venta_numero and n.nulo_en is not null)
     and not exists (
       select 1 from reparto_linea l join reparto r on r.tienda_terminal_codigo = l.tienda_terminal_codigo and r.numero = l.numero
        where l.venta_tienda_codigo = g.venta_tienda_codigo and l.venta_numero = g.venta_numero
          and ((l.estado in ('entregado', 'liquidado', 'devuelto')
                and not (r.origen = 'geminiswin' and not r.generado_erp and r.estado = 2 and not (par.rutas_erp ? k.ruta)))
               or (l.estado in ('pendiente', 'viene_anterior')
                   and not (r.generado_erp and r.estado = 2 and r.fecha < p_fecha)
                   and not (r.estado <> 2 and g.gw_estado in (2, 3))
                   and not (r.origen = 'geminiswin' and not r.generado_erp and r.estado = 2 and not (par.rutas_erp ? k.ruta)))))
$function$;

do $$
declare d text;
begin
  d := pg_get_functiondef('public.fn_reparto_erp_generar(text,date,text,jsonb)'::regprocedure);
  if position('erp_es_isla' in d) = 0 then
    d := replace(d, 'reparto_anterior_tienda_codigo, reparto_anterior_numero, estado_observaciones)', 'reparto_anterior_tienda_codigo, reparto_anterior_numero, estado_observaciones, isla)');
    d := replace(d, '''Anterior: '' || coalesce(nullif(x.antes, ''''), ''no entregado'') end)', '''Anterior: '' || coalesce(nullif(x.antes, ''''), ''no entregado'') end, reparto_privado.erp_es_isla(x.vt, x.vn))');
    d := replace(d, 'estado_observaciones = excluded.estado_observaciones, actualizado_en = now()', 'estado_observaciones = excluded.estado_observaciones, isla = reparto_privado.erp_es_isla(excluded.venta_tienda_codigo, excluded.venta_numero), actualizado_en = now()');
    if position('estado_observaciones, isla)' in d) = 0 or position('erp_es_isla(x.vt, x.vn)' in d) = 0 or position('erp_es_isla(excluded' in d) = 0 then
      raise exception 'No se pudo cambiar fn_reparto_erp_generar.';
    end if;
    execute d;
  end if;

  d := pg_get_functiondef('public.fn_app_rep_lineas(uuid,text,integer)'::regprocedure);
  if position('''isla'', l.isla' in d) = 0 then
    d := replace(d, '''antes'', l.estado_observaciones,', '''antes'', l.estado_observaciones, ''isla'', l.isla,');
    if position('''isla'', l.isla' in d) = 0 then raise exception 'No se pudo cambiar fn_app_rep_lineas.'; end if;
    execute d;
  end if;

  d := pg_get_functiondef('public.fn_reparto_erp_panel(date)'::regprocedure);
  if position('erp_es_isla' in d) = 0 then
    d := replace(d, '''en_gw'', k.en_gw, ''de_ruta'', k.de_ruta)', '''en_gw'', k.en_gw, ''de_ruta'', k.de_ruta, ''isla'', reparto_privado.erp_es_isla(k.vt, k.vn))');
    if position('erp_es_isla' in d) = 0 then raise exception 'No se pudo cambiar fn_reparto_erp_panel.'; end if;
    execute d;
  end if;

  d := pg_get_functiondef('public.fn_reparto_erp_anadir_factura(text,integer,text,bigint)'::regprocedure);
  if position('erp_es_isla' in d) = 0 then
    d := replace(d, 'telefono_fijo, telefono_movil, email, estado)', 'telefono_fijo, telefono_movil, email, estado, isla)');
    d := replace(d, 'coalesce(g.email, c.email), ''pendiente'')', 'coalesce(g.email, c.email), ''pendiente'', reparto_privado.erp_es_isla(p_vt, p_vn))');
    if position('erp_es_isla' in d) = 0 or position('estado, isla)' in d) = 0 then raise exception 'No se pudo cambiar fn_reparto_erp_anadir_factura.'; end if;
    execute d;
  end if;
end $$;
