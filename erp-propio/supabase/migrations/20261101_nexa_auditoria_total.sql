-- NEXA deja rastro de TODO lo que cambia, también en las tablas que la auditoría normal no apunta
-- (porque ya son un registro o se recalculan solas): stock, VeriFactu, contadores, copias de stock.
-- Solo se apunta cuando el cambio lo hace NEXA (erp.nexa_origen puesto): el uso normal del ERP no se llena
-- de filas, y las altas de movimiento_stock / registro_facturacion de las ventas de siempre no cambian.
-- El origen sale en auditoria.origen («NEXA · nivel N · propuesta P · motivo»), igual que en el resto.

do $$
declare
  t text;
begin
  -- Todas las operaciones en las tablas que no tenían trigger de auditoría.
  foreach t in array array['articulo_almacen_stock', 'punto_restauracion_stock_linea', 'secuencia_numeracion', 'cliente_deuda_recalculo']
  loop
    execute format('drop trigger if exists %I on public.%I', 'trg_auditoria_nexa_' || t, t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row '
                   'when (nullif(current_setting(''erp.nexa_origen'', true), '''') is not null) '
                   'execute function public.fn_auditoria_trigger()', 'trg_auditoria_nexa_' || t, t);
  end loop;
  -- movimiento_stock ya audita cambios y bajas: aquí solo las altas. registro_facturacion es inmutable: solo altas.
  foreach t in array array['movimiento_stock', 'registro_facturacion']
  loop
    execute format('drop trigger if exists %I on public.%I', 'trg_auditoria_nexa_' || t, t);
    execute format('create trigger %I after insert on public.%I for each row '
                   'when (nullif(current_setting(''erp.nexa_origen'', true), '''') is not null) '
                   'execute function public.fn_auditoria_trigger()', 'trg_auditoria_nexa_' || t, t);
  end loop;
end $$;

-- Las dos tablas de contabilidad multiempresa se crearon después de la auditoría y se quedaron sin trigger.
drop trigger if exists trg_auditoria_empresa_contable on public.empresa_contable;
create trigger trg_auditoria_empresa_contable after insert or update or delete on public.empresa_contable
  for each row execute function public.fn_auditoria_trigger();
drop trigger if exists trg_auditoria_usuario_empresa_contable on public.usuario_empresa_contable;
create trigger trg_auditoria_usuario_empresa_contable after insert or update or delete on public.usuario_empresa_contable
  for each row execute function public.fn_auditoria_trigger();

-- Guardia: ninguna tabla de negocio puede quedarse sin rastro de NEXA. Devuelve las que no lo tienen.
create or replace function public.fn_nexa_tablas_sin_rastro()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(c.relname::text order by c.relname::text), '{}')
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and c.relname not in ('auditoria', 'auditoria_aviso_visto', 'auditoria_documento_version', 'coordinacion_notas',
                           'nexa_operacion', 'nexa_propuesta', 'gw_informe', 'listado_uso', 'carga_dbf', 'web_sincronizacion_log')
     and not exists (select 1 from pg_trigger t
                      where t.tgrelid = c.oid and not t.tgisinternal and t.tgname like 'trg\_auditoria\_%')
$$;
revoke execute on function public.fn_nexa_tablas_sin_rastro() from public, anon;
grant execute on function public.fn_nexa_tablas_sin_rastro() to authenticated;
