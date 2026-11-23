-- Cierre real de la puerta de atrás a la app de repartos (23/11/2026). La primera corrección (fichaje_no_abre_reparto_con_pin_provisional)
-- no bastaba: fn_fichaje_pin_cambiar comprueba el PIN actual (el provisional 1234), pone el nuevo y devuelve el panel, y el panel abría la
-- sesión de repartos con el PIN que acababa de elegir quien llamaba. Es decir, quien conocía el código de empleado y el 1234 cambiaba el PIN
-- de fichaje y entraba en los repartos (y le quitaba el PIN a su dueño). Comprobado con datos de prueba antes y después.
-- Ahora, al cambiar el PIN, el panel que se devuelve va SIN sesión de repartos; esta solo se abre al entrar o fichar con un PIN ya personal.
do $$
declare
  dp text := pg_get_functiondef('fichaje_privado.panel(text)'::regprocedure);
  dc text := pg_get_functiondef('public.fn_fichaje_pin_cambiar(text,text,text)'::regprocedure);
begin
  if position('fichaje.sin_reparto' in dp) = 0 then
    dp := replace(dp, 'if v_rep is not null and v_estado = ''trabajando''', 'if v_rep is not null and v_estado = ''trabajando'' and coalesce(current_setting(''fichaje.sin_reparto'', true), '''') <> ''1''');
    if position('fichaje.sin_reparto' in dp) = 0 then raise exception 'No se pudo cambiar fichaje_privado.panel.'; end if;
    execute dp;
  end if;
  if position('fichaje.sin_reparto' in dc) = 0 then
    dc := replace(dc, 'return fichaje_privado.panel(p_empleado);', 'perform set_config(''fichaje.sin_reparto'', ''1'', true); return fichaje_privado.panel(p_empleado);');
    if position('fichaje.sin_reparto' in dc) = 0 then raise exception 'No se pudo cambiar fn_fichaje_pin_cambiar.'; end if;
    execute dc;
  end if;
end $$;
