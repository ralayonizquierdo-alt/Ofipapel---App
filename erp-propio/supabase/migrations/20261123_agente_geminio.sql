-- Geminio, el agente de GeminisWin en el PC de Rober (Rober, 23/11/2026: «¿esto no se puede convertir en un agente
-- al igual que los otros?»). Es el proceso de C:\Ofipapel\Herramientas (listados para Finanzas, cada día laborable a
-- las 9:50) y las órdenes de informática que Rober da a su Cowork. Ver docs/COWORK_TAREAS.md.
--
-- Trabaja en un PC, no en el servidor: para que su ficha diga qué ha hecho, el programa avisa al ERP al terminar cada
-- trabajo con fn_agente_informar (clave propia del agente: en la base de datos solo está su huella SHA-256).
-- La clave la crea el Cowork en el PC y registra su huella con fn_agente_registrar_clave mientras el registro está
-- abierto (parámetro agentes.registro_abierto, 72 h; una sola vez: después solo un administrador puede cambiarla).
-- Virgilio avisa si un día laborable a las 11:00 no ha llegado el trabajo diario.

insert into public.agente (codigo, nombre, que_hace, funcion, cada, permiso, ordenes, activo)
values ('geminis_pc', 'Geminio',
  'Trabaja dentro de GeminisWin desde el PC de Rober (C:\Ofipapel\Herramientas). Cada día laborable a las 9:50 sube a Finanzas '
  || 'las ventas por caja y los pedidos sin actualizar; el día 10, el Excel completo del mes anterior (carpeta LISTADOS AUTOMATIZADOS, '
  || 'correo y Finanzas); el día 20, ventas por vendedor; el último día laborable, pedidos a proveedor sin actualizar; los lunes, '
  || 'inventarios semanales (en pausa hasta el 01/12). A petición de Rober: pedido semanal de informática e importación de los pedidos '
  || 'de UFP, EXADI e INFORPOR. Si el PC está apagado no trabaja (lo vigila Virgilio).',
  null, 'cada día laborable a las 9:50 (PC de Rober)', null, array[]::text[], true)
on conflict (codigo) do update set nombre = excluded.nombre, que_hace = excluded.que_hace, cada = excluded.cada, activo = true;

create table if not exists public.agente_clave (
  agente text primary key references public.agente(codigo),
  huella text not null check (huella ~ '^[0-9a-f]{64}$'),
  registrada_en timestamptz not null default now()
);
comment on table public.agente_clave is 'Huella SHA-256 de la clave con la que un agente de PC avisa al ERP (la clave vive solo en ese PC).';
alter table public.agente_clave enable row level security;
revoke all on public.agente_clave from anon, authenticated;

create table if not exists public.agente_actividad (
  id bigint generated always as identity primary key,
  agente text not null references public.agente(codigo),
  tarea text not null,
  resumen text,
  ok boolean not null default true,
  detalle jsonb not null default '{}'::jsonb,
  equipo text,
  en timestamptz not null default now()
);
comment on table public.agente_actividad is 'Lo que hacen los agentes de PC (Geminio): una fila por trabajo terminado, con su resumen.';
create index if not exists agente_actividad_agente_en_idx on public.agente_actividad (agente, en desc);
alter table public.agente_actividad enable row level security;
do $$
begin
  if not exists (select 1 from pg_policy where polname = 'agente_actividad_lee') then
    create policy agente_actividad_lee on public.agente_actividad for select to authenticated
      using (exists (select 1 from public.agente a where a.codigo = agente
                     and ((select public.fn_es_administrador()) or (a.permiso is not null and (select public.fn_puede(a.permiso))))));
  end if;
end $$;
revoke all on public.agente_actividad from anon;

insert into public.parametro (clave, valor, descripcion)
values ('agentes.registro_abierto', jsonb_build_object('geminis_pc', to_char(now() + interval '72 hours', 'YYYY-MM-DD"T"HH24:MI:SSOF')),
        'Agentes de PC que pueden registrar su clave y hasta cuándo ({"agente": "fecha"}). Se cierra solo al registrarla.')
on conflict (clave) do update set valor = public.parametro.valor || excluded.valor;

