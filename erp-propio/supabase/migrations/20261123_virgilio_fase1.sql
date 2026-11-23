-- Virgilio, fase 1 (Rober, 23/11/2026: «tiene que quedar ya todo más o menos funcionando y configurado para trabajar»).
-- Cada 10 minutos (pg_cron erp_vigilante) fn_virgilio_pasada mira tres cosas y avisa con una tarea en «Mis tareas
-- pendientes» (tabla incidencia, tipo tarea) a quien le toca. Una tarea viva por vigilancia y persona: se actualiza sola
-- y se da por resuelta sola cuando el asunto desaparece. Solo lee: no cambia peticiones, presupuestos ni nada más.
--   1) peticiones resueltas sin imprimir         → parámetro vigilante.resueltas_para (por defecto Rober)
--   2) presupuestos sin seguimiento N días        → el comercial del presupuesto (vigilante.presupuestos_dias, 7)
--   3) estado del sistema (espejo GW, tareas automáticas fallidas, E-milio) → vigilante.sistema_para (Rober)
-- Wasimara (bot de WhatsApp) vive en otro servidor: no se puede mirar desde aquí (fase 2).
-- Documento: docs/AGENTE_VIRGILIO.md.

insert into public.parametro (clave, valor, descripcion) values
  ('vigilante.resueltas_para', '"Rober"', 'Virgilio: a quién le sale la tarea «peticiones resueltas para imprimir» (nombre como en «Le toca a…»; varios con « / »).'),
  ('vigilante.presupuestos_dias', '7', 'Virgilio: días sin movimiento de un presupuesto enviado o en seguimiento para avisar a su comercial.'),
  ('vigilante.presupuestos_sin_comercial', '"Rober"', 'Virgilio: a quién avisar de los presupuestos sin seguimiento que no tienen comercial.'),
  ('vigilante.sistema_para', '"Rober"', 'Virgilio: a quién avisar si algo del sistema se para (espejo de GeminisWin, tareas automáticas, E-milio).')
on conflict (clave) do nothing;

-- Qué tarea de «Mis tareas» corresponde a cada aviso (vigilancia + persona).
create table if not exists public.vigilancia_aviso (
  clave text primary key,
  incidencia_id bigint not null,
  persona text not null,
  cantidad integer not null default 0,
  actualizado_en timestamptz not null default now()
);
comment on table public.vigilancia_aviso is 'Virgilio: la tarea de «Mis tareas pendientes» (incidencia) viva de cada vigilancia y persona.';
alter table public.vigilancia_aviso enable row level security;
do $$
begin
  if not exists (select 1 from pg_policy where polname = 'vigilancia_aviso_lee') then
    create policy vigilancia_aviso_lee on public.vigilancia_aviso for select to authenticated using ((select public.fn_es_administrador()));
  end if;
end $$;
revoke all on public.vigilancia_aviso from anon;

-- Nombre corto del empleado, como lo usa «Mis tareas» (primera palabra, Capitalizada).
create or replace function public.fn_virgilio_nombre(p_nombre text)
returns text language sql immutable set search_path to 'public', 'pg_temp' as $$
  select nullif(initcap(lower(split_part(btrim(coalesce(p_nombre, '')), ' ', 1))), '')
$$;

