-- La pantalla de entrada muestra, al lado del número de empleado, el nombre de esa persona
-- (como en GeminisWin). Solo devuelve algo si el número es de UN único empleado activo con usuario
-- de acceso; si no, null. Muestra el nombre, nunca datos de contacto ni la clave.
create or replace function public.fn_nombre_por_numero(p_numero text)
returns text
language sql stable security definer set search_path = public, auth as $$
  select case when count(*) = 1 then min(e.nombre) end
    from empleado e
    join auth.users u on u.id = e.auth_user_id
   where e.activo
     and btrim(coalesce(p_numero, '')) ~ '^[0-9]{1,6}$'
     and e.numero_operario is not null
     and coalesce(nullif(ltrim(btrim(e.numero_operario), '0'), ''), '0')
       = coalesce(nullif(ltrim(btrim(p_numero), '0'), ''), '0')
$$;
comment on function public.fn_nombre_por_numero(text) is
  'Nombre del empleado que corresponde a un número, para mostrarlo en la pantalla de entrada (como GeminisWin). Solo si el número es único y tiene usuario de acceso.';
