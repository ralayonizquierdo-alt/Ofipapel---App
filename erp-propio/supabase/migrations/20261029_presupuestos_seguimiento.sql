-- Seguimiento de presupuestos, fase 1 (Luis, 29/10/2026): que ningún presupuesto se quede en el
-- limbo.
--  · Estado: borrador → enviado → seguimiento → aceptado / perdido (con motivo).
--  · Próximo contacto y responsable: al enviarlo (o ponerlo en seguimiento) se pone sola la fecha
--    de volver a llamar (hoy + parámetro pre.dias_seguimiento, 3 por defecto) si no la tiene; un
--    presupuesto abierto nunca se queda sin fecha. Aceptado o perdido: ya no hay que llamar.
--  · Caducidad: la fecha final del «Periodo de Validez» (fecha_fin).
--  · Aceptado → pedido con un clic (fn_presupuesto_a_pedido): copia cabecera y líneas en un pedido
--    nuevo y deja el enlace en el presupuesto.
--  · fn_presupuestos_seguimiento: lo que hay que llamar hoy (o ya vencido) y los caducados, para
--    la bandeja del Panel de Control.
-- aceptado y en_seguimiento siguen existiendo y se mantienen a juego con el estado.

alter table public.pedido_cliente
  add column if not exists presupuesto_estado text,
  add column if not exists proximo_contacto date,
  add column if not exists responsable_codigo text references public.empleado(codigo),
  add column if not exists enviado_en timestamptz,
  add column if not exists motivo_perdida text,
  add column if not exists pedido_generado_tienda text,
  add column if not exists pedido_generado_numero bigint;
do $$ begin
  alter table public.pedido_cliente add constraint pedido_cliente_presupuesto_estado_ck
    check (presupuesto_estado is null or presupuesto_estado in ('borrador', 'enviado', 'seguimiento', 'aceptado', 'perdido'));
exception when duplicate_object then null; end $$;
comment on column public.pedido_cliente.presupuesto_estado is 'Presupuestos: borrador, enviado, seguimiento, aceptado o perdido.';
comment on column public.pedido_cliente.proximo_contacto is 'Presupuestos: cuándo volver a llamar al cliente.';
comment on column public.pedido_cliente.responsable_codigo is 'Presupuestos: empleado que hace el seguimiento.';
create index if not exists pedido_cliente_seguimiento_idx on public.pedido_cliente (proximo_contacto) where es_presupuesto and proximo_contacto is not null;

insert into public.parametro (clave, valor, descripcion)
values ('pre.dias_seguimiento', '3', 'Presupuestos: días hasta el primer contacto tras enviarlo')
on conflict (clave) do nothing;

update public.pedido_cliente
   set presupuesto_estado = case when aceptado then 'aceptado' when en_seguimiento then 'seguimiento' else 'borrador' end
 where es_presupuesto and presupuesto_estado is null;

