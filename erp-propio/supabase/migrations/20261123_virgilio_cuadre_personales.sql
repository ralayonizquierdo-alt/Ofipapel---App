-- Virgilio: funciones 8 (cuadre ERP–GeminisWin) y 9 (vigilancias personales por NEXA). Rober, 23/11/2026: «no sé por
-- qué no activas la 8 y la 9 ya».
--
-- 8) Cuadre de ventas y cobros por día (últimos 7 días, sin hoy) entre GeminisWin (espejo) y el ERP. Solo cuenta los
--    días en que el ERP tiene ventas o cobros: hoy se vende todo en GeminisWin y no hay nada que cuadrar; en cuanto el
--    ERP empiece a vender (migración, convivencia), avisa de los días que no coinciden. Tolerancia 1 €. Avisa a
--    vigilante.sistema_para.
-- 9) Vigilancias personales: cualquier empleado le pide a NEXA «avísame cuando…» y queda a su nombre. Tipos:
--      pedido_proveedor {proveedor_codigo | pedido "oficina-numero"}: cuando llega (recibido en GeminisWin).
--      articulo_stock   {articulo_codigo}: cuando vuelve a tener stock.
--      cliente_compra   {cliente_codigo}: cuando el cliente hace una venta o un pedido.
--    Al cumplirse, tarea en «Mis tareas pendientes» de quien la pidió (no se cierra sola: es un aviso) y la vigilancia
--    queda cumplida. Cada uno solo puede vigilar lo que su permiso le deja ver.

-- ── 8) Cuadre ────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_virgilio_cuadre(p_dias integer default 7)
returns table (dia date, que text, gw_n bigint, erp_n bigint, gw_total numeric, erp_total numeric)
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  with v as (
    select coalesce(g.d, e.d) d, g.n gn, e.n en, g.t gt, e.t et
      from (select fecha::date d, count(*) n, sum(total) t from gw_venta where fecha >= current_date - p_dias and fecha < current_date group by 1) g
      full join (select fecha::date d, count(*) n, sum(total) t from venta where anulada_en is null and fecha >= current_date - p_dias and fecha < current_date group by 1) e using (d)
  ), c as (
    select coalesce(g.d, e.d) d, g.n gn, e.n en, g.t gt, e.t et
      from (select fecha_pago::date d, count(*) n, sum(pagado) t from gw_cobro where fecha_pago >= current_date - p_dias and fecha_pago < current_date group by 1) g
      full join (select fecha_pago::date d, count(*) n, sum(importe_cobrado) t from cobro_cliente where coalesce(activo, true) and fecha_pago >= current_date - p_dias and fecha_pago < current_date group by 1) e using (d)
  )
  select d, 'ventas', coalesce(gn, 0), coalesce(en, 0), round(coalesce(gt, 0), 2), round(coalesce(et, 0), 2) from v
   where coalesce(en, 0) > 0 and abs(coalesce(gt, 0) - coalesce(et, 0)) > 1
  union all
  select d, 'cobros', coalesce(gn, 0), coalesce(en, 0), round(coalesce(gt, 0), 2), round(coalesce(et, 0), 2) from c
   where coalesce(en, 0) > 0 and abs(coalesce(gt, 0) - coalesce(et, 0)) > 1
  order by 1, 2
$$;
revoke all on function public.fn_virgilio_cuadre(integer) from public, anon;
grant execute on function public.fn_virgilio_cuadre(integer) to authenticated;

-- ── 9) Vigilancias personales ────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.vigilancia_personal (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('pedido_proveedor', 'articulo_stock', 'cliente_compra')),
  parametros jsonb not null default '{}'::jsonb,
  descripcion text not null,
  empleado_codigo text not null default public.fn_empleado_actual(),
  persona text not null,
  creada_en timestamptz not null default now(),
  cumplida_en timestamptz,
  quitada_en timestamptz,
  incidencia_id bigint
);
comment on table public.vigilancia_personal is 'Virgilio: avisos que cada empleado pide a NEXA («avísame cuando…»). Al cumplirse, tarea en Mis tareas.';
create index if not exists vigilancia_personal_viva_idx on public.vigilancia_personal (tipo) where cumplida_en is null and quitada_en is null;
alter table public.vigilancia_personal enable row level security;
do $$
begin
  if not exists (select 1 from pg_policy where polname = 'vigilancia_personal_lee') then
    create policy vigilancia_personal_lee on public.vigilancia_personal for select to authenticated
      using (empleado_codigo = (select public.fn_empleado_actual()) or (select public.fn_es_administrador()));
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_auditoria_vigilancia_personal') then
    create trigger trg_auditoria_vigilancia_personal after insert or update on public.vigilancia_personal
      for each row execute function public.fn_auditoria_trigger();
  end if;
