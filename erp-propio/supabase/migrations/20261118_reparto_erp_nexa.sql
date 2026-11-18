-- Generar y cerrar repartos por orden de un administrador a NEXA (18/11/2026, Rober).
--
-- NEXA ya podía llamar a cualquier función del ERP con «proponer → confirmar → ejecutar». Aquí:
--   1. Solo un ADMINISTRADOR puede usar a NEXA para generar, cerrar o cambiar de sitio los repartos (las
--      funciones lo comprueban cuando las llama NEXA, también al simular la propuesta). Quien tenga permiso de
--      Repartos lo sigue haciendo desde Ventas → Generar repartos.
--   2. Funciones de una sola orden, sin tener que pasar venta a venta:
--        fn_reparto_erp_generar_ruta(ruta, día, repartidor) — con lo propuesto y marcado por defecto; sin día,
--          el siguiente de reparto; sin repartidor, el de la última vez.
--        fn_reparto_erp_generar_todas(día) — lo mismo para todas las rutas que se llevan en el ERP.
--        fn_reparto_erp_cerrar_ruta(ruta) — cierra el reparto abierto de esa ruta (sin ruta: todas las del ERP).
--   3. Catálogo de NEXA (nivel y «receta») y su memoria global, para que sepa cómo hacerlo.
-- Los repartos que siguen en GeminisWin se generan y se cierran allí: las funciones lo rechazan con el motivo.

create or replace function reparto_privado.nexa_solo_admin()
returns void language plpgsql stable set search_path to 'public', 'pg_temp' as $$
begin
  if coalesce(current_setting('erp.nexa_origen', true), '') <> '' and not public.fn_es_administrador() then
    raise exception 'Generar o cerrar repartos con NEXA solo lo puede ordenar un administrador. Si tienes permiso de Repartos, hazlo en Ventas → Generar repartos.'
      using errcode = '42501';
  end if;
end $$;
revoke all on function reparto_privado.nexa_solo_admin() from public, anon, authenticated;

-- La guarda en las funciones que ya había.
do $$
declare f text; v text;
  marca constant text := 'perform reparto_privado.nexa_solo_admin();';
begin
  foreach f in array array['public.fn_reparto_erp_generar(text,date,text,jsonb)', 'public.fn_reparto_erp_cerrar(text,bigint)',
                           'public.fn_reparto_erp_quitar(text,bigint,text,bigint)', 'public.fn_reparto_erp_ruta(text,boolean)'] loop
    v := pg_get_functiondef(f::regprocedure);
    if position(marca in v) > 0 then continue; end if;
    if position('  if not fn_puede(''/repartos'') then' in v) = 0 then raise exception 'No encuentro la comprobación de permiso en %', f; end if;
    execute regexp_replace(v, '  if not fn_puede\(''/repartos''\) then', '  ' || marca || E'\n  if not fn_puede(''/repartos'') then');
  end loop;
end $$;

