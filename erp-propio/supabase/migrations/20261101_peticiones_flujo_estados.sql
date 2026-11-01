-- Flujo de estados de las peticiones de clientes ligado al pedido a proveedor (lo define Rober, 01/11/2026):
--   pedido «pendiente»  → se edita y se manda al proveedor como propuesta; las peticiones siguen «pendiente».
--   pedido ACEPTADO (confirmado y siguientes, ya comparado con la propuesta del proveedor) → peticiones «tramitada».
--   pedido «liquidado» (recibido y liquidado el albarán: entra el stock) → peticiones «resuelta», listas para facturar.
-- Antes el ERP las daba por tramitadas al GENERAR el pedido; si luego no había stock, quedaban tramitadas para siempre.
--
-- Solo entran las peticiones del proveedor del pedido (o sin proveedor, si ese proveedor está entre los de la ficha del
-- artículo), por orden de fecha y mientras la cantidad de la línea las cubra. Todo es idempotente.
-- Las funciones núcleo son SECURITY DEFINER (el que acepta un pedido no tiene por qué poder editar peticiones) y no se
-- pueden llamar desde fuera; si fallan (p. ej. petición de un periodo cerrado) avisan, pero no impiden guardar el pedido.

create or replace function public.fn_peticiones_tramitar_pedido(p_tienda text, p_numero bigint)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ped pedido_proveedor;
  v_provs text[];
  v_n int := 0;
  l record;
  pt record;
  v_queda numeric;
  v_falta numeric;
begin
  select * into v_ped from pedido_proveedor where tienda_terminal_codigo = p_tienda and numero = p_numero;
  if not found or coalesce(v_ped.es_abono, false) or coalesce(v_ped.estado, 'pendiente') in ('pendiente', 'pendiente_confirmar') then
    return 0;
  end if;
  v_provs := array[v_ped.proveedor_codigo] || coalesce(
    (select array_agg(pb.codigo) from proveedor pb where not coalesce(pb.activo, true) and pb.nombre ilike '%Pasa a ' || v_ped.proveedor_codigo || '%'), '{}');

  for l in
    select linea, articulo_codigo, coalesce(total_unidades, cantidad, 0) as uds
      from pedido_proveedor_linea where tienda_terminal_codigo = p_tienda and numero = p_numero order by linea
  loop
    v_queda := l.uds;
    for pt in
      select q.tienda_terminal_codigo as tienda, q.numero, q.cantidad, q.cantidad_tramitada
        from peticion q
       where q.articulo_codigo = l.articulo_codigo and q.estado in ('pendiente', 'atendida')
         and (coalesce(nullif(q.proveedor_codigo, ''), v_ped.proveedor_codigo) = any (v_provs))
         and (exists (select 1 from articulo_proveedor ap where ap.articulo_codigo = q.articulo_codigo and ap.proveedor_codigo = any (v_provs))
              or exists (select 1 from articulo a where a.codigo_interno = q.articulo_codigo and a.proveedor_habitual_codigo = any (v_provs)))
       order by q.fecha_hora, q.tienda_terminal_codigo, q.numero
    loop
      v_falta := greatest(0, coalesce(pt.cantidad, 0) - coalesce(pt.cantidad_tramitada, 0));
      continue when v_falta <= 0;
      exit when v_falta > v_queda;
      v_queda := v_queda - v_falta;
      update peticion
         set estado = 'tramitada', cantidad_tramitada = coalesce(pt.cantidad, v_falta), proveedor_codigo = v_ped.proveedor_codigo,
             empleado_atencion_codigo = public.fn_empleado_actual(), actualizado_en = now()
       where tienda_terminal_codigo = pt.tienda and numero = pt.numero;
      insert into peticion_tramitacion (tienda_terminal_codigo, numero, pedido_proveedor_tienda_codigo, pedido_proveedor_numero,
                                        pedido_proveedor_linea, fecha_hora, cantidad, proveedor_codigo, almacen_codigo, actualizado_en)
      values (pt.tienda, pt.numero, p_tienda, p_numero, l.linea, now(), v_falta, v_ped.proveedor_codigo, v_ped.almacen_codigo, now())
      on conflict (tienda_terminal_codigo, numero) do update
        set pedido_proveedor_tienda_codigo = excluded.pedido_proveedor_tienda_codigo, pedido_proveedor_numero = excluded.pedido_proveedor_numero,
            pedido_proveedor_linea = excluded.pedido_proveedor_linea, fecha_hora = excluded.fecha_hora, cantidad = excluded.cantidad,
            proveedor_codigo = excluded.proveedor_codigo, almacen_codigo = excluded.almacen_codigo, actualizado_en = excluded.actualizado_en;
      v_n := v_n + 1;
    end loop;
  end loop;
  return v_n;
end;
$$;