end $$;
revoke all on public.vigilancia_personal from anon;

-- Pedir una vigilancia (NEXA, nivel 2: propone y la persona dice «sí»).
create or replace function public.fn_vigilancia_pedir(p_tipo text, p_parametros jsonb, p_descripcion text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_emp text := fn_empleado_actual(); v_persona text; v_id bigint; v_desc text; v_prov text; v_ped text; v_art text; v_cli text;
begin
  if v_emp is null then raise exception 'No sé quién eres: entra con tu usuario del ERP.' using errcode = '42501'; end if;
  v_persona := coalesce(fn_virgilio_nombre((select nombre from empleado where codigo = v_emp)), v_emp);
  v_prov := nullif(btrim(p_parametros->>'proveedor_codigo'), '');
  v_ped := nullif(btrim(p_parametros->>'pedido'), '');
  v_art := nullif(btrim(p_parametros->>'articulo_codigo'), '');
  v_cli := nullif(btrim(p_parametros->>'cliente_codigo'), '');
  if p_tipo = 'pedido_proveedor' then
    if not (fn_es_administrador() or fn_puede('/gestor-pedidos-proveedor')) then
      raise exception 'No tienes permiso para ver los pedidos a proveedor.' using errcode = '42501';
    end if;
    if v_ped is not null then
      if not exists (select 1 from gw_pedido_proveedor where oficina || '-' || numero = v_ped) then raise exception 'No encuentro el pedido % en GeminisWin.', v_ped; end if;
      select proveedor_codigo into v_prov from gw_pedido_proveedor where oficina || '-' || numero = v_ped;
      v_desc := format('Avísame cuando llegue el pedido %s (%s)', v_ped, coalesce((select nombre from proveedor where codigo = v_prov), v_prov));
    elsif v_prov is not null then
      if not exists (select 1 from proveedor where codigo = v_prov) then raise exception 'No existe el proveedor %.', v_prov; end if;
      if not exists (select 1 from gw_pedido_proveedor where proveedor_codigo = v_prov and not coalesce(recibido, false)) then
        raise exception 'El proveedor % no tiene ningún pedido pendiente de llegar.', (select nombre from proveedor where codigo = v_prov);
      end if;
      v_desc := format('Avísame cuando llegue el pedido de %s', (select nombre from proveedor where codigo = v_prov));
    else raise exception 'Dime el proveedor (proveedor_codigo) o el pedido ("oficina-numero").';
    end if;
  elsif p_tipo = 'articulo_stock' then
    if v_art is null or not exists (select 1 from articulo where codigo_interno = v_art) then raise exception 'No encuentro el artículo %.', coalesce(v_art, '(sin código)'); end if;
    v_desc := format('Avísame cuando haya stock de %s %s', v_art, (select descripcion from articulo where codigo_interno = v_art));
  elsif p_tipo = 'cliente_compra' then
    if not (fn_es_administrador() or fn_puede('/ventas')) then raise exception 'No tienes permiso para ver las ventas.' using errcode = '42501'; end if;
    if v_cli is null or not exists (select 1 from cliente where codigo = v_cli) then raise exception 'No encuentro el cliente %.', coalesce(v_cli, '(sin código)'); end if;
    v_desc := format('Avísame cuando %s compre o haga un pedido', (select nombre from cliente where codigo = v_cli));
  else
    raise exception 'Todavía no sé vigilar «%». Sé: pedido_proveedor, articulo_stock, cliente_compra.', p_tipo;
  end if;
  insert into vigilancia_personal (tipo, parametros, descripcion, empleado_codigo, persona)
  values (p_tipo, jsonb_strip_nulls(jsonb_build_object('proveedor_codigo', v_prov, 'pedido', v_ped, 'articulo_codigo', v_art, 'cliente_codigo', v_cli)),
          coalesce(nullif(btrim(p_descripcion), ''), v_desc), v_emp, v_persona)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'vigilancia', v_id, 'aviso', 'Hecho: Virgilio lo vigila (mira cada 10 minutos) y te avisará en «Mis tareas pendientes». ' || coalesce(nullif(btrim(p_descripcion), ''), v_desc) || '.');
