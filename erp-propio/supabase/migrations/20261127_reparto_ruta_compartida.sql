-- Ruta compartida (Rober, 27/11/2026): dos (o más) repartidores pueden llevar la MISMA ruta. Juan se llevó
-- 19 pedidos de la ruta 7 de Walter y no tenía cómo marcarlos.
--  · El dueño de la ruta sigue siendo reparto.repartidor_codigo; los que se unen van en reparto_compartido.
--  · Todos ven todos los pedidos de la ruta y cualquiera puede marcarlos; reparto_linea.marcado_por guarda quién
--    lo marcó, y la caja liquida a cada uno lo que cobró él.
--  · Se une el propio repartidor desde la app («Compartir ruta con …») o se le quita al soltarla.

create table if not exists public.reparto_compartido (
  tienda_terminal_codigo text not null,
  numero bigint not null,
  repartidor_codigo text not null,
  desde timestamptz not null default now(),
  primary key (tienda_terminal_codigo, numero, repartidor_codigo)
);
alter table public.reparto_compartido enable row level security;
alter table public.reparto_linea add column if not exists marcado_por text;

create or replace function reparto_privado.comparte(p_tienda text, p_numero bigint, p_rep text)
 returns boolean language sql stable security definer set search_path to 'public'
as $$ select exists (select 1 from reparto_compartido where tienda_terminal_codigo = p_tienda and numero = p_numero and repartidor_codigo = p_rep) $$;

-- Nombres de los que comparten la ruta (sin el dueño), «Juan + Fran».
create or replace function reparto_privado.ayudantes(p_tienda text, p_numero bigint)
 returns text language sql stable security definer set search_path to 'public'
as $$
  select string_agg(coalesce(nullif(rp.nombre_corto, ''), rp.nombre, c.repartidor_codigo), ' + ' order by c.desde)
    from reparto_compartido c left join repartidor rp on rp.codigo = c.repartidor_codigo
   where c.tienda_terminal_codigo = p_tienda and c.numero = p_numero
$$;

-- Unirse a la ruta de un compañero.
create or replace function public.fn_app_rep_compartir(p_token uuid, p_tienda text, p_numero bigint)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare v_rep text := reparto_privado.sesion(p_token); r reparto;
begin
  select * into r from reparto where tienda_terminal_codigo = p_tienda and numero = p_numero for update;
  if not found then raise exception 'Ese reparto no existe.'; end if;
  if r.estado <> 2 then raise exception 'Ese reparto ya está cerrado.'; end if;
  if coalesce((select prueba from repartidor_pin where repartidor_codigo = v_rep), false) and coalesce(r.ruta_codigo, '') not in ('99', '11') then
    raise exception 'Un repartidor de prueba no puede compartir una ruta real.';
  end if;
  if r.repartidor_codigo is null then
    update reparto set repartidor_codigo = v_rep, actualizado_en = now() where tienda_terminal_codigo = p_tienda and numero = p_numero;
  elsif r.repartidor_codigo <> v_rep then
    insert into reparto_compartido (tienda_terminal_codigo, numero, repartidor_codigo) values (p_tienda, p_numero, v_rep)
    on conflict do nothing;
  end if;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.fn_app_rep_compartir(uuid, text, bigint) to anon, authenticated;

