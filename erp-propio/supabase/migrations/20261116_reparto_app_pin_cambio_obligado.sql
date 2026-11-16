-- App de repartidores: quien tiene el PIN inicial tiene que poner uno suyo la primera vez que entra
-- (Rober, 16/11/2026). El cambio se hace en la propia pantalla del PIN, también para «OFICINA».
-- PIN de 4, 6 u 8 cifras. El PIN inicial no se escribe en este fichero.
--   · repartidor_pin.debe_cambiar: lo pone a true quien da un PIN inicial; lo quita fn_app_rep_cambiar_pin.
--   · fn_app_rep_login devuelve «debe_cambiar» (y «supervisor»); la app no guarda la sesión hasta que se cambia.
--   · fn_app_rep_cambiar_pin rechaza los PIN más fáciles.
alter table public.repartidor_pin add column if not exists debe_cambiar boolean not null default false;

create or replace function public.fn_app_rep_login(p_repartidor text, p_pin text, p_dispositivo text default null::text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare p repartidor_pin; v_token uuid; v_nombre text;
begin
  select * into p from repartidor_pin where repartidor_codigo = p_repartidor for update;
  if not found then raise exception 'Este repartidor no tiene PIN: pídelo en la oficina.'; end if;
  if p.bloqueado_hasta > now() then
    raise exception 'Demasiados intentos. Espera % min o pide ayuda en la oficina.', ceil(extract(epoch from p.bloqueado_hasta - now()) / 60)::int;
  end if;
  if p_pin is null or extensions.crypt(p_pin, p.pin_hash) <> p.pin_hash then
    update repartidor_pin set fallos = case when fallos + 1 >= 5 then 0 else fallos + 1 end,
                              bloqueado_hasta = case when fallos + 1 >= 5 then now() + interval '15 minutes' else bloqueado_hasta end
     where repartidor_codigo = p_repartidor;
    return jsonb_build_object('ok', false, 'error', case when p.fallos + 1 >= 5 then 'PIN incorrecto. Bloqueado 15 minutos.' else 'PIN incorrecto.' end);
  end if;
  update repartidor_pin set fallos = 0, bloqueado_hasta = null where repartidor_codigo = p_repartidor;
  insert into reparto_app_sesion (repartidor_codigo, dispositivo) values (p_repartidor, left(p_dispositivo, 200)) returning token into v_token;
  select coalesce(nullif(nombre_corto, ''), nombre) into v_nombre from repartidor where codigo = p_repartidor;
  return jsonb_build_object('ok', true, 'token', v_token, 'repartidor', p_repartidor, 'nombre', v_nombre,
                            'puede_cambiar_ruta', p.puede_cambiar_ruta, 'fichaje_persona', p.fichaje_persona, 'supervisor', p.supervisor,
                            'debe_cambiar', p.debe_cambiar);
end $function$;

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
  if p_nuevo in ('1234', '0000', '1111', '123456', '12345678') then return jsonb_build_object('ok', false, 'error', 'Ese PIN es demasiado fácil: elige otro.'); end if;
  update repartidor_pin set pin_hash = extensions.crypt(p_nuevo, extensions.gen_salt('bf')), fallos = 0, bloqueado_hasta = null, debe_cambiar = false, actualizado_en = now()
   where repartidor_codigo = v_rep;
  return jsonb_build_object('ok', true);
end $$;
