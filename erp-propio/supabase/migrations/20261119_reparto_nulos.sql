-- Nulos en reparto (Rober, 19/11/2026). A veces una factura o albarán se anula del todo. El repartidor marca incidencia o
-- no entregado (no le toca decidirlo) y David, en el ERP (Control de Repartos → desplegable de la ruta), lo pasa a NULO
-- con un botón: sale del reparto y queda en las incidencias de la ruta hasta que David recibe la mercancía y lo valida.
--  · reparto_linea.nulo_en/nulo_por/nulo_motivo: anulada en el ERP. Estado 'anulado' (fuera de todas las listas).
--  · El puente de GeminisWin (fn_reparto_gw_ingesta) devolvía a una línea 'anulado' el estado de GeminisWin: ahora
--    respeta las anuladas en el ERP. Y la propuesta de reparto (erp_candidatas) no vuelve a proponer esa venta.
--  · La venta en sí hay que anularla también en GeminisWin (desde aquí no se escribe en GeminisWin).
alter table public.reparto_linea add column if not exists nulo_en timestamptz;
alter table public.reparto_linea add column if not exists nulo_por text;
alter table public.reparto_linea add column if not exists nulo_motivo text;
alter table public.reparto_linea add column if not exists nulo_validado_en timestamptz;
alter table public.reparto_linea add column if not exists nulo_validado_por text;
comment on column public.reparto_linea.nulo_en is 'Anulada (NULO) en el ERP desde Control de Repartos: fuera del reparto, pendiente de validar en almacén.';