do $$
declare v text;
begin
  -- 1) Permiso sobre la ruta: el dueño o quien la comparte.
  v := pg_get_functiondef('reparto_privado.reparto'::regproc);
  if position('comparte(' in v) = 0 then
    if position('elsif r.repartidor_codigo <> p_rep then' in v) = 0 then raise exception 'reparto: patrón'; end if;
    v := replace(v, 'elsif r.repartidor_codigo <> p_rep then', 'elsif r.repartidor_codigo <> p_rep and not reparto_privado.comparte(p_tienda, p_numero, p_rep) then');
    execute v;
  end if;

  -- 2) Lista de rutas de la app: las mías, las que comparto, las libres y (para unirse) las de hoy de los compañeros.
  v := pg_get_functiondef('public.fn_app_rep_repartos'::regproc);
  if position('comparte(' in v) = 0 then
    if position('''mio'', r.repartidor_codigo = v_rep,' in v) = 0 or position('and (r.repartidor_codigo = v_rep or (r.repartidor_codigo is null' in v) = 0 then raise exception 'repartos: patrón'; end if;
    v := replace(v, '''mio'', r.repartidor_codigo = v_rep,',
      '''mio'', r.repartidor_codigo = v_rep or reparto_privado.comparte(r.tienda_terminal_codigo, r.numero, v_rep), '
      || '''de'', case when r.repartidor_codigo <> v_rep then (select coalesce(nullif(nombre_corto, ''''), nombre) from repartidor where codigo = r.repartidor_codigo) end, '
      || '''con'', reparto_privado.ayudantes(r.tienda_terminal_codigo, r.numero),');
    v := replace(v, 'and (r.repartidor_codigo = v_rep or (r.repartidor_codigo is null',
      'and (r.repartidor_codigo = v_rep or reparto_privado.comparte(r.tienda_terminal_codigo, r.numero, v_rep) '
      || 'or (not v_prueba and r.repartidor_codigo is not null and r.fecha = fn_app_rep_hoy() and coalesce(r.ruta_codigo, '''') not in (''99'', ''11'')) '
      || 'or (r.repartidor_codigo is null');
    execute v;
  end if;

  -- 3) Quién marcó cada pedido.
  v := pg_get_functiondef('public.fn_app_rep_marcar'::regproc);
  if position('marcado_por' in v) = 0 then
    if position(E'  update reparto_linea\n     set cobro_medio = ' in v) = 0 then raise exception 'marcar: patrón'; end if;
    v := replace(v, E'  update reparto_linea\n     set cobro_medio = ',
      E'  update reparto_linea\n     set marcado_por = case when p_accion = ''deshacer'' then null else v_rep end,\n         cobro_medio = ');
    execute v;
  end if;

  -- 4) Posición en el mapa también para quien comparte.
  v := pg_get_functiondef('public.fn_app_rep_posicion'::regproc);
  if position('comparte(' in v) = 0 then
    if position('and estado = 2 and repartidor_codigo = v_rep)' in v) = 0 then raise exception 'posicion: patrón'; end if;
    v := replace(v, 'and estado = 2 and repartidor_codigo = v_rep)',
      'and estado = 2 and (repartidor_codigo = v_rep or reparto_privado.comparte(p_tienda, p_numero, v_rep)))');
    execute v;
  end if;

  -- 5) Soltar: quien comparte solo se va él; si suelta el dueño y hay compañeros, la ruta pasa al primero.
  v := pg_get_functiondef('public.fn_app_rep_soltar'::regproc);
  if position('reparto_compartido' in v) = 0 then
    if position('  if r.repartidor_codigo is distinct from v_rep then raise exception' in v) = 0
       or position('  update reparto set repartidor_codigo = null, actualizado_en = now()' in v) = 0 then raise exception 'soltar: patrón'; end if;
    v := replace(v, '  if r.repartidor_codigo is distinct from v_rep then raise exception',
      E'  if reparto_privado.comparte(p_tienda, p_numero, v_rep) then\n'
      || E'    delete from reparto_compartido where tienda_terminal_codigo = p_tienda and numero = p_numero and repartidor_codigo = v_rep;\n'
      || E'    return jsonb_build_object(''ok'', true);\n  end if;\n'
      || '  if r.repartidor_codigo is distinct from v_rep then raise exception');
    v := replace(v, '  update reparto set repartidor_codigo = null, actualizado_en = now()',
      E'  if exists (select 1 from reparto_compartido where tienda_terminal_codigo = p_tienda and numero = p_numero) then\n'
      || E'    update reparto set repartidor_codigo = (select repartidor_codigo from reparto_compartido where tienda_terminal_codigo = p_tienda and numero = p_numero order by desde limit 1), actualizado_en = now()\n'
      || E'     where tienda_terminal_codigo = p_tienda and numero = p_numero;\n'
      || E'    delete from reparto_compartido c using reparto r2 where r2.tienda_terminal_codigo = p_tienda and r2.numero = p_numero\n'
      || E'       and c.tienda_terminal_codigo = p_tienda and c.numero = p_numero and c.repartidor_codigo = r2.repartidor_codigo;\n'
      || E'    return jsonb_build_object(''ok'', true);\n  end if;\n'
      || '  update reparto set repartidor_codigo = null, actualizado_en = now()');
    execute v;
  end if;

  -- 6) Liquidación: a nombre de quien marcó (cobró) la factura.
  v := pg_get_functiondef('public.fn_app_rep_liquidar'::regproc);
  if position('marcado_por' in v) = 0 then
    if position('l.cobro_medio,' in v) = 0 or position('v_repartidor := coalesce(v_repartidor, x.rrep);' in v) = 0 then raise exception 'liquidar: patrón'; end if;
    v := replace(v, 'l.cobro_medio,', 'l.cobro_medio, l.marcado_por mpor,');
    v := replace(v, 'v_repartidor := coalesce(v_repartidor, x.rrep);', 'v_repartidor := coalesce(v_repartidor, x.mpor, x.rrep);');
    execute v;
  end if;

  -- 7) Caja de administración: cada factura con el repartidor que la marcó (la pantalla agrupa por él).
  v := pg_get_functiondef('reparto_privado.por_cobrar'::regproc);
  if position('marcado_por' in v) = 0 then
    if position('left join repartidor rp on rp.codigo = r.repartidor_codigo' in v) = 0 then raise exception 'por_cobrar: patrón'; end if;
    v := replace(v, 'left join repartidor rp on rp.codigo = r.repartidor_codigo', 'left join repartidor rp on rp.codigo = coalesce(l.marcado_por, r.repartidor_codigo)');
    execute v;
  end if;

  -- 8) Control de repartos (ERP y TV): «Walter + Juan», y el ranking cuenta a quien entregó.
  v := pg_get_functiondef('reparto_privado.seguimiento'::regproc);
  if position('ayudantes(' in v) = 0 then
    if position('''repartidor_nombre'', coalesce(nullif(rp.nombre_corto, ''''), rp.nombre),' in v) = 0 then raise exception 'seguimiento: patrón 1'; end if;
    v := replace(v, '''repartidor_nombre'', coalesce(nullif(rp.nombre_corto, ''''), rp.nombre),',
      '''repartidor_nombre'', coalesce(nullif(rp.nombre_corto, ''''), rp.nombre) || coalesce('' + '' || reparto_privado.ayudantes(r.tienda_terminal_codigo, r.numero), ''''),');
    v := replace(v, E'select coalesce(nullif(rp.nombre_corto, \'\'), rp.nombre, r.repartidor_codigo) nombre, count(*) n\n                from reparto_linea l join reparto r on r.tienda_terminal_codigo = l.tienda_terminal_codigo and r.numero = l.numero\n                left join repartidor rp on rp.codigo = r.repartidor_codigo\n               where l.estado in (\'entregado\', \'liquidado\') and r.repartidor_codigo is not null',
      E'select coalesce(nullif(rp.nombre_corto, \'\'), rp.nombre, coalesce(l.marcado_por, r.repartidor_codigo)) nombre, count(*) n\n                from reparto_linea l join reparto r on r.tienda_terminal_codigo = l.tienda_terminal_codigo and r.numero = l.numero\n                left join repartidor rp on rp.codigo = coalesce(l.marcado_por, r.repartidor_codigo)\n               where l.estado in (\'entregado\', \'liquidado\') and coalesce(l.marcado_por, r.repartidor_codigo) is not null');
    execute v;
  end if;

  -- 9) Pantalla «Todas las rutas» de la oficina en la app.
  v := pg_get_functiondef('public.fn_app_rep_todas'::regproc);
  if position('ayudantes(' in v) = 0 then
    if position('''repartidor'', coalesce(nullif(rp.nombre_corto, ''''), rp.nombre),' in v) = 0 then raise exception 'todas: patrón'; end if;
    v := replace(v, '''repartidor'', coalesce(nullif(rp.nombre_corto, ''''), rp.nombre),',
      '''repartidor'', coalesce(nullif(rp.nombre_corto, ''''), rp.nombre) || coalesce('' + '' || reparto_privado.ayudantes(r.tienda_terminal_codigo, r.numero), ''''),');
    execute v;
  end if;

  -- 10) Pedidos de la app: quién marcó cada uno.
  v := pg_get_functiondef('public.fn_app_rep_lineas'::regproc);
  if position('marcado_por' in v) = 0 then
    if position('''comprobado'', l.comprobado_en is not null,' in v) = 0 then raise exception 'lineas: patrón'; end if;
    v := replace(v, '''comprobado'', l.comprobado_en is not null,',
      '''comprobado'', l.comprobado_en is not null, ''marcado_por'', l.marcado_por, '
      || '''marcado_por_nombre'', (select coalesce(nullif(nombre_corto, ''''), nombre) from repartidor where codigo = l.marcado_por),');
    execute v;
  end if;
end $$;