-- Registrar la huella de la clave (la llama el Cowork desde el PC, una vez). Sin sesión: el permiso es la ventana abierta.
create or replace function public.fn_agente_registrar_clave(p_agente text, p_huella text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_hasta timestamptz;
begin
  v_hasta := nullif((select valor->>p_agente from parametro where clave = 'agentes.registro_abierto'), '')::timestamptz;
  if v_hasta is null or v_hasta < now() then
    raise exception 'El registro de clave del agente % no está abierto: pídeselo a un administrador.', p_agente using errcode = '42501';
  end if;
  if exists (select 1 from agente_clave where agente = p_agente) then
    raise exception 'El agente % ya tiene clave registrada.', p_agente using errcode = '42501';
  end if;
  if lower(coalesce(p_huella, '')) !~ '^[0-9a-f]{64}$' then raise exception 'La huella tiene que ser un SHA-256 en hexadecimal (64 caracteres).'; end if;
  insert into agente_clave (agente, huella) values (p_agente, lower(p_huella));
  update parametro set valor = valor - p_agente, actualizado_en = now() where clave = 'agentes.registro_abierto';
  return jsonb_build_object('ok', true, 'aviso', 'Clave registrada. Ya puedes avisar al ERP con fn_agente_informar.');
end $$;
revoke all on function public.fn_agente_registrar_clave(text, text) from public;
grant execute on function public.fn_agente_registrar_clave(text, text) to anon, authenticated;

-- Avisar de un trabajo terminado (desde el PC). Tareas de Geminio: diario, listados_mes, ventas_vendedor,
-- pedidos_sin_actualizar, inventarios, cifrado, pedido_informatica, importar_informatica.
create or replace function public.fn_agente_informar(p_agente text, p_clave text, p_tarea text, p_resumen text default null,
                                                     p_ok boolean default true, p_detalle jsonb default '{}'::jsonb, p_equipo text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  if length(coalesce(p_clave, '')) < 32 or not exists (
       select 1 from agente_clave where agente = p_agente and huella = encode(sha256(convert_to(p_clave, 'UTF8')), 'hex')) then
    raise exception 'Clave del agente incorrecta.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_tarea), '') = '' or length(p_tarea) > 40 then raise exception 'Falta la tarea (texto corto).'; end if;
  insert into agente_actividad (agente, tarea, resumen, ok, detalle, equipo)
  values (p_agente, lower(btrim(p_tarea)), left(p_resumen, 500), coalesce(p_ok, true), coalesce(p_detalle, '{}'::jsonb), left(p_equipo, 40));
  update agente set ultima_pasada = now(), ultimo_resumen = left(p_resumen, 500),
                    ultimo_error = case when coalesce(p_ok, true) then null else left(coalesce(p_resumen, 'Error sin detalle'), 500) end,
                    actualizado_en = now()
   where codigo = p_agente;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.fn_agente_informar(text, text, text, text, boolean, jsonb, text) from public;
grant execute on function public.fn_agente_informar(text, text, text, text, boolean, jsonb, text) to anon, authenticated;

-- Hub (solo números y estado) y NEXA: lo de hoy de Geminio.
do $$
declare d text := pg_get_functiondef('public.fn_agente_resumen_publico(text)'::regprocedure);
begin
  if position('geminis_pc' in d) = 0 then
    d := replace(d, 'when p_agente = ''vigilante'' then (select jsonb_build_object(''peticiones_impresas''',
      'when p_agente = ''geminis_pc'' then (select jsonb_build_object('
      || '''conectado'', exists (select 1 from agente_clave k where k.agente = ''geminis_pc''), '
      || '''tareas'', coalesce((select jsonb_agg(distinct t.tarea) from agente_actividad t where t.agente = ''geminis_pc'' and t.ok and t.en >= hoy.desde), ''[]''::jsonb), '
      || '''fallos'', (select count(*) from agente_actividad t where t.agente = ''geminis_pc'' and not t.ok and t.en >= hoy.desde)) from hoy) '
      || 'when p_agente = ''vigilante'' then (select jsonb_build_object(''peticiones_impresas''');
    if position('geminis_pc' in d) = 0 then raise exception 'No se pudo añadir Geminio a fn_agente_resumen_publico'; end if;
    execute d;
  end if;
end $$;

-- Virgilio: si Geminio está conectado y un día laborable a las 11:00 no ha hecho el trabajo diario, o algo le falló hoy.
do $$
declare d text := pg_get_functiondef('public.fn_virgilio_sistema()'::regprocedure);
begin
  if position('geminis_pc' in d) = 0 then
    d := replace(d, '  union all' || chr(10) || '  select ''E-milio (correo de proveedores) da error: ''',
      '  union all' || chr(10)
      || '  select ''Geminio no ha subido hoy los listados diarios a Finanzas (¿PC de Rober apagado a las 9:50?).''' || chr(10)
      || '    from ahora where extract(isodow from h) <= 5 and h::time >= ''11:00''' || chr(10)
      || '     and exists (select 1 from agente_clave k join agente a on a.codigo = k.agente and a.activo where k.agente = ''geminis_pc'')' || chr(10)
      || '     and not exists (select 1 from agente_actividad t where t.agente = ''geminis_pc'' and t.tarea = ''diario'' and t.ok' || chr(10)
      || '                     and t.en >= date_trunc(''day'', now() at time zone ''Atlantic/Canary'') at time zone ''Atlantic/Canary'')' || chr(10)
      || '  union all' || chr(10)
      || '  select ''Geminio: falló «'' || t.tarea || ''»: '' || left(coalesce(t.resumen, ''sin detalle''), 150)' || chr(10)
      || '    from agente_actividad t where t.agente = ''geminis_pc'' and not t.ok' || chr(10)
      || '     and t.en >= date_trunc(''day'', now() at time zone ''Atlantic/Canary'') at time zone ''Atlantic/Canary''' || chr(10)
      || '  union all' || chr(10) || '  select ''E-milio (correo de proveedores) da error: ''');
    if position('geminis_pc' in d) = 0 then raise exception 'No se pudo añadir Geminio a fn_virgilio_sistema'; end if;
    execute d;
  end if;
end $$;