do $$
declare d text; viejo text := 'case when v_estado = ''liquidado'' then ''liquidado'' when x.estado = ''liquidado''';
begin
  d := pg_get_functiondef('public.fn_reparto_gw_ingesta(jsonb)'::regprocedure);
  if position('x.nulo_en is not null' in d) = 0 then
    if (length(d) - length(replace(d, viejo, ''))) / length(viejo) <> 2 then raise exception 'ingesta: no encuentro el cálculo del estado'; end if;
    d := replace(d, viejo, 'case when x.nulo_en is not null then x.estado when v_estado = ''liquidado'' then ''liquidado'' when x.estado = ''liquidado''');
    execute d;
  end if;

  d := pg_get_functiondef('reparto_privado.erp_candidatas(date)'::regprocedure);
  if position('nulo_en' in d) = 0 then
    if position('and coalesce(g.gw_estado, 0) not in (4, 5, 6, 8, 10)' in d) = 0 then raise exception 'candidatas: no encuentro dónde filtrar'; end if;
    d := replace(d, 'and coalesce(g.gw_estado, 0) not in (4, 5, 6, 8, 10)', 'and coalesce(g.gw_estado, 0) not in (4, 5, 6, 8, 10)
     and not exists (select 1 from reparto_linea n where n.venta_tienda_codigo = g.venta_tienda_codigo and n.venta_numero = g.venta_numero and n.nulo_en is not null)');
    execute d;
  end if;
end $$;

-- Pasar a NULO (p_ok = false lo deshace: vuelve a «no entregado»).
create or replace function public.fn_reparto_linea_nulo(p_tienda text, p_numero bigint, p_vt text, p_vn bigint, p_motivo text, p_ok boolean default true)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not fn_puede('/repartos') then
    raise exception 'No tienes permiso de Repartos. Pídelo a un administrador (Archivo → Usuarios y permisos).' using errcode = '42501';
  end if;
  if p_ok and coalesce(btrim(p_motivo), '') = '' then raise exception 'Indica por qué se anula.'; end if;
  update reparto_linea
     set nulo_en = case when p_ok then now() end,
         nulo_por = case when p_ok then coalesce(fn_empleado_actual(), 'ERP') end,
         nulo_motivo = case when p_ok then left(btrim(p_motivo), 500) end,
         nulo_validado_en = null, nulo_validado_por = null,
         estado = case when p_ok then 'anulado' else 'no_entregado' end,
         actualizado_en = now()
   where tienda_terminal_codigo = p_tienda and numero = p_numero and venta_tienda_codigo = p_vt and venta_numero = p_vn
     and (p_ok or nulo_en is not null);
  if not found then raise exception 'Ese pedido no está en el reparto.'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- Validar un nulo (la mercancía ha vuelto al almacén).
create or replace function public.fn_reparto_nulo_validar(p_tienda text, p_numero bigint, p_vt text, p_vn bigint, p_ok boolean default true)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not fn_puede('/repartos') then
    raise exception 'No tienes permiso de Repartos. Pídelo a un administrador (Archivo → Usuarios y permisos).' using errcode = '42501';
  end if;
  update reparto_linea
     set nulo_validado_en = case when p_ok then now() end,
         nulo_validado_por = case when p_ok then coalesce(fn_empleado_actual(), 'ERP') end
   where tienda_terminal_codigo = p_tienda and numero = p_numero and venta_tienda_codigo = p_vt and venta_numero = p_vn and nulo_en is not null;
  if not found then raise exception 'Ese pedido no está anulado.'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- Nulos sin validar (con 'nulo': true), para las incidencias de cada ruta.
create or replace function reparto_privado.nulos_sin_validar()
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
             'nulo', true, 'vt', l.venta_tienda_codigo, 'vn', l.venta_numero, 'rt', l.tienda_terminal_codigo, 'rn', l.numero,
             'ruta', r.ruta_codigo, 'ruta_nombre', coalesce(rr.descripcion, r.ruta_codigo), 'fecha', r.fecha,
             'repartidor', coalesce(nullif(rp.nombre_corto, ''), rp.nombre),
             'cliente', coalesce(nullif(g.nombre_cliente, ''), nullif(v.nombre_cliente, ''), l.contacto, 'Sin nombre'),
             'factura', case when r.origen = 'geminiswin' then to_jsonb(g.factura_numero) else to_jsonb(v.factura_numero) end,
             'total', coalesce(g.total, v.total), 'pendiente', 0,
             'contado', g.forma_pago = 1, 'forma_pago', g.forma_pago_texto,
             'no_cobro', null, 'medio', null, 'incidencia', l.incidencia, 'nota', coalesce(l.nulo_motivo, '') || coalesce(' · anulado por ' || l.nulo_por, ''),
             'hora', to_char(l.nulo_en at time zone 'Atlantic/Canary', 'DD/MM HH24:MI'))
           order by l.nulo_en)
      from reparto r
      join reparto_linea l on l.tienda_terminal_codigo = r.tienda_terminal_codigo and l.numero = r.numero
      left join ruta_reparto rr on rr.codigo = r.ruta_codigo
      left join repartidor rp on rp.codigo = r.repartidor_codigo
      left join venta v on r.origen <> 'geminiswin' and v.tienda_terminal_codigo = l.venta_tienda_codigo and v.numero = l.venta_numero
      left join reparto_gw_venta g on r.origen = 'geminiswin' and g.venta_tienda_codigo = l.venta_tienda_codigo and g.venta_numero = l.venta_numero
     where l.nulo_en is not null and l.nulo_validado_en is null), '[]'::jsonb)
$$;

create or replace function public.fn_reparto_control_por_cobrar()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not fn_puede('/repartos') then
    raise exception 'No tienes permiso de Repartos. Pídelo a un administrador (Archivo → Usuarios y permisos).' using errcode = '42501';
  end if;
  return reparto_privado.por_cobrar(true, false) || reparto_privado.abonos_sin_validar() || reparto_privado.nulos_sin_validar();
end $$;

revoke all on function reparto_privado.nulos_sin_validar() from public, anon, authenticated;
revoke all on function public.fn_reparto_linea_nulo(text, bigint, text, bigint, text, boolean) from public, anon;
revoke all on function public.fn_reparto_nulo_validar(text, bigint, text, bigint, boolean) from public, anon;
grant execute on function public.fn_reparto_linea_nulo(text, bigint, text, bigint, text, boolean) to authenticated;
grant execute on function public.fn_reparto_nulo_validar(text, bigint, text, bigint, boolean) to authenticated;