-- Presupuestos enviados o en seguimiento sin movimiento en N días (ni contacto, ni correo) o con el próximo contacto pasado.
create or replace function public.fn_virgilio_presupuestos(p_dias integer default null)
returns table (tienda text, numero bigint, cliente text, ultimo_movimiento timestamptz, proximo_contacto date, comercial text)
language sql stable set search_path to 'public', 'pg_temp' as $$
  with d as (select coalesce(p_dias, (select (valor #>> '{}')::integer from parametro where clave = 'vigilante.presupuestos_dias'), 7) as dias),
  p as (
    select pc.tienda_terminal_codigo, pc.numero, pc.cliente_codigo, pc.vendedor_codigo, pc.empleado_codigo,
           greatest(pc.fecha::timestamptz,
                    (select max(greatest(c.creado_en, c.fecha::timestamptz)) from presupuesto_contacto c where c.tienda_terminal_codigo = pc.tienda_terminal_codigo and c.numero = pc.numero),
                    (select max(m.enviado_en) from presupuesto_correo m where m.tienda_terminal_codigo = pc.tienda_terminal_codigo and m.numero = pc.numero)) as ultimo,
           (select c.proximo_contacto from presupuesto_contacto c where c.tienda_terminal_codigo = pc.tienda_terminal_codigo and c.numero = pc.numero
             order by c.orden desc, c.id desc limit 1) as proximo
      from pedido_cliente pc
     where pc.presupuesto_estado in ('enviado', 'seguimiento') and coalesce(pc.aceptado, false) = false
       -- Fuera los de prueba (tienda 01 y clientes ZZ, Condiciones de Programación).
       and pc.tienda_terminal_codigo <> '01' and coalesce(pc.cliente_codigo, '') not ilike 'ZZ%'
  )
  select p.tienda_terminal_codigo, p.numero, coalesce(cl.nombre, p.cliente_codigo), p.ultimo, p.proximo,
         coalesce(fn_virgilio_nombre((select e.nombre from empleado e where e.vendedor_codigo = p.vendedor_codigo and coalesce(e.activo, true) order by e.codigo limit 1)),
                  fn_virgilio_nombre((select e.nombre from empleado e where e.codigo = p.empleado_codigo)),
                  (select valor #>> '{}' from parametro where clave = 'vigilante.presupuestos_sin_comercial'), 'Rober')
    from p cross join d
    left join cliente cl on cl.codigo = p.cliente_codigo
   where p.ultimo < now() - make_interval(days => d.dias) or p.proximo < current_date
   order by p.ultimo
$$;
revoke all on function public.fn_virgilio_presupuestos(integer) from public, anon;
grant execute on function public.fn_virgilio_presupuestos(integer) to authenticated;

-- Problemas del sistema ahora mismo (una línea por problema).
create or replace function public.fn_virgilio_sistema()
returns table (problema text)
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  with ahora as (select now() at time zone 'Atlantic/Canary' as h)
  -- Espejo de GeminisWin: pasa cada ~10 min en horario de tienda. Más de una hora callado = algo va mal en el PC.
  select 'El espejo de GeminisWin no envía nada desde el ' || to_char((select max(en) from espejo_gw_pasada) at time zone 'Atlantic/Canary', 'DD/MM HH24:MI')
         || ' (revisar el PC del espejo).'
    from ahora
   where ((extract(isodow from h) <= 5 and h::time between '08:45' and '19:30') or (extract(isodow from h) = 6 and h::time between '09:15' and '13:30'))
     and coalesce((select max(en) from espejo_gw_pasada), '-infinity') < now() - interval '60 minutes'
  union all
  select 'El espejo de GeminisWin ha dado ' || count(*) || ' errores en la última hora (' || string_agg(distinct tabla, ', ') || ').'
    from espejo_gw_pasada where en > now() - interval '60 minutes' and error is not null
  having count(*) > 0
  union all
  -- Tareas automáticas (correos, E-milio, auditoría…) que han fallado en las dos últimas horas.
  select 'La tarea automática «' || j.jobname || '» ha fallado ' || count(*) || ' veces en las dos últimas horas.'
    from cron.job_run_details r join cron.job j on j.jobid = r.jobid
   where r.start_time > now() - interval '2 hours' and r.status = 'failed'
   group by j.jobname
  union all
  -- E-milio: error de verdad (no el «sin claves», que es esperar a la conexión de Microsoft).
  select 'E-milio (correo de proveedores) da error: ' || left(v.ultimo_error, 200)
    from correo_vigilancia v join agente a on a.codigo = 'correo_proveedores' and a.activo
   where v.ultimo_error is not null and v.ultimo_error not ilike 'Sin claves de lectura%'
$$;
revoke all on function public.fn_virgilio_sistema() from public, anon;
grant execute on function public.fn_virgilio_sistema() to authenticated;

-- Mantiene la tarea de un aviso: la crea o la actualiza si hay algo (p_cantidad > 0); si no, la da por resuelta.
create or replace function public.fn_virgilio_aviso(p_clave text, p_persona text, p_cantidad integer, p_titulo text, p_descripcion text,
                                                    p_pantalla text, p_prioridad text default 'normal')
returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v vigilancia_aviso; v_abierta boolean;
begin
  select * into v from vigilancia_aviso where clave = p_clave;
  v_abierta := found and exists (select 1 from incidencia i where i.id = v.incidencia_id and i.estado in ('abierta', 'en_curso'));
  if coalesce(p_cantidad, 0) > 0 then
    if v_abierta then
      update incidencia set titulo = p_titulo, descripcion = p_descripcion, asignado = p_persona, prioridad = p_prioridad, actualizado_en = now()
       where id = v.incidencia_id and (titulo, coalesce(descripcion, ''), coalesce(asignado, ''), prioridad) is distinct from (p_titulo, coalesce(p_descripcion, ''), coalesce(p_persona, ''), p_prioridad);
      update vigilancia_aviso set cantidad = p_cantidad, persona = p_persona, actualizado_en = now() where clave = p_clave;
    else
      insert into incidencia (tipo, titulo, descripcion, pantalla, prioridad, estado, reportado_por, asignado)
      values ('tarea', p_titulo, p_descripcion, p_pantalla, p_prioridad, 'abierta', 'Virgilio', p_persona)
      returning id into v.incidencia_id;
      insert into vigilancia_aviso (clave, incidencia_id, persona, cantidad) values (p_clave, v.incidencia_id, p_persona, p_cantidad)
      on conflict (clave) do update set incidencia_id = excluded.incidencia_id, persona = excluded.persona, cantidad = excluded.cantidad, actualizado_en = now();
    end if;
  elsif v_abierta then
    update incidencia set estado = 'resuelta', resuelta_en = now(), solucion = 'Virgilio: ya no queda nada pendiente.', actualizado_en = now()
     where id = v.incidencia_id;
    update vigilancia_aviso set cantidad = 0, actualizado_en = now() where clave = p_clave;
  end if;
end $$;
revoke all on function public.fn_virgilio_aviso(text, text, integer, text, text, text, text) from public, anon, authenticated;

-- La pasada de Virgilio (pg_cron cada 10 minutos, o la orden «pasar_ahora» de NEXA).
create or replace function public.fn_virgilio_pasada()
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_res integer; v_res_prov integer; v_para text; v_dias integer; v_sis text[]; v_pres integer := 0; r record; v_vivas text[] := '{}';
  v_resumen text;
begin
  if not exists (select 1 from agente where codigo = 'vigilante' and activo) then
    return jsonb_build_object('ok', false, 'motivo', 'Virgilio está parado.');
  end if;
  begin
    -- 1) Peticiones resueltas sin imprimir.
    select count(*), count(distinct coalesce(proveedor_codigo, '')) into v_res, v_res_prov from fn_peticiones_resueltas(60, false);
    v_para := coalesce((select valor #>> '{}' from parametro where clave = 'vigilante.resueltas_para'), 'Rober');
    perform fn_virgilio_aviso('resueltas', v_para, v_res,
      format('Imprimir peticiones resueltas para el almacén: %s de %s %s', v_res, v_res_prov, case when v_res_prov = 1 then 'proveedor' else 'proveedores' end),
      'La mercancía ya llegó. Gestor 2.0 → Peticiones de clientes → botón «Resueltas» (abajo): imprimir por proveedor y marcarlas como impresas. Esta tarea se cierra sola.',
      '/gestor-pedidos-proveedor/semanal?vista=peticiones');

    -- 2) Presupuestos sin seguimiento: una tarea por comercial.
    v_dias := coalesce((select (valor #>> '{}')::integer from parametro where clave = 'vigilante.presupuestos_dias'), 7);
    for r in select comercial, count(*) n, string_agg(tienda || '-' || numero || ' ' || coalesce(cliente, ''), E'\n' order by ultimo_movimiento) lista
               from fn_virgilio_presupuestos(v_dias) group by comercial loop
      v_pres := v_pres + r.n;
      v_vivas := v_vivas || ('presupuestos:' || r.comercial);
      perform fn_virgilio_aviso('presupuestos:' || r.comercial, r.comercial, r.n::integer,
        format('Presupuestos sin seguimiento hace más de %s días: %s', v_dias, r.n),
        'Llamar o escribir al cliente y apuntarlo en el SEGUIMIENTO del presupuesto (o marcarlo aceptado/perdido). Se cierra sola.' || E'\n' || r.lista,
        '/presupuestos');
    end loop;
    -- Los comerciales que ya no tienen ninguno: su tarea se cierra.
    for r in select clave, persona from vigilancia_aviso where clave like 'presupuestos:%' and not (clave = any (v_vivas)) loop
      perform fn_virgilio_aviso(r.clave, r.persona, 0, '', null, null);
    end loop;

    -- 3) Estado del sistema.
    select coalesce(array_agg(problema), '{}') into v_sis from fn_virgilio_sistema();
    perform fn_virgilio_aviso('sistema', coalesce((select valor #>> '{}' from parametro where clave = 'vigilante.sistema_para'), 'Rober'),
      cardinality(v_sis), 'Algo del sistema se ha parado: ' || coalesce(v_sis[1], ''), array_to_string(v_sis, E'\n'), null, 'alta');

    v_resumen := format('Resueltas sin imprimir: %s · presupuestos sin seguimiento: %s · problemas del sistema: %s', v_res, v_pres, cardinality(v_sis));
    update agente set ultima_pasada = now(), ultimo_error = null, ultimo_resumen = v_resumen, actualizado_en = now() where codigo = 'vigilante';
    update agente_orden set estado = 'hecha', resultado = v_resumen, hecha_en = now() where agente = 'vigilante' and estado = 'pendiente';
    return jsonb_build_object('ok', true, 'resueltas', v_res, 'presupuestos', v_pres, 'sistema', to_jsonb(v_sis));
  exception when others then
    update agente set ultima_pasada = now(), ultimo_error = left(sqlerrm, 500), actualizado_en = now() where codigo = 'vigilante';
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;
end $$;
revoke all on function public.fn_virgilio_pasada() from public, anon, authenticated;

-- Encender a Virgilio con su descripción de fase 1.
update public.agente set activo = true, cada = 'cada 10 minutos',
  ordenes = array['pasar_ahora', 'pausar', 'reanudar']
 where codigo = 'vigilante';

-- El informe de agentes (NEXA) dice qué tiene pendiente Virgilio.
do $$
declare d text := pg_get_functiondef('public.fn_agentes_estado()'::regprocedure);
begin
  if position('''vigilante''' in d) = 0 then
    d := replace(d, 'from correo_proveedor_documento d) end',
                 'from correo_proveedor_documento d) when ''vigilante'' then (select coalesce(jsonb_object_agg(v.clave, v.cantidad), ''{}''::jsonb) from vigilancia_aviso v where v.cantidad > 0) end');
    if position('''vigilante''' in d) = 0 then raise exception 'No se pudo añadir Virgilio a fn_agentes_estado'; end if;
    execute d;
  end if;
end $$;

select cron.schedule('erp_vigilante', '5-59/10 * * * *', 'select public.fn_virgilio_pasada()');
