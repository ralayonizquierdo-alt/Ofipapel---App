-- Geminio recibe encargos por NEXA (Rober, 23/11/2026: «si alguien necesitara algún dato de GeminisWin, ¿se lo podría
-- pedir mediante NEXA a Geminio?»). Lo que ya está en el espejo NEXA lo lee directamente (tablas gw_* y carga_dbf);
-- a Geminio solo se le encarga lo que NO está en el ERP (un listado concreto de GeminisWin).
--   · NEXA (nivel 2, la persona dice «sí»): fn_agente_ordenar('geminis_pc', 'listado', {"que": "…", "desde": …, "hasta": …}).
--   · El programa del PC de Rober recoge los encargos con fn_agente_ordenes_pendientes y entrega con
--     fn_agente_orden_terminar (filas en resultado_datos, como mucho ~2 MB). Solo cuando el PC está encendido.
--   · Lo puede pedir quien tenga el permiso de Listados (o un administrador).

alter table public.agente_orden add column if not exists resultado_datos jsonb;
comment on column public.agente_orden.resultado_datos is 'Lo que entrega el agente (p. ej. las filas del listado de GeminisWin que pidió NEXA).';

update public.agente set ordenes = array['listado'], permiso = '/listados' where codigo = 'geminis_pc';

create or replace function public.fn_agente_ordenes_pendientes(p_agente text, p_clave text)
returns table (orden bigint, tipo text, parametros jsonb, pedida_por text, pedida_en timestamptz)
language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  if length(coalesce(p_clave, '')) < 32 or not exists (
       select 1 from agente_clave where agente = p_agente and huella = encode(sha256(convert_to(p_clave, 'UTF8')), 'hex')) then
    raise exception 'Clave del agente incorrecta.' using errcode = '42501';
  end if;
  return query select o.id, o.orden, o.parametros, o.pedida_por, o.pedida_en from agente_orden o
                where o.agente = p_agente and o.estado = 'pendiente' order by o.id;
end $$;
revoke all on function public.fn_agente_ordenes_pendientes(text, text) from public;
grant execute on function public.fn_agente_ordenes_pendientes(text, text) to anon, authenticated;

create or replace function public.fn_agente_orden_terminar(p_agente text, p_clave text, p_orden bigint, p_ok boolean, p_resultado text,
                                                           p_datos jsonb default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  if length(coalesce(p_clave, '')) < 32 or not exists (
       select 1 from agente_clave where agente = p_agente and huella = encode(sha256(convert_to(p_clave, 'UTF8')), 'hex')) then
    raise exception 'Clave del agente incorrecta.' using errcode = '42501';
  end if;
  if p_datos is not null and pg_column_size(p_datos) > 2500000 then raise exception 'El resultado es demasiado grande (máx. ~2 MB): acota el periodo.'; end if;
  update agente_orden set estado = case when coalesce(p_ok, false) then 'hecha' else 'error' end, resultado = left(p_resultado, 1000),
                          resultado_datos = p_datos, hecha_en = now()
   where id = p_orden and agente = p_agente and estado = 'pendiente';
  if not found then raise exception 'No hay ningún encargo pendiente %.', p_orden; end if;
  insert into agente_actividad (agente, tarea, resumen, ok) values (p_agente, 'encargo_nexa', left(p_resultado, 300), coalesce(p_ok, false));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.fn_agente_orden_terminar(text, text, bigint, boolean, text, jsonb) from public;
grant execute on function public.fn_agente_orden_terminar(text, text, bigint, boolean, text, jsonb) to anon, authenticated;

-- fn_agente_ordenar: un «listado» tiene que decir qué se pide.
do $$
declare d text := pg_get_functiondef('public.fn_agente_ordenar(text,text,jsonb)'::regprocedure);
begin
  if position('Para «listado»' in d) = 0 then
    d := replace(d, '  insert into agente_orden (agente, orden, parametros, estado, resultado, hecha_en)',
      '  if p_orden = ''listado'' and coalesce(btrim(p_parametros->>''que''), '''') = '''' then' || chr(10)
      || '    raise exception ''Para «listado» hace falta decir qué listado de GeminisWin: {"que": "…", "desde": "AAAA-MM-DD", "hasta": "AAAA-MM-DD"}.'';' || chr(10)
      || '  end if;' || chr(10)
      || '  insert into agente_orden (agente, orden, parametros, estado, resultado, hecha_en)');
    d := replace(d, 'else ''Orden enviada: el agente la hace ahora mismo (puede tardar unos minutos).'' end',
      'else case when a.funcion is null then ''Encargo apuntado: el agente lo recoge cuando su PC esté encendido; el resultado sale en el informe de agentes.'''
      || ' else ''Orden enviada: el agente la hace ahora mismo (puede tardar unos minutos).'' end end');
    if position('Para «listado»' in d) = 0 or position('Encargo apuntado' in d) = 0 then raise exception 'No se pudo ampliar fn_agente_ordenar'; end if;
    execute d;
  end if;
end $$;
