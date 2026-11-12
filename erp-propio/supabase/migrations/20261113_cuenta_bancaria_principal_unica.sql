-- Bancos de la ficha (Clientes, Proveedores, Transportistas…): solo UNA cuenta principal por ficha.
--
-- Hasta ahora lo cuidaba solo la pantalla (marcaba una y desmarcaba las demás en dos pasos). Ahora
-- lo garantiza la base de datos: al marcar una cuenta como principal se desmarcan las demás de esa
-- misma ficha, y un índice único impide que queden dos aunque se escriba por otro camino.
-- Cambio aditivo: no toca ningún dato existente (no había ninguna ficha con dos principales).

create or replace function public.fn_cuenta_bancaria_principal_unica()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.es_principal then
    update public.cuenta_bancaria
       set es_principal = false
     where tipo_entidad = new.tipo_entidad
       and entidad_codigo = new.entidad_codigo
       and es_principal
       and id is distinct from new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.fn_cuenta_bancaria_principal_unica() from public, anon;
grant execute on function public.fn_cuenta_bancaria_principal_unica() to authenticated, service_role;

create or replace trigger trg_cuenta_bancaria_principal_unica
  before insert or update of es_principal, tipo_entidad, entidad_codigo on public.cuenta_bancaria
  for each row
  when (new.es_principal)
  execute function public.fn_cuenta_bancaria_principal_unica();

create unique index if not exists cuenta_bancaria_una_principal
  on public.cuenta_bancaria (tipo_entidad, entidad_codigo)
  where es_principal;
