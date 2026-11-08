-- Hardening (informe docs/HARDENING_ISO27001_SOC2_27701.md, hallazgos H-01 y H-03; tarea 26).
--
-- ANTES: 94 funciones SECURITY DEFINER eran ejecutables SIN iniciar sesión (con la clave pública
--        del navegador) y 176 de 182 tablas daban permiso de lectura a «anon» (solo las frenaba RLS).
-- AHORA: sin sesión solo se pueden llamar las funciones de las pantallas públicas (lista blanca
--        de abajo) y ninguna tabla. Los usuarios con sesión («authenticated») conservan todo lo que
--        tenían, así que el ERP no cambia para quien ha entrado.
--
-- LISTA BLANCA (lo que las pantallas SIN sesión necesitan de verdad):
--   Entrada:   fn_acceso_bloqueo, fn_login_por_numero, fn_nombre_por_numero, fn_registrar_acceso
--              (esta última anota las claves incorrectas, de las que depende el bloqueo de 5 fallos).
--   Fichaje:   fn_fichaje_personas, fn_fichaje_entrar, fn_fichaje_fichar, fn_fichaje_pin_cambiar,
--              fn_fichaje_pin_inicial.
--   Reparto:   fn_app_rep_* (app del repartidor, protegidas con su token) y fn_reparto_tv (TV, con clave).
-- Para añadir una función pública nueva hay que incluirla aquí A PROPÓSITO.

do $$
declare
  f record;
  permitidas text[] := array[
    'fn_acceso_bloqueo', 'fn_login_por_numero', 'fn_nombre_por_numero', 'fn_registrar_acceso',
    'fn_fichaje_personas', 'fn_fichaje_entrar', 'fn_fichaje_fichar', 'fn_fichaje_pin_cambiar', 'fn_fichaje_pin_inicial',
    'fn_reparto_tv',
    'fn_app_rep_cambiar_ruta', 'fn_app_rep_comprobar', 'fn_app_rep_fichaje', 'fn_app_rep_lineas', 'fn_app_rep_login',
    'fn_app_rep_marcar', 'fn_app_rep_orden', 'fn_app_rep_posicion', 'fn_app_rep_repartidores', 'fn_app_rep_repartos',
    'fn_app_rep_rutas_destino', 'fn_app_rep_sesion_datos', 'fn_app_rep_vincular_fichaje'
  ];
begin
  -- H-01: funciones con privilegios elevados que se podían llamar sin sesión.
  for f in
    select p.oid::regprocedure as firma
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
       and has_function_privilege('anon', p.oid, 'execute')
       and p.proname <> all (permitidas)
  loop
    execute format('revoke execute on function %s from public, anon', f.firma);
    execute format('grant execute on function %s to authenticated, service_role', f.firma);
  end loop;
end $$;

-- H-03: ninguna tabla ni secuencia del esquema public necesita ser tocada sin sesión.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Que lo nuevo nazca cerrado: una función, tabla o secuencia nueva NO queda abierta a «anon»
-- (hay que darle permiso a propósito, y en funciones públicas, añadirla a la lista de arriba).
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;