create or replace function public.fn_peticiones_resolver_pedido(p_tienda text, p_numero bigint)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update peticion q
     set estado = 'resuelta', empleado_atencion_codigo = coalesce(public.fn_empleado_actual(), q.empleado_atencion_codigo), actualizado_en = now()
    from peticion_tramitacion t
   where t.pedido_proveedor_tienda_codigo = p_tienda and t.pedido_proveedor_numero = p_numero
     and q.tienda_terminal_codigo = t.tienda_terminal_codigo and q.numero = t.numero and q.estado = 'tramitada';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.fn_peticiones_tramitar_pedido(text, bigint), public.fn_peticiones_resolver_pedido(text, bigint)
  from public, anon, authenticated;

-- Triggers: el pedido cambia de estado (cabecera) o se guardan sus líneas (la ficha guarda primero la cabecera y luego
-- las líneas, así que también se mira al guardar líneas de un pedido ya aceptado y aún sin recibir).
create or replace function public.fn_trg_pedido_prov_estado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.es_abono, false) then return null; end if;
  begin
    if new.estado = 'liquidado' then
      perform public.fn_peticiones_resolver_pedido(new.tienda_terminal_codigo, new.numero);
    elsif coalesce(old.estado, 'pendiente') in ('pendiente', 'pendiente_confirmar')
          and coalesce(new.estado, 'pendiente') not in ('pendiente', 'pendiente_confirmar') then
      perform public.fn_peticiones_tramitar_pedido(new.tienda_terminal_codigo, new.numero);
    end if;
  exception when others then
    raise warning 'Peticiones del pedido %/% sin actualizar: %', new.tienda_terminal_codigo, new.numero, sqlerrm;
  end;
  return null;
end;
$$;

create or replace function public.fn_trg_pedido_prov_linea()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
begin
  for p in
    select distinct pp.tienda_terminal_codigo as tienda, pp.numero
      from nuevas n
      join pedido_proveedor pp on pp.tienda_terminal_codigo = n.tienda_terminal_codigo and pp.numero = n.numero
     where pp.estado in ('confirmado', 'conformado', 'pendiente_entrega') and not coalesce(pp.es_abono, false)
  loop
    begin
      perform public.fn_peticiones_tramitar_pedido(p.tienda, p.numero);
    exception when others then
      raise warning 'Peticiones del pedido %/% sin actualizar: %', p.tienda, p.numero, sqlerrm;
    end;
  end loop;
  return null;
end;
$$;
revoke execute on function public.fn_trg_pedido_prov_estado(), public.fn_trg_pedido_prov_linea() from public, anon, authenticated;

create or replace trigger trg_pedido_prov_peticiones after update of estado on public.pedido_proveedor
  for each row when (old.estado is distinct from new.estado) execute function public.fn_trg_pedido_prov_estado();

create or replace trigger trg_pedido_prov_linea_peticiones_ins after insert on public.pedido_proveedor_linea
  referencing new table as nuevas for each statement execute function public.fn_trg_pedido_prov_linea();
create or replace trigger trg_pedido_prov_linea_peticiones_upd after update on public.pedido_proveedor_linea
  referencing new table as nuevas for each statement execute function public.fn_trg_pedido_prov_linea();

-- La función que NEXA puede llamar a mano ahora solo comprueba y delega en el núcleo.
create or replace function public.fn_compras_tramitar_peticiones(p_tienda text, p_numero bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if not public.fn_puede('/peticiones') then
    raise exception 'No tienes permiso para tramitar peticiones.' using errcode = '42501';
  end if;
  select estado into v_estado from pedido_proveedor where tienda_terminal_codigo = p_tienda and numero = p_numero;
  if not found then raise exception 'No existe el pedido %/%.', p_tienda, p_numero; end if;
  if coalesce(v_estado, 'pendiente') in ('pendiente', 'pendiente_confirmar') then
    raise exception 'El pedido %/% sigue pendiente: las peticiones se tramitan cuando el pedido ya está aceptado (confirmado).', p_tienda, p_numero;
  end if;
  return jsonb_build_object('pedido', p_tienda || '/' || p_numero, 'peticiones_tramitadas', public.fn_peticiones_tramitar_pedido(p_tienda, p_numero));
end;
$$;
revoke execute on function public.fn_compras_tramitar_peticiones(text, bigint) from public, anon;
grant execute on function public.fn_compras_tramitar_peticiones(text, bigint) to authenticated;

update public.nexa_operacion set
  receta = 'Normalmente no hace falta: las peticiones pasan solas a «tramitada» cuando el pedido pasa de «pendiente» a aceptado (confirmado) y a «resuelta» cuando se liquida. Úsala solo si Rober te lo pide para un pedido ya aceptado: select fn_compras_tramitar_peticiones(''01'', NUMERO_DEL_PEDIDO). Con el pedido pendiente se niega: no lo fuerces.'
 where codigo = 'funcion:fn_compras_tramitar_peticiones';
