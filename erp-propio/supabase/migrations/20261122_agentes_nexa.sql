-- Agentes del ERP con NEXA de encargada (Rober, 22/11/2026): «el número de agentes irá creciendo a medida que
-- automaticemos; el camino ideal es un encargado, NEXA, con quien interactuamos los administradores, y que ella misma dé
-- las órdenes y tareas a los agentes».
--
-- · agente: el registro de agentes (qué hace cada uno, si está encendido, cuándo pasó por última vez y qué dijo). Cada
--   agente nuevo se da de alta aquí y NEXA lo puede manejar sin tocar nada más.
-- · agente_orden: la cola de órdenes. NEXA (o una pantalla) deja una orden con fn_agente_ordenar y el agente la recoge.
--   «pausar» y «reanudar» se aplican al momento; «pasar_ahora» y «releer» despiertan al agente al instante.
-- · fn_agentes_estado(): el informe de todos los agentes que la persona puede ver (para NEXA y para las pantallas).
-- · Dar órdenes pasa por la confirmación de siempre de NEXA (proponer → «sí» → ejecutar): nivel 2 en nexa_operacion.
-- · Permisos: cada agente lleva el permiso de pantalla de su área (correo de proveedores = Gestor de Pedidos).

create table if not exists public.agente (
  codigo text primary key,
  nombre text not null,
  que_hace text not null,
  funcion text,
  cada text,
  permiso text,
  ordenes text[] not null default array['pasar_ahora', 'pausar', 'reanudar'],
  activo boolean not null default true,
  ultima_pasada timestamptz,
  ultimo_error text,
  ultimo_resumen text,
  actualizado_en timestamptz not null default now()
);
comment on table public.agente is 'Agentes automáticos del ERP (los maneja NEXA): qué hacen, si están encendidos y su última pasada.';

create table if not exists public.agente_orden (
  id bigint generated always as identity primary key,
  agente text not null references public.agente(codigo),
  orden text not null,
  parametros jsonb not null default '{}'::jsonb,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'hecha', 'error')),
  resultado text,
  pedida_por text default public.fn_empleado_actual(),
  pedida_en timestamptz not null default now(),
  hecha_en timestamptz
);
comment on table public.agente_orden is 'Órdenes a los agentes (las deja NEXA o una pantalla con fn_agente_ordenar; las recoge el agente).';
create index if not exists agente_orden_pendiente_idx on public.agente_orden (agente) where estado = 'pendiente';

alter table public.agente enable row level security;
alter table public.agente_orden enable row level security;
do $$
begin
  if not exists (select 1 from pg_policy where polname = 'agente_lee') then
    create policy agente_lee on public.agente for select to authenticated
      using ((select public.fn_es_administrador()) or (permiso is not null and (select public.fn_puede(permiso))));
  end if;
  if not exists (select 1 from pg_policy where polname = 'agente_orden_lee') then
    create policy agente_orden_lee on public.agente_orden for select to authenticated
      using (exists (select 1 from public.agente a where a.codigo = agente
                     and ((select public.fn_es_administrador()) or (a.permiso is not null and (select public.fn_puede(a.permiso))))));
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_auditoria_agente') then
    create trigger trg_auditoria_agente after update on public.agente for each row execute function public.fn_auditoria_trigger();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_auditoria_agente_orden') then
    create trigger trg_auditoria_agente_orden after insert or update on public.agente_orden for each row execute function public.fn_auditoria_trigger();
  end if;
end $$;
revoke all on public.agente, public.agente_orden from anon;

insert into public.agente (codigo, nombre, que_hace, funcion, cada, permiso, ordenes)
values ('correo_proveedores', 'Correo de proveedores',
        'Vigila el buzón de compras (solo lee) y deja en el Gestor 2.0 → «Correo de proveedores» los PDF de los proveedores: '
        || 'propuestas, facturas y albaranes, con su proveedor y su pedido. Las facturas de pedidos aceptados las compara con el pedido '
        || 'y avisa si falta algo. No contesta a nadie ni cambia pedidos.',
        'correo-proveedores', 'cada 10 minutos', '/gestor-pedidos-proveedor',
        array['pasar_ahora', 'releer', 'pausar', 'reanudar'])
on conflict (codigo) do update set que_hace = excluded.que_hace, funcion = excluded.funcion, cada = excluded.cada,
  permiso = excluded.permiso, ordenes = excluded.ordenes;

