-- App de repartidores: con GeminisWin, cada repartidor elige la ruta que reparte ese día (Rober, 16/11/2026).
-- El repartidor que GeminisWin tiene en un reparto ABIERTO no es de fiar (es un nombre por defecto y lo
-- cambian al cerrar: el 13/11 tres rutas cambiaron de repartidor al cerrarse). Por eso:
--   · la ingesta trae los repartos abiertos SIN repartidor (el de GeminisWin solo se toma al cerrar);
--   · la ruta es de quien la abre en la app (ya era así para las rutas sin repartidor);
--   · fn_app_rep_soltar: «No es mi ruta», para dejarla libre otra vez.
-- A mano, sin fichero: se dejaron libres los repartos abiertos que nadie había empezado a marcar.
do $$
declare v_def text; a text := 'v_est := case when (r ->> ''estado'')::int = 4 then 4 else 2 end;';
begin
  v_def := pg_get_functiondef('public.fn_reparto_gw_ingesta(jsonb)'::regprocedure);
  if position('repartidor de GeminisWin solo vale' in v_def) = 0 then
    if position(a in v_def) = 0 then raise exception 'No encuentro el estado en fn_reparto_gw_ingesta'; end if;
    execute replace(v_def, a, a || $x$
    -- El repartidor de GeminisWin solo vale cuando el reparto ya está cerrado: mientras está abierto es un nombre
    -- por defecto y lo cambian al cerrar. En la app, la ruta abierta es de quien la coge.
    if v_est = 2 then v_rep := null; end if;$x$);
  end if;
end $$;

create or replace function public.fn_app_rep_soltar(p_token uuid, p_tienda text, p_numero integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rep text := reparto_privado.sesion(p_token); r reparto;
begin
  select * into r from reparto where tienda_terminal_codigo = p_tienda and numero = p_numero for update;
  if not found then raise exception 'Ese reparto no existe.'; end if;
  if r.estado <> 2 then raise exception 'Ese reparto ya está cerrado.'; end if;
  if r.repartidor_codigo is distinct from v_rep then raise exception 'Esa ruta no la llevas tú.'; end if;
  if exists (select 1 from reparto_traspaso t where t.estado in ('propuesto', 'aceptado')
               and ((t.tienda_terminal_codigo = p_tienda and t.numero = p_numero) or (t.a_tienda = p_tienda and t.a_numero = p_numero))) then
    raise exception 'Esta ruta tiene pedidos pasados a un compañero (o recibidos): no se puede soltar. Avisa en la oficina.';
  end if;
  update reparto set repartidor_codigo = null, actualizado_en = now() where tienda_terminal_codigo = p_tienda and numero = p_numero;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.fn_app_rep_soltar(uuid, text, integer) from public;
grant execute on function public.fn_app_rep_soltar(uuid, text, integer) to anon, authenticated, service_role;

-- Los repartidores de prueba ven y cogen solo rutas libres de la ruta 99 (PRUEBA RUTA); los de verdad, solo las reales.
do $$
declare v_def text; a text;
begin
  v_def := pg_get_functiondef('public.fn_app_rep_repartos(uuid)'::regprocedure);
  a := '(r.repartidor_codigo is null and not v_prueba)';
  if position(a in v_def) > 0 then
    execute replace(v_def, a, $x$(r.repartidor_codigo is null and (v_prueba = (r.ruta_codigo = '99')))$x$);
  end if;
  v_def := pg_get_functiondef('reparto_privado.reparto(text,text,integer)'::regprocedure);
  a := 'if coalesce((select prueba from repartidor_pin where repartidor_codigo = p_rep), false) then';
  if position(a in v_def) > 0 then
    execute replace(v_def, a, $x$if coalesce((select prueba from repartidor_pin where repartidor_codigo = p_rep), false) and r.ruta_codigo is distinct from '99' then$x$);
  end if;
end $$;
