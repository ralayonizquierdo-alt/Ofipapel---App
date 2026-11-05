-- Entrar en el ERP con el número de empleado (como en GeminisWin) + contraseña.
-- Sigue valiendo el nombre de usuario (luis, rober, david…) mientras se desarrolla.
--
-- La pantalla de entrada, si lo escrito son solo cifras, pregunta aquí a qué usuario de acceso
-- corresponde ese número y entra con él. Solo devuelve algo si el número es de UN único empleado
-- activo con usuario de acceso; si no, devuelve null (misma respuesta para «no existe» y «repetido»).
-- La contraseña la sigue comprobando Supabase Auth: esta función no abre nada por sí sola, y el
-- bloqueo por intentos fallidos (fn_acceso_bloqueo) sigue actuando sobre el usuario resuelto.
create or replace function public.fn_login_por_numero(p_numero text)
returns text
language sql stable security definer set search_path = public, auth as $$
  select case when count(*) = 1 then min(u.email) end
    from empleado e
    join auth.users u on u.id = e.auth_user_id
   where e.activo
     and btrim(coalesce(p_numero, '')) ~ '^[0-9]{1,6}$'
     and e.numero_operario is not null
     and coalesce(nullif(ltrim(btrim(e.numero_operario), '0'), ''), '0')
       = coalesce(nullif(ltrim(btrim(p_numero), '0'), ''), '0')
$$;
comment on function public.fn_login_por_numero(text) is
  'Número de empleado de GeminisWin → usuario de acceso del ERP (solo si es único). Para la pantalla de entrada.';
