-- Seguridad en la base de datos (1.ª tanda): tablas de configuración y administración solo las
-- escriben los administradores, y los registros VeriFactu y la auditoría no se tocan por la API.
-- Inventario, motivos y propuesta siguiente en docs/SEGURIDAD_BD.md.
--
-- Cómo funciona:
-- - Todas las tablas tienen ya una política PERMISSIVE «autenticados = todo» (o solo lectura).
--   Aquí se AÑADEN políticas RESTRICTIVE para INSERT/UPDATE/DELETE: una fila solo se puede
--   escribir si se cumplen la permisiva Y todas las restrictivas. La lectura no cambia.
-- - Las funciones SECURITY DEFINER (fn_siguiente_numero, fn_ajustar_contador,
--   fn_auditoria_trigger, fn_verifactu_registrar…) son de «postgres», que tiene BYPASSRLS: no les
--   afecta nada de esto. Tampoco a la carga de GeminisWin (se lanza por SQL como postgres) ni a
--   las Edge Functions con service_role (empleados-acceso).
-- - Idempotente: cada política se crea solo si no existe. Sin DROP / DELETE / TRUNCATE.

do $$
declare
  t text;
  admin_tablas text[] := array[
    'tienda_terminal', 'forma_pago', 'secuencia_numeracion', 'verifactu_configuracion',
    'web_configuracion', 'configuracion_contable', 'configuracion_contable_igic', 'empleado',
    'ejercicio', 'nivel_tarifa', 'tipo_documento_numerable', 'tipo_documento_contable'];
begin
  -- 1) Configuración y administración: escribir, solo administradores.
  --    (empresa ya las tiene desde 20261027_archivo_maestros.sql: admin_*_empresa.)
  foreach t in array admin_tablas loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'admin_escribe_' || t) then
      execute format('create policy %I on public.%I as restrictive for insert to authenticated with check ((select public.fn_es_administrador()))', 'admin_escribe_' || t, t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'admin_modifica_' || t) then
      execute format('create policy %I on public.%I as restrictive for update to authenticated using ((select public.fn_es_administrador())) with check ((select public.fn_es_administrador()))', 'admin_modifica_' || t, t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'admin_borra_' || t) then
      execute format('create policy %I on public.%I as restrictive for delete to authenticated using ((select public.fn_es_administrador()))', 'admin_borra_' || t, t);
    end if;
  end loop;

  -- 2) Series de facturación: modificar y borrar, solo administradores. Dar de ALTA una serie
  --    también puede quien tenga Facturas o Generar Facturas (las dos pantallas crean series
  --    nuevas sobre la marcha: FacturacionPage y GenerarFacturasPage).
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'serie_facturacion' and policyname = 'admin_escribe_serie_facturacion') then
    create policy admin_escribe_serie_facturacion on public.serie_facturacion as restrictive for insert to authenticated
      with check ((select public.fn_es_administrador())
                  or (select public.fn_tiene_permiso('/facturacion'))
                  or (select public.fn_tiene_permiso('/generar-facturas')));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'serie_facturacion' and policyname = 'admin_modifica_serie_facturacion') then
    create policy admin_modifica_serie_facturacion on public.serie_facturacion as restrictive for update to authenticated
      using ((select public.fn_es_administrador())) with check ((select public.fn_es_administrador()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'serie_facturacion' and policyname = 'admin_borra_serie_facturacion') then
    create policy admin_borra_serie_facturacion on public.serie_facturacion as restrictive for delete to authenticated
      using ((select public.fn_es_administrador()));
  end if;

  -- 3) Registros VeriFactu: ya solo tenían política de lectura y el trigger
  --    trg_registro_facturacion_inmutable. Se cierra explícitamente por si algún día se añade una
  --    permisiva amplia: solo los escribe fn_verifactu_registrar (SECURITY DEFINER).
  --    Auditoría: solo la escribe fn_auditoria_trigger (SECURITY DEFINER); por la API, ni alta
  --    (no se pueden fabricar apuntes) ni cambios ni borrados. La lectura sigue abierta.
  foreach t in array array['registro_facturacion', 'auditoria'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'inmutable_alta_' || t) then
      execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (false)', 'inmutable_alta_' || t, t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'inmutable_modifica_' || t) then
      execute format('create policy %I on public.%I as restrictive for update to authenticated using (false) with check (false)', 'inmutable_modifica_' || t, t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'inmutable_borra_' || t) then
      execute format('create policy %I on public.%I as restrictive for delete to authenticated using (false)', 'inmutable_borra_' || t, t);
    end if;
  end loop;
end $$;

-- 4) TRUNCATE se salta las RLS. La API REST no lo expone, pero ningún cliente lo necesita:
--    se quita a anon y authenticated (postgres y service_role lo conservan).
revoke truncate on all tables in schema public from anon, authenticated;

-- 5) Sin sesión no hace falta pedir números de documento ni consultar permisos: anon podía
--    llamar a fn_siguiente_numero y gastar números (huecos en la numeración de facturas).
revoke execute on function public.fn_siguiente_numero(text, text, text) from public, anon;
revoke execute on function public.fn_tiene_permiso(text) from public, anon;
grant execute on function public.fn_siguiente_numero(text, text, text) to authenticated;
grant execute on function public.fn_tiene_permiso(text) to authenticated;
