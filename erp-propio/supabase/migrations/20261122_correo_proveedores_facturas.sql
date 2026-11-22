-- Agente de correo de proveedores, 2.ª parte (Rober, 22/11/2026): la factura final.
-- «Después de la propuesta y mi aceptación, cuando preparan y envían el pedido siempre mandan la factura final. Habría que
-- hacer una última comprobación por si falla algún artículo (se quedaron sin stock a última hora…) y después el agente debe
-- descargar esa factura y colocarla en una carpeta concreta de facturas de proveedores, ordenadas».
--
-- · comprobacion: la factura (o el albarán) comparada línea a línea con su pedido. La IA solo dice qué línea es cuál; las
--   diferencias (falta, menos cantidad, más cantidad, precio distinto, añadido) las calcula la función con números.
-- · diferencias: cuántas hay (0 = cuadra). Sale en rojo en Gestor 2.0 → «Correo de proveedores» y en el informe de NEXA.
-- · nombre_ordenado / copiado_en / copia_ruta: la copia a la carpeta del servidor la hace el programa del PC (la nube no
--   llega a las carpetas de la oficina) cuando Rober diga la ruta. nombre_ordenado = «AAAA-MM · PROVEEDOR · Nº.pdf».

alter table public.correo_proveedor_documento add column if not exists comprobacion jsonb;
alter table public.correo_proveedor_documento add column if not exists diferencias integer;
alter table public.correo_proveedor_documento add column if not exists nombre_ordenado text;
alter table public.correo_proveedor_documento add column if not exists copiado_en timestamptz;
alter table public.correo_proveedor_documento add column if not exists copia_ruta text;
comment on column public.correo_proveedor_documento.comprobacion is 'Factura/albarán contra su pedido: {faltan, menos, mas, precio, anadidos, lineas_pedido, lineas_documento}.';
comment on column public.correo_proveedor_documento.diferencias is 'Nº de diferencias con el pedido (0 = cuadra; null = sin comprobar).';
comment on column public.correo_proveedor_documento.nombre_ordenado is 'Nombre para la carpeta de facturas: «AAAA-MM · PROVEEDOR · Nº.pdf».';

-- El informe de NEXA cuenta también las facturas con diferencias.
create or replace function public.fn_agentes_estado()
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'agente', a.codigo, 'nombre', a.nombre, 'que_hace', a.que_hace, 'cada', a.cada, 'encendido', a.activo,
    'ultima_pasada', a.ultima_pasada, 'ultimo_error', a.ultimo_error, 'ultimo_resumen', a.ultimo_resumen,
    'ordenes_que_entiende', a.ordenes,
    'ordenes_recientes', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'orden', o.orden, 'estado', o.estado, 'resultado', o.resultado,
                                                                       'pedida_en', o.pedida_en, 'pedida_por', o.pedida_por) order by o.id desc), '[]'::jsonb)
                          from (select * from agente_orden o where o.agente = a.codigo order by o.id desc limit 5) o),
    'pendiente', case a.codigo when 'correo_proveedores' then (
        select jsonb_build_object(
          'por_revisar', count(*) filter (where d.estado in ('nuevo', 'error')),
          'propuestas', count(*) filter (where d.estado = 'nuevo' and d.tipo = 'propuesta'),
          'facturas', count(*) filter (where d.estado = 'nuevo' and d.tipo = 'factura'),
          'facturas_con_diferencias', count(*) filter (where d.estado = 'nuevo' and d.tipo in ('factura', 'albaran') and d.diferencias > 0),
          'albaranes', count(*) filter (where d.estado = 'nuevo' and d.tipo = 'albaran'),
          'sin_proveedor', count(*) filter (where d.estado = 'nuevo' and d.proveedor_codigo is null),
          'sin_pedido', count(*) filter (where d.estado = 'nuevo' and d.pedido_numero is null and d.tipo in ('propuesta', 'factura', 'albaran')),
          'con_error', count(*) filter (where d.estado = 'error'),
          'facturas_sin_copiar_a_carpeta', count(*) filter (where d.tipo = 'factura' and d.copiado_en is null and d.estado <> 'descartado'),
          'hoy', count(*) filter (where d.recibido_en >= date_trunc('day', now() at time zone 'Atlantic/Canary') at time zone 'Atlantic/Canary'))
        from correo_proveedor_documento d) end
  ) order by a.nombre), '[]'::jsonb)
  from agente a
  where fn_es_administrador() or (a.permiso is not null and fn_puede(a.permiso))
$$;
revoke all on function public.fn_agentes_estado() from public, anon;
grant execute on function public.fn_agentes_estado() to authenticated;
