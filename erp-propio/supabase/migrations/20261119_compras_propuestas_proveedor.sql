-- Gestor de Pedidos 2.0: revisión con IA de las propuestas de proveedor (Rober, 18/11/2026).
--
-- El circuito: enviamos el pedido → el proveedor contesta con su propuesta (normalmente un PDF: proforma o
-- confirmación de pedido) → el ERP la lee con la IA y la compara línea a línea con nuestro pedido (precio, cantidad,
-- lo que no sirven, sustitutos, lo que añaden) → Compras la valida → sale al proveedor un correo de confirmación o
-- de reparos.
--
--  · La lectura la hace la función «propuesta-proveedor-ia» (la clave de la IA vive solo allí). La comparación de
--    números la rehace la propia función, sin fiarse de la IA: la IA solo dice qué línea del proveedor es qué
--    línea de nuestro pedido.
--  · compra_propuesta guarda cada propuesta revisada: el resultado de la comparación (lineas), lo decidido en cada
--    línea, la respuesta y el correo que salió. El correo sale por la cola de siempre (correo_pendiente, buzón
--    «compras»), como las reclamaciones de roturas.
--  · No cambia el pedido: si se aceptan precios o cantidades distintos, se corrigen en la ficha del pedido.

create table if not exists public.compra_propuesta (
  id bigint generated always as identity primary key,
  pedido_tienda text not null,
  pedido_numero bigint not null,
  proveedor_codigo text not null references public.proveedor(codigo),
  archivo text,
  documento_numero text,
  documento_fecha date,
  total_propuesta numeric,
  total_pedido numeric,
  lineas jsonb not null default '[]'::jsonb,
  avisos jsonb not null default '[]'::jsonb,
  resumen jsonb not null default '{}'::jsonb,
  estado text not null default 'revisando' check (estado in ('revisando', 'confirmada', 'con_reparos', 'anulada')),
  respuesta_para text,
  respuesta_asunto text,
  respuesta_texto text,
  correo_id bigint,
  respondida_por text,
  respondida_en timestamptz,
  creada_por text default public.fn_empleado_actual(),
  creada_en timestamptz not null default now(),
  foreign key (pedido_tienda, pedido_numero) references public.pedido_proveedor(tienda_terminal_codigo, numero)
);
comment on table public.compra_propuesta is
  'Propuestas de proveedor (PDF) leídas con IA y comparadas con nuestro pedido (Gestor de Pedidos 2.0 → Propuestas). No cambian el pedido.';
create index if not exists compra_propuesta_pedido_idx on public.compra_propuesta (pedido_tienda, pedido_numero);

alter table public.compra_propuesta enable row level security;
do $$
begin
  if not exists (select 1 from pg_policy where polname = 'compra_propuesta_lee') then
    create policy compra_propuesta_lee on public.compra_propuesta for select to authenticated
      using ((select public.fn_puede('/gestor-pedidos-proveedor')));
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_auditoria_compra_propuesta') then
    create trigger trg_auditoria_compra_propuesta after insert or update on public.compra_propuesta
      for each row execute function public.fn_auditoria_trigger();
  end if;
end $$;
revoke all on public.compra_propuesta from anon;

-- Pedidos a los que se les puede revisar una propuesta: los del ERP pendientes o confirmados y sin recibir.
create or replace function public.fn_compras_pedidos_para_propuesta()
returns table(tienda text, numero bigint, fecha date, proveedor_codigo text, proveedor_nombre text, proveedor_email text,
              estado text, lineas integer, total numeric, propuestas integer, ultima_propuesta text)
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select p.tienda_terminal_codigo, p.numero, (p.fecha_hora at time zone 'Atlantic/Canary')::date, p.proveedor_codigo, pr.nombre, pr.email,
         p.estado, (select count(*) from pedido_proveedor_linea l where l.tienda_terminal_codigo = p.tienda_terminal_codigo and l.numero = p.numero)::integer,
         p.total,
         (select count(*) from compra_propuesta c where c.pedido_tienda = p.tienda_terminal_codigo and c.pedido_numero = p.numero and c.estado <> 'anulada')::integer,
         (select c.estado from compra_propuesta c where c.pedido_tienda = p.tienda_terminal_codigo and c.pedido_numero = p.numero and c.estado <> 'anulada'
           order by c.creada_en desc limit 1)
    from pedido_proveedor p
    left join proveedor pr on pr.codigo = p.proveedor_codigo
   where public.fn_puede('/gestor-pedidos-proveedor')
     and p.estado in ('pendiente', 'confirmado') and not coalesce(p.recibido, false) and not coalesce(p.es_abono, false)
   order by p.fecha_hora desc
   limit 300
