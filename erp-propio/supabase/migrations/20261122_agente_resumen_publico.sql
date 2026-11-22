-- Resumen PÚBLICO de un agente para el hub (inicio.html) (Rober, 22/11/2026): el cuadro de E-milio dice «hoy he hecho…»
-- sin que haya que iniciar sesión. Por eso devuelve SOLO números y el estado: nada de proveedores, importes, asuntos,
-- remitentes ni nombres de ficheros. Se puede llamar sin sesión (anon). Si algún día no se quiere público, basta con
-- revocar el execute a anon.
create or replace function public.fn_agente_resumen_publico(p_agente text)
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  with a as (select codigo, nombre, activo, ultima_pasada, ultimo_error from agente where codigo = p_agente),
       hoy as (select (date_trunc('day', now() at time zone 'Atlantic/Canary') at time zone 'Atlantic/Canary') as desde)
  select case when not exists (select 1 from a) then null else jsonb_build_object(
    'agente', (select nombre from a),
    'estado', case when not (select activo from a) then 'parado'
                   when coalesce((select ultimo_error from a), '') like 'Sin claves%' then 'esperando_conexion'
                   when (select ultimo_error from a) is not null then 'con_error'
                   else 'trabajando' end,
    'ultima_pasada', (select ultima_pasada from a),
    'hoy', case when p_agente = 'correo_proveedores' then (
        select jsonb_build_object(
          'documentos', count(*),
          'propuestas', count(*) filter (where d.tipo = 'propuesta'),
          'facturas', count(*) filter (where d.tipo = 'factura'),
          'albaranes', count(*) filter (where d.tipo = 'albaran'),
          'otros', count(*) filter (where d.tipo in ('otro', 'sin_clasificar')),
          'cruzados_con_pedido', count(*) filter (where d.diferencias is not null),
          'con_diferencias', count(*) filter (where d.diferencias > 0),
          'cuadran', count(*) filter (where d.diferencias = 0))
        from correo_proveedor_documento d, hoy where d.recibido_en >= hoy.desde) end,
    'pendiente', case when p_agente = 'correo_proveedores' then (
        select jsonb_build_object(
          'por_revisar', count(*) filter (where d.estado in ('nuevo', 'error')),
          'con_diferencias', count(*) filter (where d.estado = 'nuevo' and d.diferencias > 0),
          'sin_pedido', count(*) filter (where d.estado = 'nuevo' and d.pedido_numero is null and d.tipo in ('propuesta', 'factura', 'albaran')),
          'facturas_sin_copiar', count(*) filter (where d.tipo = 'factura' and d.copiado_en is null and d.estado <> 'descartado'))
        from correo_proveedor_documento d) end
  ) end
$$;
revoke all on function public.fn_agente_resumen_publico(text) from public;
grant execute on function public.fn_agente_resumen_publico(text) to anon, authenticated;
