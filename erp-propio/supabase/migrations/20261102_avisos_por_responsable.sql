-- Avisos de auditoría por responsable (Luis, 02/11/2026):
--  · Cada super administrador recibe los avisos de sus grupos (empleado.avisos_grupos): «todo» (el
--    gerente), «ventas» (jefe de ventas), «compras» (jefe de compras), «contabilidad», «seguridad».
--    Seguridad y Contabilidad, por defecto, solo con «todo» (nadie revisa sus propios accesos). Lo que
--    hace un jefe en su departamento lo ve siempre también quien tiene «todo».
--  · Sin ruido: no avisa lo que hace el propio programa (alta de opciones de menú en «permiso», movimientos
--    de stock que se borran al anular una venta).
--  · Dos niveles: «grave» (globo) y «leve» (solo en la Auditoría). Urgentes (sin esperar a la hora):
--    usuario bloqueado por claves y entrada remota sin permiso (más los asientos por firmar).
--  · Aviso nuevo: cambio de cuenta bancaria (IBAN) de un cliente o proveedor y regularización de stock.
--  · El globo sale al entrar y a las horas de cada uno (empleado.avisos_horas, 12:00 y 18:00); a las 18:00,
--    resumen por correo a quien lo pida (empleado.avisos_correo).

alter table public.empleado add column if not exists avisos_grupos text[] not null default '{}';
alter table public.empleado add column if not exists avisos_horas text[] not null default '{12:00,18:00}';
alter table public.empleado add column if not exists avisos_correo boolean not null default false;
comment on column public.empleado.avisos_grupos is 'Avisos de auditoría que recibe (super administradores): todo, ventas, compras, contabilidad, seguridad. Vacío = todo.';
comment on column public.empleado.avisos_horas is 'Horas a las que le sale el globo de avisos (además de al entrar). Los urgentes salen en el momento.';
comment on column public.empleado.avisos_correo is 'Recibe a las 18:00 el resumen de avisos del día por correo.';
update public.empleado set avisos_grupos = '{todo}' where codigo = 'LUIS' and avisos_grupos = '{}';
update public.empleado set avisos_grupos = '{ventas}' where codigo = 'DAVID' and avisos_grupos = '{}';
update public.empleado set avisos_grupos = '{compras}' where codigo = 'ROBER' and avisos_grupos = '{}';

create or replace function public.fn_auditoria_motivo(a public.auditoria)
returns text language sql stable security definer set search_path = public as $$
  select case
    -- Lo que hace el propio programa: no es aviso.
    when a.tabla = 'permiso' then null
    when a.tabla = 'movimiento_stock' and a.operacion = 'DELETE' then null
    when a.operacion = 'FALLO_CLAVE' then
      case when (select count(*) from auditoria b where b.operacion = 'FALLO_CLAVE' and b.registro_pk = a.registro_pk
                   and b.ocurrido_en > a.ocurrido_en - interval '15 minutes' and b.ocurrido_en <= a.ocurrido_en) >= 5
           then 'Usuario bloqueado por claves incorrectas' else 'Contraseña incorrecta' end
    when a.operacion = 'FUERA_HORARIO' then 'Intento fuera de horario'
    when a.operacion = 'REMOTO_DENEGADO' then 'Entrada remota sin permiso'
    when a.operacion = 'USO_RARO' then 'Uso fuera de lo normal'
    when a.operacion in ('EXPORTA', 'IMPRIME') and (a.area = 'contabilidad' or a.registro_pk like '/contabilidad%') then 'Datos de Contabilidad sacados fuera'
    when a.operacion in ('EXPORTA', 'IMPRIME', 'PANTALLA') then null
    when a.tabla = 'ejercicio_contable' and a.operacion = 'UPDATE' and 'cerrado' = any (a.campos) then
      case when a.datos_despues ->> 'cerrado' = 'true' then 'Cierre de ejercicio' else 'Reapertura de ejercicio' end
    when a.tabla = 'contab_mes_cerrado' then
      case when a.datos_despues ->> 'cerrado' = 'true' then 'Cierre de mes' else 'Reapertura de mes' end
    when a.tabla = 'asiento' and a.operacion = 'UPDATE' and a.datos_despues ->> 'estado' = 'anulado' and 'estado' = any (a.campos) then 'Asiento anulado o modificado'
    when a.tabla = 'asiento' and a.operacion = 'INSERT' and a.datos_despues ->> 'origen_tipo' = 'manual'
         and (a.datos_despues ->> 'fecha')::date < date_trunc('month', a.ocurrido_en at time zone 'Atlantic/Canary')::date then 'Asiento con fecha atrasada'
    when a.tabla = 'apunte' and a.operacion = 'INSERT' and (a.datos_despues ->> 'cuenta') ~ '^(570|572|430)'
         and exists (select 1 from asiento s where s.id = (a.datos_despues ->> 'asiento_id')::bigint and s.origen_tipo = 'manual') then 'Asiento manual en caja, bancos o clientes'
    when a.tabla = 'cuenta_contable' then 'Cambio en el plan de cuentas'
    when a.tabla = 'asiento_propuesta' and a.operacion = 'INSERT' then 'Asiento pendiente de segunda firma'
    when a.tabla = 'parametro' and (a.registro_pk like 'contab.%' or a.registro_pk like 'acceso.%') then 'Cambio de parámetros de control'
    when a.tabla = 'red_tienda' then 'Cambio en las redes de las tiendas'
    when a.tabla = 'cuenta_bancaria' or (a.tabla = 'cliente_mandato' and (a.operacion <> 'UPDATE' or a.campos && array['iban', 'bic'])) then 'Cambio de cuenta bancaria'
    when a.tabla = 'regularizacion_stock' and a.operacion = 'INSERT' then 'Regularización de stock'
    when a.operacion = 'DELETE' and a.tabla not like '%\_linea' and a.tabla not in ('articulo_favorito', 'listado_guardado', 'auditoria_aviso_visto')
      then 'Borrado'
    when a.tabla in ('rol', 'rol_permiso', 'empleado_acceso', 'empleado_permiso', 'ejercicio') then 'Cambio de permisos / periodos'
    when a.tabla = 'empleado' and (a.operacion <> 'UPDATE'
           or a.campos && array['super_administrador', 'rol_id', 'auth_user_id', 'activo', 'conformidad_obligatoria', 'avisos_grupos'])
      then 'Cambio de empleado / acceso'
    when a.tabla = 'articulo' and a.operacion = 'UPDATE' and 'pvp' = any (a.campos)
         and exists (select 1 from articulo x where x.codigo_interno = a.registro_pk
                       and coalesce(nullif(x.coste_neto, 0), nullif(x.precio_medio_compra, 0)) > 0
                       and (a.datos_despues ->> 'pvp')::numeric / (1 + coalesce(x.igic_pct, 0) / 100)
                           < coalesce(nullif(x.coste_neto, 0), x.precio_medio_compra))
      then 'Precio por debajo del coste'
  end
