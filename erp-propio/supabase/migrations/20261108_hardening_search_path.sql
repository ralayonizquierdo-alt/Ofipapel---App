-- Hardening H-10 (informe docs/HARDENING_ISO27001_SOC2_27701.md): ~70 funciones del esquema public
-- no tenían fijado el «search_path», así que usaban el del que las llamaba. Se les fija
-- «public, extensions, pg_temp» (los esquemas que ya usaban), que es lo que recomienda el
-- analizador de Supabase y ISO 27001 A.8.9. No cambia lo que hacen.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as firma
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
  loop
    execute format('alter function %s set search_path = public, extensions, pg_temp', f.firma);
  end loop;
end $$;
