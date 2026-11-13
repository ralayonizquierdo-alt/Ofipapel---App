-- App de repartidores: el repartidor puede cambiar su propio PIN (Rober, 13/11/2026).
-- Se dio a todos un PIN inicial común para arrancar el puente con GeminisWin; cada uno lo cambia
-- desde la app («🔑 Cambiar mi PIN», en la pantalla de elegir ruta). Pide el PIN actual; 5 fallos
-- bloquean 15 minutos, igual que al entrar. El PIN nuevo: de 4 a 8 cifras y distinto del actual.
create or replace function public.fn_app_rep_cambiar_pin(p_token uuid, p_actual text, p_nuevo text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_rep text := reparto_privado.sesion(p_token); p repartidor_pin;
begin
  select * into p from repartidor_pin where repartidor_codigo = v_rep for update;
  if not found then raise exception 'Este repartidor no tiene PIN: pídelo en la oficina.'; end if;
  if p.bloqueado_hasta > now() then raise exception 'Demasiados intentos. Espera unos minutos.'; end if;
  if p_actual is null or extensions.crypt(p_actual, p.pin_hash) <> p.pin_hash then
    update repartidor_pin set fallos = case when fallos + 1 >= 5 then 0 else fallos + 1 end,
                              bloqueado_hasta = case when fallos + 1 >= 5 then now() + interval '15 minutes' else bloqueado_hasta end
     where repartidor_codigo = v_rep;
    return jsonb_build_object('ok', false, 'error', 'El PIN actual no es correcto.');
  end if;
  if p_nuevo is null or p_nuevo !~ '^[0-9]{4,8}$' then return jsonb_build_object('ok', false, 'error', 'El PIN nuevo tiene que tener de 4 a 8 cifras.'); end if;
  if p_nuevo = p_actual then return jsonb_build_object('ok', false, 'error', 'El PIN nuevo tiene que ser distinto del actual.'); end if;
  update repartidor_pin set pin_hash = extensions.crypt(p_nuevo, extensions.gen_salt('bf')), fallos = 0, bloqueado_hasta = null, actualizado_en = now()
   where repartidor_codigo = v_rep;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.fn_app_rep_cambiar_pin(uuid, text, text) from public;
grant execute on function public.fn_app_rep_cambiar_pin(uuid, text, text) to anon, authenticated, service_role;