$$;

-- A qué departamento va cada aviso.
create or replace function public.fn_auditoria_grupo(a public.auditoria, p_motivo text)
returns text language sql stable security definer set search_path = public as $$
  select case
    when p_motivo in ('Contraseña incorrecta', 'Usuario bloqueado por claves incorrectas', 'Intento fuera de horario', 'Entrada remota sin permiso',
                      'Uso fuera de lo normal', 'Cambio de permisos / periodos', 'Cambio de empleado / acceso', 'Cambio de parámetros de control',
                      'Cambio en las redes de las tiendas') then 'seguridad'
    when p_motivo in ('Datos de Contabilidad sacados fuera', 'Cierre de ejercicio', 'Reapertura de ejercicio', 'Cierre de mes', 'Reapertura de mes',
                      'Asiento anulado o modificado', 'Asiento con fecha atrasada', 'Asiento manual en caja, bancos o clientes',
                      'Cambio en el plan de cuentas', 'Asiento pendiente de segunda firma') then 'contabilidad'
    when p_motivo = 'Precio por debajo del coste' then 'ventas'
    when p_motivo = 'Regularización de stock' then 'compras'
    when p_motivo = 'Cambio de cuenta bancaria' then
      case when a.tabla = 'cliente_mandato' or coalesce(a.datos_despues, a.datos_antes) ->> 'tipo_entidad' ilike 'cli%' then 'ventas'
           when coalesce(a.datos_despues, a.datos_antes) ->> 'tipo_entidad' ilike 'prov%' then 'compras'
           else 'general' end
    when a.tabla ~ '(proveedor|compra|regularizacion)' then 'compras'
    when a.tabla ~ '^(venta|factura|cobro|pedido_cliente|presupuesto|albaran|cliente|movimiento_caja|caja|devolucion|remesa)' then 'ventas'
    else 'general'
  end
$$;

-- Solo en la Auditoría (no encienden el globo).
create or replace function public.fn_auditoria_nivel(p_motivo text)
returns text language sql immutable as $$
  select case when p_motivo in ('Cambio de permisos / periodos', 'Cambio en el plan de cuentas', 'Cambio en las redes de las tiendas', 'Cierre de mes',
                                 'Cierre de ejercicio') then 'leve'
              when p_motivo in ('Usuario bloqueado por claves incorrectas', 'Entrada remota sin permiso') then 'urgente'
              else 'grave' end
$$;

