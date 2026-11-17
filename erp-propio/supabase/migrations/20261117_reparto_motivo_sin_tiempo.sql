-- App de reparto: nuevo motivo de «No entregado»: «No me dio tiempo» (Rober, 17/11/2026).
-- Se añade a la lista que valida la función de marcar (sea cual sea su versión actual) y a la restricción.
do $$
declare r record; v text; a text := '''no_contesta'', ''direccion'', ''ausente'', ''cerrado'', ''otro'''; n int := 0;
begin
  for r in select p.oid from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
            where ns.nspname in ('public', 'reparto_privado') and p.prokind = 'f' and pg_get_functiondef(p.oid) like '%' || a || '%' loop
    v := pg_get_functiondef(r.oid);
    execute replace(v, a, '''no_contesta'', ''direccion'', ''ausente'', ''cerrado'', ''sin_tiempo'', ''otro''');
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'No encuentro la función que valida el motivo.'; end if;
  alter table public.reparto_linea
    drop constraint reparto_linea_motivo_check,
    add constraint reparto_linea_motivo_check
      check (motivo_no_entrega is null or motivo_no_entrega in ('no_contesta', 'direccion', 'ausente', 'cerrado', 'sin_tiempo', 'otro'));
end $$;