end $$;
revoke all on function public.fn_vigilancia_pedir(text, jsonb, text) from public, anon;
grant execute on function public.fn_vigilancia_pedir(text, jsonb, text) to authenticated;

-- Las mías (o todas, si es administrador y lo pide).
create or replace function public.fn_vigilancias_mias(p_todas boolean default false)
returns table (id bigint, descripcion text, persona text, creada_en timestamptz, cumplida_en timestamptz)
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select v.id, v.descripcion, v.persona, v.creada_en, v.cumplida_en from vigilancia_personal v
   where v.quitada_en is null and (v.cumplida_en is null or v.cumplida_en > now() - interval '7 days')
     and (v.empleado_codigo = fn_empleado_actual() or (p_todas and fn_es_administrador()))
   order by v.cumplida_en nulls first, v.id desc
$$;
revoke all on function public.fn_vigilancias_mias(boolean) from public, anon;
grant execute on function public.fn_vigilancias_mias(boolean) to authenticated;

create or replace function public.fn_vigilancia_quitar(p_id bigint)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  update vigilancia_personal set quitada_en = now()
   where id = p_id and quitada_en is null and (empleado_codigo = fn_empleado_actual() or fn_es_administrador());
  if not found then raise exception 'No tienes ninguna vigilancia %.', p_id; end if;
  return jsonb_build_object('ok', true, 'aviso', 'Quitada: Virgilio deja de vigilarlo.');
end $$;
revoke all on function public.fn_vigilancia_quitar(bigint) from public, anon;
grant execute on function public.fn_vigilancia_quitar(bigint) to authenticated;

-- Mira las vigilancias vivas; las que se cumplen dan su tarea y quedan cumplidas. Devuelve cuántas se cumplieron.
create or replace function public.fn_virgilio_personales()
returns integer language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare r record; v_ok boolean; v_det text; v_inc bigint; n integer := 0;
begin
  for r in select * from vigilancia_personal where cumplida_en is null and quitada_en is null loop
    v_ok := false; v_det := null;
    if r.tipo = 'pedido_proveedor' then
      select true, array_to_string((array_agg(p.oficina || '-' || p.numero))[1:5], ', ') into v_ok, v_det
        from gw_pedido_proveedor p
       where coalesce(p.recibido, false) and p.copiado_en >= r.creada_en
         and (case when r.parametros ? 'pedido' then p.oficina || '-' || p.numero = r.parametros->>'pedido'
                   else p.proveedor_codigo = r.parametros->>'proveedor_codigo' end)
      having count(*) > 0;
      if v_ok then v_det := 'Ha llegado: pedido ' || v_det || '.'; end if;
    elsif r.tipo = 'articulo_stock' then
      select true, 'Stock ahora: ' || trim(to_char(sum(s.cantidad_actual), 'FM999G999D##')) || ' uds.' into v_ok, v_det
        from articulo_almacen_stock s where s.articulo_codigo = r.parametros->>'articulo_codigo'
      having sum(s.cantidad_actual) > 0;
    elsif r.tipo = 'cliente_compra' then
      select true, count(*) || case when count(*) = 1 then ' movimiento: ' else ' movimientos: ' end || array_to_string((array_agg(x.que order by x.que desc))[1:3], ', ') || case when count(*) > 3 then '…' else '' end
        into v_ok, v_det from (
        select 'venta ' || v.oficina || '-' || v.id_venta as que from gw_venta v
         where v.cliente_codigo = r.parametros->>'cliente_codigo' and v.fecha >= r.creada_en::date and coalesce(v.alta_en, v.copiado_en) >= r.creada_en
        union all
        select 'pedido ' || p.oficina || '-' || p.id_pedido from gw_pedido_cliente p
         where p.cliente_codigo = r.parametros->>'cliente_codigo' and p.fecha >= r.creada_en::date and coalesce(p.alta_en, p.copiado_en) >= r.creada_en
           and not coalesce(p.presupuesto, false)) x
      having count(*) > 0;
      if v_ok then v_det := 'Ha hecho: ' || v_det || '.'; end if;
    end if;
    if coalesce(v_ok, false) then
      insert into incidencia (tipo, titulo, descripcion, prioridad, estado, reportado_por, asignado)
      values ('tarea', 'Aviso que pediste a Virgilio: ' || left(r.descripcion, 160), v_det || E'\nCuando lo hayas visto, márcala como resuelta.', 'normal', 'abierta', 'Virgilio', r.persona)
      returning id into v_inc;
      update vigilancia_personal set cumplida_en = now(), incidencia_id = v_inc where id = r.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.fn_virgilio_personales() from public, anon, authenticated;

