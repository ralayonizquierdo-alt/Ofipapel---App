-- Gestor de Roturas: al registrar una rotura hay que decir SIEMPRE qué desperfecto presenta
-- (Rober, 12/11/2026). La pantalla ya lo exige; esto lo asegura también en el servidor, incluidas las
-- roturas guardadas sin cobertura. No afecta a los expedientes traídos de la app antigua (origen_id).
create or replace function roturas_privado.desperfecto_obligatorio() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.origen_id is null and length(btrim(coalesce(new.descripcion, ''))) < 3 then
    raise exception 'Di qué desperfecto presenta: es obligatorio.' using errcode = '22023';
  end if;
  return new;
end $$;
create or replace trigger trg_rotura_desperfecto before insert on public.rotura_expediente
  for each row execute function roturas_privado.desperfecto_obligatorio();
revoke execute on function roturas_privado.desperfecto_obligatorio() from public, anon, authenticated;
