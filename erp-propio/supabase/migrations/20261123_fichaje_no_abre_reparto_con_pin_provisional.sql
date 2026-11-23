-- Puerta de atrás a la app de repartos (23/11/2026): al fichar la entrada, el panel de Fichaje abre solo una sesión en la app de
-- repartos (reparto_app_sesion) SIN pedir el PIN de repartos. Con el PIN de fichaje sin cambiar (1234, 7 de los 10 repartidores
-- con fichaje) se entraba en los repartos del día aunque el PIN de repartos estuviera cambiado: clientes, direcciones, teléfonos,
-- marcar entregas y cambiar rutas. Ahora esa sesión automática solo se abre si el PIN de fichaje es personal: ni provisional ni 1234.
-- Quien tenga el PIN de fichaje sin cambiar ficha igual, pero para entrar en repartos usa el PIN de repartos (el botón
-- «Mi reparto» no sale hasta que cambie el de fichaje).
do $$
declare
  d text := pg_get_functiondef('fichaje_privado.panel(text)'::regprocedure);
  v_viejo text := 'if v_rep is not null and v_estado = ''trabajando'' then';
  v_nuevo text := 'if v_rep is not null and v_estado = ''trabajando''' || chr(10)
    || '     and not exists (select 1 from fichaje_pin fp where fp.empleado_codigo = p_emp' || chr(10)
    || '                        and (fp.provisional or fp.pin_hash = extensions.crypt(''1234'', fp.pin_hash))) then';
begin
  if position('fp.provisional or fp.pin_hash' in d) = 0 then
    if position(v_viejo in d) = 0 then raise exception 'No se encontró el sitio donde cambiar fichaje_privado.panel.'; end if;
    d := replace(d, v_viejo, v_nuevo);
    if position('fp.provisional or fp.pin_hash' in d) = 0 then raise exception 'No se pudo cambiar fichaje_privado.panel.'; end if;
    execute d;
  end if;
end $$;