create or replace function public.fn_presupuesto_estado_guarda()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare v_dias int;
begin
  if not coalesce(new.es_presupuesto, false) then return new; end if;
  -- Si se tocó «aceptado» o «en seguimiento» desde fuera (gestores, cargas), el estado los sigue.
  if tg_op = 'UPDATE' and new.presupuesto_estado is not distinct from old.presupuesto_estado then
    if new.aceptado is distinct from old.aceptado then
      new.presupuesto_estado := case when new.aceptado then 'aceptado' else 'seguimiento' end;
    elsif new.en_seguimiento is distinct from old.en_seguimiento and new.en_seguimiento then
      new.presupuesto_estado := 'seguimiento';
    end if;
  end if;
  new.presupuesto_estado := coalesce(new.presupuesto_estado, case when new.aceptado then 'aceptado' else 'borrador' end);
  new.aceptado := new.presupuesto_estado = 'aceptado';
  new.en_seguimiento := new.presupuesto_estado = 'seguimiento';
  new.responsable_codigo := coalesce(new.responsable_codigo, public.fn_empleado_actual(), new.empleado_codigo);
  if new.presupuesto_estado = 'enviado' and new.enviado_en is null then new.enviado_en := now(); end if;
  if new.presupuesto_estado in ('enviado', 'seguimiento') and new.proximo_contacto is null then
    select coalesce((select (valor #>> '{}')::int from parametro where clave = 'pre.dias_seguimiento'), 3) into v_dias;
    new.proximo_contacto := (now() at time zone 'Atlantic/Canary')::date + v_dias;
  end if;
  if new.presupuesto_estado in ('aceptado', 'perdido') then new.proximo_contacto := null; end if;
  if new.presupuesto_estado = 'perdido' and coalesce(new.motivo_perdida, '') = '' then
    raise exception 'Para dar un presupuesto por perdido hay que indicar el motivo.';
  end if;
  if new.presupuesto_estado <> 'perdido' then new.motivo_perdida := null; end if;
  return new;
end;
$$;
drop trigger if exists trg_presupuesto_estado on public.pedido_cliente;
create trigger trg_presupuesto_estado before insert or update on public.pedido_cliente
  for each row execute function public.fn_presupuesto_estado_guarda();

-- Aceptado → pedido nuevo con las mismas líneas.
create or replace function public.fn_presupuesto_a_pedido(p_tienda text, p_numero bigint)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  p pedido_cliente;
  v_num bigint;
  v_hoy date := (now() at time zone 'Atlantic/Canary')::date;
  v_hora text := to_char(now() at time zone 'Atlantic/Canary', 'HH24:MI');
begin
  select * into p from pedido_cliente where tienda_terminal_codigo = p_tienda and numero = p_numero for update;
  if not found or not p.es_presupuesto then raise exception 'No existe el presupuesto %-%', p_tienda, p_numero; end if;
  if p.anulado then raise exception 'El presupuesto está anulado.'; end if;
  if p.pedido_generado_numero is not null then
    raise exception 'Este presupuesto ya pasó al pedido %-%.', p.pedido_generado_tienda, p.pedido_generado_numero;
  end if;
  v_num := public.fn_siguiente_numero(p_tienda, 'pedido_cliente', '');
  insert into pedido_cliente
  select (jsonb_populate_record(null::pedido_cliente, to_jsonb(p) || jsonb_build_object(
    'numero', v_num, 'es_presupuesto', false, 'fecha', v_hoy, 'hora', v_hora, 'aceptado', false, 'en_seguimiento', false,
    'presupuesto_estado', null, 'proximo_contacto', null, 'enviado_en', null, 'motivo_perdida', null,
    'pedido_generado_tienda', null, 'pedido_generado_numero', null, 'preparado', false, 'entregado', false,
    'venta_tienda_codigo', null, 'venta_numero', null, 'liquidado', null, 'total_pagado', 0, 'total_pendiente', p.total,
    'empleado_codigo', coalesce(public.fn_empleado_actual(), p.empleado_codigo), 'creado_en', now(), 'actualizado_en', now(),
    'observaciones', concat_ws(E'\n', p.observaciones, format('Del presupuesto %s-%s', p_tienda, p_numero))))).*;
  insert into pedido_cliente_linea
  select (jsonb_populate_record(null::pedido_cliente_linea, to_jsonb(l) || jsonb_build_object('numero', v_num, 'fecha', v_hoy, 'hora', v_hora, 'actualizado_en', now()))).*
    from pedido_cliente_linea l where l.tienda_terminal_codigo = p_tienda and l.numero = p_numero;
  update pedido_cliente set presupuesto_estado = 'aceptado', pedido_generado_tienda = p_tienda, pedido_generado_numero = v_num
   where tienda_terminal_codigo = p_tienda and numero = p_numero;
  return jsonb_build_object('tienda', p_tienda, 'numero', v_num);
end;
$$;
grant execute on function public.fn_presupuesto_a_pedido(text, bigint) to authenticated;
revoke execute on function public.fn_presupuesto_a_pedido(text, bigint) from anon, public;

-- Bandeja de seguimientos: abiertos con el contacto para hoy o vencido, y caducados.
create or replace function public.fn_presupuestos_seguimiento(p_tienda text default null)
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $$
  with hoy as (select (now() at time zone 'Atlantic/Canary')::date as d),
  a as (
    select p.tienda_terminal_codigo as tienda, p.numero, coalesce(c.nombre, p.nombre_cliente) as cliente, p.total,
           p.presupuesto_estado as estado, p.proximo_contacto, p.fecha_fin as valido_hasta,
           public.fn_numero_operario(p.responsable_codigo) as responsable,
           p.responsable_codigo = public.fn_empleado_actual() as mio,
           (p.fecha_fin is not null and p.fecha_fin < hoy.d) as caducado,
           case when p.proximo_contacto is not null then hoy.d - p.proximo_contacto end as dias_retraso
      from pedido_cliente p
      left join cliente c on c.codigo = p.cliente_codigo, hoy
     where p.es_presupuesto and not coalesce(p.anulado, false)
       and p.presupuesto_estado in ('borrador', 'enviado', 'seguimiento')
       and (p_tienda is null or p.tienda_terminal_codigo = p_tienda)
       and ((p.proximo_contacto is not null and p.proximo_contacto <= hoy.d) or (p.fecha_fin is not null and p.fecha_fin < hoy.d))
  )
  select jsonb_build_object(
    'hoy', (select count(*) from a where dias_retraso = 0),
    'vencidos', (select count(*) from a where dias_retraso > 0),
    'caducados', (select count(*) from a where caducado),
    'mios', (select count(*) from a where mio),
    'lista', coalesce((select jsonb_agg(to_jsonb(a) order by caducado, dias_retraso desc nulls last, numero) from a), '[]'))
$$;
grant execute on function public.fn_presupuestos_seguimiento(text) to authenticated;
revoke execute on function public.fn_presupuestos_seguimiento(text) from anon, public;