-- Dar una orden a un agente. pausar/reanudar: al momento. pasar_ahora/releer: a la cola y se despierta al agente.
-- releer: {"documento": id} vuelve a leer ese documento (p. ej. si la IA lo clasificó mal).
create or replace function public.fn_agente_ordenar(p_agente text, p_orden text, p_parametros jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare a agente; v_id bigint;
begin
  select * into a from agente where codigo = p_agente;
  if not found then raise exception 'No existe el agente «%».', p_agente; end if;
  if not (fn_es_administrador() or (a.permiso is not null and fn_puede(a.permiso))) then
    raise exception 'No tienes permiso para dar órdenes al agente «%».', a.nombre using errcode = '42501';
  end if;
  if not (p_orden = any (a.ordenes)) then
    raise exception 'El agente «%» no entiende la orden «%». Entiende: %.', a.nombre, p_orden, array_to_string(a.ordenes, ', ');
  end if;
  if p_orden = 'releer' and coalesce(p_parametros->>'documento', '') !~ '^\d+$' then
    raise exception 'Para «releer» hace falta el número del documento: {"documento": 123}.';
  end if;
  insert into agente_orden (agente, orden, parametros, estado, resultado, hecha_en)
  values (p_agente, p_orden, coalesce(p_parametros, '{}'::jsonb),
          case when p_orden in ('pausar', 'reanudar') then 'hecha' else 'pendiente' end,
          case p_orden when 'pausar' then 'Agente parado.' when 'reanudar' then 'Agente en marcha.' end,
          case when p_orden in ('pausar', 'reanudar') then now() end)
  returning id into v_id;
  if p_orden in ('pausar', 'reanudar') then
    update agente set activo = (p_orden = 'reanudar'), actualizado_en = now() where codigo = p_agente;
  elsif a.funcion is not null then
    -- Se le despierta ya (pg_net solo envía si la transacción se confirma: una simulación de NEXA no lo llama).
    perform net.http_post(url := 'https://sufxvpiwcncnyltrvoun.supabase.co/functions/v1/' || a.funcion,
                          body := jsonb_build_object('orden', v_id), headers := '{"Content-Type": "application/json"}'::jsonb,
                          timeout_milliseconds := 300000);
  end if;
  return jsonb_build_object('ok', true, 'orden', v_id, 'agente', a.nombre,
                            'aviso', case p_orden when 'pausar' then 'Parado: no hará nada hasta que se reanude.'
                                                  when 'reanudar' then 'En marcha: sigue en su próxima pasada.'
                                                  else 'Orden enviada: el agente la hace ahora mismo (puede tardar unos minutos).' end);
end $$;
revoke all on function public.fn_agente_ordenar(text, text, jsonb) from public, anon;
grant execute on function public.fn_agente_ordenar(text, text, jsonb) to authenticated;

-- Informe de los agentes que la persona puede ver: estado, última pasada, error, órdenes recientes y lo que tiene
-- pendiente cada uno (para el de correo: documentos por revisar, facturas con diferencias…).
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
          'albaranes', count(*) filter (where d.estado = 'nuevo' and d.tipo = 'albaran'),
          'sin_proveedor', count(*) filter (where d.estado = 'nuevo' and d.proveedor_codigo is null),
          'sin_pedido', count(*) filter (where d.estado = 'nuevo' and d.pedido_numero is null and d.tipo in ('propuesta', 'factura', 'albaran')),
          'con_error', count(*) filter (where d.estado = 'error'),
          'hoy', count(*) filter (where d.recibido_en >= date_trunc('day', now() at time zone 'Atlantic/Canary') at time zone 'Atlantic/Canary'))
        from correo_proveedor_documento d) end
  ) order by a.nombre), '[]'::jsonb)
  from agente a
  where fn_es_administrador() or (a.permiso is not null and fn_puede(a.permiso))
$$;
revoke all on function public.fn_agentes_estado() from public, anon;
grant execute on function public.fn_agentes_estado() to authenticated;

-- Niveles para NEXA: ver el estado es consulta (1); dar órdenes, nivel 2 («sí»).
insert into public.nexa_operacion (codigo, descripcion, tipo, objeto, accion, nivel, permiso, bloqueada, notas)
values ('funcion:fn_agente_ordenar', 'Dar una orden a un agente (pasar ahora, releer, pausar, reanudar)', 'funcion', 'fn_agente_ordenar', '*', 2, null, false,
        'NEXA es la encargada de los agentes: propone la orden y la persona dice «sí».'),
       ('funcion:fn_agentes_estado', 'Informe de los agentes', 'funcion', 'fn_agentes_estado', '*', 1, null, false, null)
on conflict (codigo) do update set descripcion = excluded.descripcion, nivel = excluded.nivel, bloqueada = false, notas = excluded.notas;