$$;

-- La función de IA guarda aquí lo que ha leído y comparado.
create or replace function public.fn_compras_propuesta_guardar(p_tienda text, p_numero bigint, p_archivo text, p_lectura jsonb)
returns bigint language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_prov text; v_id bigint;
begin
  if not fn_puede('/gestor-pedidos-proveedor') then
    raise exception 'No tienes permiso del Gestor de Pedidos a Proveedores. Pídelo a un administrador.' using errcode = '42501';
  end if;
  select proveedor_codigo into v_prov from pedido_proveedor where tienda_terminal_codigo = p_tienda and numero = p_numero;
  if v_prov is null then raise exception 'No encuentro el pedido % de la tienda %.', p_numero, p_tienda; end if;
  if jsonb_typeof(p_lectura -> 'lineas') <> 'array' then raise exception 'La lectura no trae líneas.'; end if;
  insert into compra_propuesta (pedido_tienda, pedido_numero, proveedor_codigo, archivo, documento_numero, documento_fecha,
                                total_propuesta, total_pedido, lineas, avisos, resumen)
  values (p_tienda, p_numero, v_prov, left(nullif(btrim(p_archivo), ''), 200), left(nullif(btrim(p_lectura ->> 'documento_numero'), ''), 60),
          case when (p_lectura ->> 'documento_fecha') ~ '^\d{4}-\d{2}-\d{2}$' then (p_lectura ->> 'documento_fecha')::date end,
          nullif(p_lectura ->> 'total_propuesta', '')::numeric, nullif(p_lectura ->> 'total_pedido', '')::numeric,
          p_lectura -> 'lineas', coalesce(p_lectura -> 'avisos', '[]'::jsonb), coalesce(p_lectura -> 'resumen', '{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;

-- Responder al proveedor: confirmación o reparos. Guarda lo decidido en cada línea y deja el correo en la cola.
create or replace function public.fn_compras_propuesta_responder(p_id bigint, p_tipo text, p_para text, p_asunto text, p_texto text,
                                                                 p_lineas jsonb default null, p_enviar boolean default true)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v compra_propuesta; v_para text := btrim(coalesce(p_para, '')); d text; v_html text; v_correo bigint;
begin
  if not fn_puede('/gestor-pedidos-proveedor') then
    raise exception 'No tienes permiso del Gestor de Pedidos a Proveedores. Pídelo a un administrador.' using errcode = '42501';
  end if;
  if p_tipo not in ('confirmar', 'reparos') then raise exception 'La respuesta tiene que ser «confirmar» o «reparos».'; end if;
  select * into v from compra_propuesta where id = p_id for update;
  if v.id is null then raise exception 'No existe la propuesta %.', p_id; end if;
  if v.estado <> 'revisando' then raise exception 'Esta propuesta ya se contestó (%).', v.estado; end if;
  if p_enviar then
    if v_para = '' then raise exception 'Falta el correo del proveedor.' using errcode = '22023'; end if;
    foreach d in array regexp_split_to_array(v_para, '\s*[;,]\s*') loop
      if d <> '' and d !~ '^[^@\s;,]+@[^@\s;,]+\.[^@\s;,]+$' then raise exception 'El correo «%» no es válido.', d using errcode = '22023'; end if;
    end loop;
    if nullif(btrim(p_asunto), '') is null or nullif(btrim(p_texto), '') is null then
      raise exception 'Falta el asunto o el texto del correo.' using errcode = '22023';
    end if;
    -- Texto llano pasado a HTML sin dejar colar etiquetas.
    v_html := '<div style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap">'
           || replace(replace(replace(p_texto, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</div>';
    insert into correo_pendiente (para, asunto, cuerpo_html, origen, buzon)
    values (v_para, left(btrim(p_asunto), 200), v_html, 'compra_propuesta', 'compras')
    returning id into v_correo;
  end if;
  update compra_propuesta
     set estado = case when p_tipo = 'confirmar' then 'confirmada' else 'con_reparos' end,
         lineas = case when jsonb_typeof(p_lineas) = 'array' and jsonb_array_length(p_lineas) = jsonb_array_length(lineas) then p_lineas else lineas end,
         respuesta_para = nullif(v_para, ''), respuesta_asunto = left(nullif(btrim(p_asunto), ''), 200), respuesta_texto = p_texto,
         correo_id = v_correo, respondida_por = fn_empleado_actual(), respondida_en = now()
   where id = p_id;
  return jsonb_build_object('ok', true, 'correo_id', v_correo, 'estado', case when p_tipo = 'confirmar' then 'confirmada' else 'con_reparos' end);
end $$;

create or replace function public.fn_compras_propuesta_anular(p_id bigint)
returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  if not fn_puede('/gestor-pedidos-proveedor') then
    raise exception 'No tienes permiso del Gestor de Pedidos a Proveedores. Pídelo a un administrador.' using errcode = '42501';
  end if;
  update compra_propuesta set estado = 'anulada' where id = p_id and estado = 'revisando';
  if not found then raise exception 'Solo se puede anular una propuesta que está sin contestar.'; end if;
end $$;

-- Propuestas de un pedido (o las últimas de todos), con cómo va su correo.
create or replace function public.fn_compras_propuestas(p_tienda text default null, p_numero bigint default null)
returns table(id bigint, pedido_tienda text, pedido_numero bigint, proveedor_codigo text, proveedor_nombre text, archivo text,
              documento_numero text, documento_fecha date, total_propuesta numeric, total_pedido numeric, lineas jsonb, avisos jsonb,
              resumen jsonb, estado text, respuesta_para text, respuesta_asunto text, respuesta_texto text, respondida_en timestamptz,
              respondida_por text, creada_en timestamptz, correo_enviado_en timestamptz, correo_error text)
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select c.id, c.pedido_tienda, c.pedido_numero, c.proveedor_codigo, pr.nombre, c.archivo, c.documento_numero, c.documento_fecha,
         c.total_propuesta, c.total_pedido, c.lineas, c.avisos, c.resumen, c.estado, c.respuesta_para, c.respuesta_asunto,
         c.respuesta_texto, c.respondida_en, c.respondida_por, c.creada_en, m.enviado_en, m.error
    from compra_propuesta c
    left join proveedor pr on pr.codigo = c.proveedor_codigo
    left join correo_pendiente m on m.id = c.correo_id
   where public.fn_puede('/gestor-pedidos-proveedor')
     and (p_tienda is null or c.pedido_tienda = p_tienda) and (p_numero is null or c.pedido_numero = p_numero)
   order by c.creada_en desc
   limit 100
$$;

revoke all on function public.fn_compras_pedidos_para_propuesta() from public, anon;
revoke all on function public.fn_compras_propuesta_guardar(text, bigint, text, jsonb) from public, anon;
revoke all on function public.fn_compras_propuesta_responder(bigint, text, text, text, text, jsonb, boolean) from public, anon;
revoke all on function public.fn_compras_propuesta_anular(bigint) from public, anon;
revoke all on function public.fn_compras_propuestas(text, bigint) from public, anon;
grant execute on function public.fn_compras_pedidos_para_propuesta() to authenticated;
grant execute on function public.fn_compras_propuesta_guardar(text, bigint, text, jsonb) to authenticated;
grant execute on function public.fn_compras_propuesta_responder(bigint, text, text, text, text, jsonb, boolean) to authenticated;
grant execute on function public.fn_compras_propuesta_anular(bigint) to authenticated;
grant execute on function public.fn_compras_propuestas(text, bigint) to authenticated;