-- Los avisos que le tocan a un empleado (por sus grupos).
create or replace function public.fn_auditoria_avisos_de(p_emp text, p_dias integer default 30)
returns table (a public.auditoria, motivo text, grupo text, nivel text)
language sql stable security definer set search_path = public as $$
  with g as (select coalesce(nullif(e.avisos_grupos, '{}'), '{todo}') gs from empleado e where e.codigo = p_emp)
  select y.a, y.motivo, y.grupo, fn_auditoria_nivel(y.motivo)
    from (select x.a, x.motivo, fn_auditoria_grupo(x.a, x.motivo) grupo
            from (select a, fn_auditoria_motivo(a) motivo
                    from auditoria a
                   where a.ocurrido_en > now() - make_interval(days => greatest(1, coalesce(p_dias, 30)))
                     and a.operacion not in ('PANTALLA', 'ENTRADA', 'SALIDA', 'CONSULTA')) x
           where x.motivo is not null) y, g
   where 'todo' = any (g.gs) or y.grupo = any (g.gs)
$$;

create or replace function public.fn_auditoria_avisos(p_dias integer default 30)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_visto timestamptz; v_emp text := fn_empleado_actual(); e empleado;
begin
  if not fn_es_super_administrador() then
    return jsonb_build_object('pendientes', 0, 'urgentes', 0, 'lista', '[]'::jsonb, 'resumen', '[]'::jsonb, 'por_firmar', 0);
  end if;
  select * into e from empleado where codigo = v_emp;
  select visto_hasta into v_visto from auditoria_aviso_visto where empleado_codigo = v_emp;
  return (
    with m as (select * from fn_auditoria_avisos_de(v_emp, p_dias)),
    nuevos as (select * from m where (m.a).ocurrido_en > coalesce(v_visto, '-infinity') and m.nivel <> 'leve')
    select jsonb_build_object(
      'pendientes', (select count(*) from nuevos),
      'urgentes', (select count(*) from nuevos where nivel = 'urgente'),
      'visto_hasta', v_visto,
      'grupos', coalesce(nullif(e.avisos_grupos, '{}'), '{todo}'),
      'horas', e.avisos_horas,
      'por_firmar', (select count(*) from asiento_propuesta p where p.estado = 'pendiente' and p.creado_por is distinct from v_emp),
      'resumen', coalesce((select jsonb_agg(jsonb_build_object('motivo', motivo, 'nuevos', n, 'urgente', urg) order by urg desc, n desc)
                             from (select motivo, count(*) n, bool_or(nivel = 'urgente') urg from nuevos group by motivo) r), '[]'::jsonb),
      'lista', coalesce((select jsonb_agg(fn_auditoria_fila(x.a, x.motivo) || jsonb_build_object('nivel', x.nivel, 'departamento', x.grupo)
                                          order by (x.a).ocurrido_en desc)
                           from (select * from m order by (m.a).ocurrido_en desc limit 300) x), '[]'::jsonb)));
end;
$function$;

-- Resumen por correo a las 18:00 (hora de Canarias) a quien lo tenga pedido. Lo lanza pg_cron cada hora.
create or replace function public.fn_auditoria_correo_resumen()
returns integer language plpgsql security definer set search_path = public as $$
declare e record; v_hoy date := (now() at time zone 'Atlantic/Canary')::date; v_n int := 0; v_html text; v_origen text;
begin
  if extract(hour from now() at time zone 'Atlantic/Canary') <> 18 then return 0; end if;
  for e in select codigo, nombre, nullif(btrim(email), '') email from empleado where activo and super_administrador and avisos_correo loop
    continue when e.email is null;
    v_origen := 'auditoria-resumen-' || e.codigo || '-' || v_hoy;
    continue when exists (select 1 from correo_pendiente where origen = v_origen);
    select string_agg(format('<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>',
                             to_char((x.a).ocurrido_en at time zone 'Atlantic/Canary', 'HH24:MI'), x.motivo,
                             coalesce(em.nombre, (x.a).empleado_codigo, ''), coalesce((x.a).registro_nombre, (x.a).registro_pk, '')), '' order by (x.a).ocurrido_en)
      into v_html
      from fn_auditoria_avisos_de(e.codigo, 1) x left join empleado em on em.codigo = (x.a).empleado_codigo
     where x.nivel <> 'leve' and ((x.a).ocurrido_en at time zone 'Atlantic/Canary')::date = v_hoy;
    continue when v_html is null;
    perform fn_correo_encolar(e.email, 'Avatar · Avisos de auditoría de hoy',
      '<p>Hola ' || split_part(e.nombre, ' ', 1) || ', estos son los avisos de hoy:</p><table border="1" cellpadding="4" cellspacing="0">' ||
      '<tr><th>Hora</th><th>Aviso</th><th>Quién</th><th>Qué</th></tr>' || v_html || '</table><p>El detalle, en Archivo → Auditoría.</p>', v_origen);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.fn_auditoria_correo_resumen() from public, anon, authenticated;
revoke execute on function public.fn_auditoria_avisos_de(text, integer), public.fn_auditoria_grupo(public.auditoria, text) from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('erp_resumen_auditoria') where exists (select 1 from cron.job where jobname = 'erp_resumen_auditoria');
  perform cron.schedule('erp_resumen_auditoria', '3 * * * *', 'select public.fn_auditoria_correo_resumen()');
end $$;
