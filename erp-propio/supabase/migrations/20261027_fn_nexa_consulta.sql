-- NEXA (asistente del ERP): consultas de SOLO LECTURA hechas por la IA en nombre del usuario.
--
-- La Edge Function «nexa» llama a esta función por RPC con el JWT del usuario (nunca con la
-- service role), así que se aplican exactamente sus permisos y RLS (SECURITY INVOKER).
--
-- Capas de seguridad, de más a menos importante:
--   1. La transacción pasa a SOLO LECTURA antes de ejecutar nada (transaction_read_only = on).
--      Aunque algo se cuele, Postgres rechaza cualquier escritura, nextval, NOTIFY, etc.
--   2. La consulta se ejecuta envuelta como subconsulta: un CTE con DELETE/UPDATE/INSERT
--      dentro de una subconsulta es un error de Postgres, y no cabe una segunda sentencia.
--   3. Filtro previo: una sola sentencia, empieza por SELECT/WITH, sin palabras de escritura
--      ni DDL, sin funciones peligrosas (pg_sleep, set_config, dblink, query_to_xml…),
--      sin esquemas internos (auth, vault, storage…).
--   4. statement_timeout de 8 s (el rol authenticated ya lo tiene así en Supabase).
-- Devuelve {"total": n, "filas": [... como mucho 200 ...], "truncado": bool}.
--
-- FUTURO (no construido): las acciones que modifiquen datos NO irán por aquí. Serán
-- funciones concretas (p. ej. crear un pedido) que NEXA proponga y el usuario confirme
-- explícitamente, comprobando el grupo de acceso con fn_tiene_permiso.

create or replace function public.fn_nexa_consulta(p_sql text)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_sql text;
  v_limpio text;
  v_total bigint;
  v_filas jsonb;
begin
  -- 1) Solo lectura para el resto de la transacción (pasar a read only siempre está permitido).
  set local transaction_read_only = on;
  set local statement_timeout = '8s';

  if p_sql is null or btrim(p_sql) = '' then
    raise exception 'NEXA: consulta vacía';
  end if;
  if length(p_sql) > 20000 then
    raise exception 'NEXA: consulta demasiado larga';
  end if;

  v_sql := regexp_replace(p_sql, '[[:space:];]+$', '');

  -- Cadenas con escapes de barra (E'...') o dólares complican el análisis: no se aceptan.
  if v_sql ~* '(^|[^a-z0-9_])e''' or position('$' in v_sql) > 0 then
    raise exception 'NEXA: no se admiten cadenas E''...'' ni $';
  end if;

  -- Texto sin literales ni comentarios, en minúsculas, para el análisis.
  v_limpio := regexp_replace(v_sql, '''([^'']|'''')*''', '''''', 'g');
  v_limpio := regexp_replace(v_limpio, '--[^\n]*', ' ', 'g');
  v_limpio := regexp_replace(v_limpio, '/\*.*?\*/', ' ', 'g');
  v_limpio := lower(v_limpio);

  if position(';' in v_limpio) > 0 then
    raise exception 'NEXA: solo se permite una sentencia';
  end if;
  if v_limpio !~ '^[[:space:]]*\(?[[:space:]]*(select|with)\M' then
    raise exception 'NEXA: solo se permiten consultas SELECT o WITH';
  end if;
  if v_limpio ~ '\m(insert|update|delete|merge|truncate|drop|alter|create|grant|revoke|copy|call|vacuum|analyze|reindex|cluster|lock|listen|unlisten|notify|refresh|prepare|execute|deallocate|discard|reset|begin|commit|rollback|savepoint|checkpoint|import|security|owner)\M' then
    raise exception 'NEXA: la consulta contiene una orden que no es de lectura';
  end if;
  if v_limpio ~ '\mfor[[:space:]]+(update|share|no[[:space:]]+key|key)\M' or v_limpio ~ '\minto\M' then
    raise exception 'NEXA: la consulta contiene una orden que no es de lectura';
  end if;
  if v_limpio ~ '\m(pg_sleep|set_config|current_setting|pg_advisory|pg_notify|pg_terminate|pg_cancel|pg_read|pg_ls_|pg_stat_file|lo_[a-z]|dblink|pg_reload|pg_rotate|pg_logical|pg_replication|pg_create|pg_drop|pg_stat_reset|pg_promote|pg_switch|query_to_|table_to_|cursor_to_|schema_to_|database_to_|txid_|pg_current_xact|pg_export|pg_import)' then
    raise exception 'NEXA: la consulta usa una función no permitida';
  end if;
  if v_limpio ~ '\m(auth|vault|storage|realtime|supabase_functions|supabase_migrations|net|cron|pgsodium|graphql|graphql_public|extensions|pgbouncer)[[:space:]]*\.' then
    raise exception 'NEXA: solo se pueden consultar las tablas del ERP';
  end if;

  -- 2) Ejecutar como subconsulta, con 200 filas como mucho y el total real.
  execute format(
    'select count(*), coalesce(jsonb_agg(to_jsonb(s) - ''__nexa_n'' order by s.__nexa_n) filter (where s.__nexa_n <= 200), ''[]''::jsonb)
       from (select row_number() over () as __nexa_n, q.* from (%s) q) s',
    v_sql)
  into v_total, v_filas;

  return jsonb_build_object('total', v_total, 'filas', v_filas, 'truncado', v_total > 200);
end;
$$;

revoke all on function public.fn_nexa_consulta(text) from public;
revoke all on function public.fn_nexa_consulta(text) from anon;
grant execute on function public.fn_nexa_consulta(text) to authenticated;

comment on function public.fn_nexa_consulta(text) is
  'NEXA: ejecuta una única consulta SELECT del usuario en una transacción de solo lectura (SECURITY INVOKER, RLS del usuario), máx. 200 filas.';