-- Una ruta, con la propuesta tal cual sale marcada en la pantalla.
create or replace function public.fn_reparto_erp_generar_ruta(p_ruta text, p_fecha date default null, p_repartidor text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_fecha date := coalesce(p_fecha, reparto_privado.erp_siguiente_dia()); v_rep text; v_ventas jsonb; r jsonb;
begin
  perform reparto_privado.nexa_solo_admin();
  if not fn_puede('/repartos') then
    raise exception 'No tienes permiso de Repartos. Pídelo a un administrador (Archivo → Usuarios y permisos).' using errcode = '42501';
  end if;
  v_rep := coalesce(nullif(btrim(p_repartidor), ''),
    (select a.repartidor_codigo from reparto a where a.generado_erp and a.estado = 2 and a.ruta_codigo = p_ruta and a.fecha = v_fecha order by a.numero desc limit 1),
    (select a.repartidor_codigo from reparto a where a.ruta_codigo = p_ruta and a.repartidor_codigo is not null and a.repartidor_codigo not in ('OFI', 'PAG', 'PED')
      order by a.fecha desc, a.numero desc limit 1));
  if v_rep is null then raise exception 'La ruta % no tiene repartidor de otras veces: di cuál la hace.', p_ruta; end if;
  select coalesce(jsonb_agg(jsonb_build_object('vt', k.vt, 'vn', k.vn)), '[]'::jsonb) into v_ventas
    from reparto_privado.erp_candidatas(v_fecha) k where k.ruta = p_ruta and k.principal and k.en_gw is null;
  if v_ventas = '[]'::jsonb then
    raise exception 'En la ruta % no hay nada propuesto para repartir el %.', p_ruta, to_char(v_fecha, 'DD/MM/YYYY');
  end if;
  r := fn_reparto_erp_generar(p_ruta, v_fecha, v_rep, v_ventas);
  return r || jsonb_build_object('ruta', p_ruta, 'repartidor', v_rep,
    'sin_marcar', (select count(*) from reparto_privado.erp_candidatas(v_fecha) k where k.ruta = p_ruta and (not k.principal or k.en_gw is not null)));
end $$;
comment on function public.fn_reparto_erp_generar_ruta(text, date, text) is
  'Genera (o completa) el reparto de una ruta del ERP con las ventas propuestas y marcadas por defecto; cierra antes el anterior. Sin día: el siguiente de reparto. Sin repartidor: el de la última vez.';
revoke all on function public.fn_reparto_erp_generar_ruta(text, date, text) from public, anon;
grant execute on function public.fn_reparto_erp_generar_ruta(text, date, text) to authenticated;

-- Todas las rutas del ERP de una vez.
create or replace function public.fn_reparto_erp_generar_todas(p_fecha date default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v jsonb := '[]'::jsonb; x text;
begin
  perform reparto_privado.nexa_solo_admin();
  if not fn_puede('/repartos') then
    raise exception 'No tienes permiso de Repartos. Pídelo a un administrador (Archivo → Usuarios y permisos).' using errcode = '42501';
  end if;
  for x in select e #>> '{}' from jsonb_array_elements(coalesce((select valor from parametro where clave = 'reparto.erp_rutas'), '[]'::jsonb)) e order by 1 loop
    begin
      v := v || jsonb_build_array(fn_reparto_erp_generar_ruta(x, p_fecha, null));
    exception when others then          -- una ruta que no se puede generar no para las demás
      v := v || jsonb_build_array(jsonb_build_object('ruta', x, 'ok', false, 'error', sqlerrm));
    end;
  end loop;
  if v = '[]'::jsonb then raise exception 'Todavía no hay ninguna ruta que se lleve en el ERP: todas se generan en GeminisWin.'; end if;
  return jsonb_build_object('ok', true, 'rutas', v);
end $$;
comment on function public.fn_reparto_erp_generar_todas(date) is
  'Genera el reparto de todas las rutas que se llevan en el ERP (reparto.erp_rutas) con lo propuesto por defecto. Sin día: el siguiente de reparto.';
revoke all on function public.fn_reparto_erp_generar_todas(date) from public, anon;
grant execute on function public.fn_reparto_erp_generar_todas(date) to authenticated;

-- Cerrar por ruta (o todas las del ERP).
create or replace function public.fn_reparto_erp_cerrar_ruta(p_ruta text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare a record; v jsonb := '[]'::jsonb;
begin
  perform reparto_privado.nexa_solo_admin();
  if not fn_puede('/repartos') then
    raise exception 'No tienes permiso de Repartos. Pídelo a un administrador (Archivo → Usuarios y permisos).' using errcode = '42501';
  end if;
  if p_ruta is not null and not (coalesce((select valor from parametro where clave = 'reparto.erp_rutas'), '[]'::jsonb) ? p_ruta)
     and not exists (select 1 from reparto where generado_erp and estado = 2 and ruta_codigo = p_ruta) then
    raise exception 'La ruta % se lleva en GeminisWin: su reparto se cierra en GeminisWin.', p_ruta;
  end if;
  for a in select tienda_terminal_codigo t, numero n, ruta_codigo ruta from reparto
            where generado_erp and estado = 2 and (p_ruta is null or ruta_codigo = p_ruta) order by ruta_codigo, numero for update loop
    v := v || jsonb_build_array(jsonb_build_object('ruta', a.ruta, 'reparto', a.t || '-' || a.n, 'sin_marcar', reparto_privado.erp_cerrar(a.t, a.n)));
  end loop;
  if v = '[]'::jsonb then raise exception 'No hay ningún reparto abierto del ERP%.', coalesce(' en la ruta ' || p_ruta, ''); end if;
  return jsonb_build_object('ok', true, 'cerrados', v);
end $$;
comment on function public.fn_reparto_erp_cerrar_ruta(text) is
  'Cierra el reparto abierto generado en el ERP de una ruta (sin ruta: todos). Lo que siga sin marcar pasa a «no entregado» y vuelve a proponerse.';
revoke all on function public.fn_reparto_erp_cerrar_ruta(text) from public, anon;
grant execute on function public.fn_reparto_erp_cerrar_ruta(text) to authenticated;

comment on function public.fn_reparto_erp_panel(date) is
  'Solo lectura. Pantalla Generar repartos: por ruta, la propuesta, el repartidor de siempre, el reparto ya generado del día y el abierto de GeminisWin.';

-- Catálogo de NEXA: nivel 3 (responder «sí»); pasar una ruta de sitio, nivel 4.
insert into public.nexa_operacion (codigo, descripcion, tipo, objeto, nivel, permiso, receta) values
  ('funcion:fn_reparto_erp_generar_ruta', 'Generar el reparto de una ruta (ERP)', 'funcion', 'fn_reparto_erp_generar_ruta', 3, '/repartos',
   'Solo administradores. Antes mira la propuesta con consultar_bd: select r->>''ruta'' ruta, r->>''nombre'' nombre, r->>''erp'' en_erp, jsonb_array_length(r->''propuesta'') propuestas, r->''abierto'' ya_generado from jsonb_array_elements(public.fn_reparto_erp_panel(null)->''rutas'') r. Solo se generan las rutas con en_erp = true; las demás se generan en GeminisWin. Argumentos: p_ruta (código, p. ej. "05"), p_fecha (null = siguiente día de reparto), p_repartidor (null = el de la última vez). Cierra el anterior de esa ruta y mete lo propuesto marcado.'),
  ('funcion:fn_reparto_erp_generar_todas', 'Generar los repartos de todas las rutas del ERP', 'funcion', 'fn_reparto_erp_generar_todas', 3, '/repartos',
   'Solo administradores. p_fecha null = siguiente día de reparto. Genera cada ruta de reparto.erp_rutas con lo propuesto por defecto y cierra el anterior de cada una.'),
  ('funcion:fn_reparto_erp_cerrar_ruta', 'Cerrar el reparto de una ruta (ERP)', 'funcion', 'fn_reparto_erp_cerrar_ruta', 3, '/repartos',
   'Solo administradores. p_ruta = código; null = todos los repartos abiertos del ERP. Lo normal es no cerrar a mano: al generar el siguiente se cierra solo. Los repartos de GeminisWin se cierran en GeminisWin.'),
  ('funcion:fn_reparto_erp_cerrar', 'Cerrar un reparto del ERP por su número', 'funcion', 'fn_reparto_erp_cerrar', 3, '/repartos', null),
  ('funcion:fn_reparto_erp_generar', 'Generar un reparto eligiendo las ventas una a una', 'funcion', 'fn_reparto_erp_generar', 3, '/repartos',
   'Mejor fn_reparto_erp_generar_ruta. Esta solo si piden ventas concretas: p_ventas = [{"vt":"54","vn":2468816}, …] sacadas de la propuesta de fn_reparto_erp_panel.'),
  ('funcion:fn_reparto_erp_quitar', 'Quitar una venta de un reparto del ERP', 'funcion', 'fn_reparto_erp_quitar', 3, '/repartos', null),
  ('funcion:fn_reparto_erp_ruta', 'Pasar una ruta al ERP o devolverla a GeminisWin', 'funcion', 'fn_reparto_erp_ruta', 4, '/repartos',
   'Cambia dónde se generan los repartos de esa ruta. Recuerda al usuario que, pasada al ERP, esa ruta NO se genera en GeminisWin.')
on conflict (codigo) do update set descripcion = excluded.descripcion, nivel = excluded.nivel, permiso = excluded.permiso, receta = excluded.receta, actualizado_en = now();

-- Memoria global de NEXA: la nota que decía que no podía cerrar repartos deja de valer. Las notas nuevas llevan el
-- mismo autor que la que sustituyen (nexa_memoria.usuario_id es obligatorio).
with vieja as (
  update public.nexa_memoria set activa = false, desactivada_en = now()
   where ambito = 'global' and activa and texto like 'REPARTO EN VIVO (2)%NEXA solo CONSULTA el reparto%'
  returning usuario_id),
autor as (select coalesce((select usuario_id from vieja limit 1),
                          (select usuario_id from public.nexa_memoria where ambito = 'global' and texto like 'REPARTO EN VIVO%' order by id limit 1)) u)
insert into public.nexa_memoria (ambito, texto, usuario_id)
select 'global', t, (select u from autor) from (values
  ('REPARTO EN VIVO (2): «posicion» trae lat, lng y «en» (hora de la última señal GPS). Si es null, el repartidor aún no ha enviado posición (no abrió la app o no dio permiso de ubicación): dilo así, nunca inventes un lugar. Enlace de mapa: https://www.google.com/maps?q=LAT,LNG.'),
  ('GENERAR Y CERRAR REPARTOS: solo si lo ordena un ADMINISTRADOR, con proponer_cambio → «sí» → ejecutar_cambio. Busca «reparto» en describir_funciones y sigue su receta: fn_reparto_erp_generar_ruta(p_ruta, p_fecha, p_repartidor) para una ruta, fn_reparto_erp_generar_todas(p_fecha) para todas, fn_reparto_erp_cerrar_ruta(p_ruta) para cerrar. Solo valen las rutas que se llevan en el ERP (fn_reparto_erp_panel → erp = true); las de GeminisWin se generan y cierran allí: dilo así. Tras ejecutar, di el número de reparto, cuántas ventas entraron, las que quedaron sin marcar y si se cerró el anterior.')
) x(t)
where not exists (select 1 from public.nexa_memoria m where m.ambito = 'global' and m.activa and m.texto = x.t);

-- Probado el 18/11/2026 en una transacción deshecha (ruta 11, ventas ZZTEST): por NEXA sin ser administrador se
-- rechaza; generar_ruta mete las 2 marcadas y deja 1 de otra tienda sin marcar; generar_todas sin nada nuevo da el
-- aviso de esa ruta sin parar; cerrar_ruta cierra; cerrar una ruta de GeminisWin se rechaza con el motivo.