-- ── En la pasada de Virgilio ─────────────────────────────────────────────────────────────────────────────────────
do $$
declare d text := pg_get_functiondef('public.fn_virgilio_pasada()'::regprocedure);
begin
  if position('fn_virgilio_cuadre' in d) = 0 then
    d := replace(d, 'v_resumen text;', 'v_resumen text; v_cuadre text[]; v_pers integer := 0;');
    d := replace(d, '    v_resumen := format(',
      '    select coalesce(array_agg(format(''%s %s: GeminisWin %s € (%s) · ERP %s € (%s)'', to_char(dia, ''DD/MM''), que, gw_total, gw_n, erp_total, erp_n)), ''{}'')' || chr(10)
      || '      into v_cuadre from fn_virgilio_cuadre(7) where fn_virgilio_activa(''cuadre'');' || chr(10)
      || '    perform fn_virgilio_aviso(''cuadre'', coalesce((select valor #>> ''{}'' from parametro where clave = ''vigilante.sistema_para''), ''Rober''),' || chr(10)
      || '      cardinality(v_cuadre), format(''Ventas o cobros que no cuadran entre el ERP y GeminisWin: %s'', cardinality(v_cuadre)), array_to_string(v_cuadre, E''\n''), null, ''alta'');' || chr(10)
      || '    if fn_virgilio_activa(''personales'') then v_pers := fn_virgilio_personales(); end if;' || chr(10)
      || '    v_resumen := format(');
    d := replace(d, '''Resueltas sin imprimir: %s · presupuestos sin seguimiento: %s · problemas del sistema: %s'', v_res, v_pres, cardinality(v_sis));',
      '''Resueltas sin imprimir: %s · presupuestos sin seguimiento: %s · problemas del sistema: %s · días sin cuadrar: %s · avisos personales dados: %s'', v_res, v_pres, cardinality(v_sis), cardinality(v_cuadre), v_pers);');
    if position('fn_virgilio_personales' in d) = 0 or position('días sin cuadrar' in d) = 0 then
      raise exception 'No se pudo añadir el cuadre y las vigilancias personales a fn_virgilio_pasada';
    end if;
    execute d;
  end if;
end $$;

-- Hub y NEXA: lo pendiente del cuadre y cuántas vigilancias personales hay vivas.
do $$
declare d text := pg_get_functiondef('public.fn_agente_resumen_publico(text)'::regprocedure);
begin
  if position('vigilancias_personales' in d) = 0 then
    d := replace(d, '''problemas_sistema'', coalesce(sum(v.cantidad) filter (where v.clave = ''sistema''), 0))',
      '''problemas_sistema'', coalesce(sum(v.cantidad) filter (where v.clave = ''sistema''), 0), '
      || '''dias_sin_cuadrar'', coalesce(sum(v.cantidad) filter (where v.clave = ''cuadre''), 0), '
      || '''vigilancias_personales'', (select count(*) from vigilancia_personal p where p.cumplida_en is null and p.quitada_en is null))');
    if position('vigilancias_personales' in d) = 0 then raise exception 'No se pudo ampliar fn_agente_resumen_publico'; end if;
    execute d;
  end if;
end $$;

insert into public.nexa_operacion (codigo, descripcion, tipo, objeto, accion, nivel, permiso, bloqueada, notas)
values ('funcion:fn_vigilancia_pedir', 'Pedir a Virgilio que vigile algo y avise («avísame cuando…»)', 'funcion', 'fn_vigilancia_pedir', '*', 2, null, false,
        'Tipos: pedido_proveedor {proveedor_codigo | pedido "oficina-numero"}, articulo_stock {articulo_codigo}, cliente_compra {cliente_codigo}. Busca antes el código.'),
       ('funcion:fn_vigilancias_mias', 'Mis avisos pedidos a Virgilio', 'funcion', 'fn_vigilancias_mias', '*', 1, null, false, null),
       ('funcion:fn_vigilancia_quitar', 'Quitar un aviso pedido a Virgilio', 'funcion', 'fn_vigilancia_quitar', '*', 2, null, false, null),
       ('funcion:fn_virgilio_cuadre', 'Cuadre de ventas y cobros ERP–GeminisWin (días que no coinciden)', 'funcion', 'fn_virgilio_cuadre', '*', 1, null, false, null)
on conflict (codigo) do update set descripcion = excluded.descripcion, nivel = excluded.nivel, bloqueada = false, notas = excluded.notas;
