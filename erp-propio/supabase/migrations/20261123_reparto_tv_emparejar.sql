-- Vincular la TV con un código corto (Rober, 23/11/2026: en la Smart TV no se puede escribir el enlace largo, ni instalar
-- nada, ni abrir el correo). La TV abre una dirección corta (/tv), pide un código de 8 letras/números y lo enseña en grande;
-- en el ERP (Seguimiento de Repartos → Enlace para la TV → «Vincular TV») se escribe ese código y la TV recibe sola su clave.
-- La clave larga sigue siendo la de siempre (reparto_tv_clave, solo se guarda su sha256); aquí solo hay un buzón temporal
-- de 15 minutos, de un solo uso: al recogerla la TV, se borra. No lleva auditoría a propósito: auditaría la clave en claro.
create table if not exists public.reparto_tv_emparejar (
  codigo text primary key,
  clave text,
  creado_en timestamptz not null default now()
);
alter table public.reparto_tv_emparejar enable row level security; -- sin políticas: solo se toca por las funciones de abajo

create or replace function public.fn_reparto_tv_pedir() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_alfabeto constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; -- sin 0/O/1/I para que se lea bien en la TV
  v_codigo text; v_b bytea; i int;
begin
  delete from reparto_tv_emparejar where creado_en < now() - interval '15 minutes';
  if (select count(*) from reparto_tv_emparejar) >= 200 then raise exception 'Demasiadas pantallas esperando: prueba dentro de unos minutos.'; end if;
  loop
    v_b := extensions.gen_random_bytes(8); v_codigo := '';
    for i in 0..7 loop v_codigo := v_codigo || substr(v_alfabeto, (get_byte(v_b, i) % 32) + 1, 1); end loop;
    begin
      insert into reparto_tv_emparejar (codigo) values (v_codigo);
      return v_codigo;
    exception when unique_violation then null;
    end;
  end loop;
end $$;
grant execute on function public.fn_reparto_tv_pedir() to anon, authenticated;

-- La TV pregunta cada pocos segundos: null = todavía no lo han vinculado; la clave = vinculada (y se borra); error = caducó.
create or replace function public.fn_reparto_tv_recoger(p_codigo text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_clave text; v_existe boolean;
begin
  delete from reparto_tv_emparejar where creado_en < now() - interval '15 minutes';
  select clave, true into v_clave, v_existe from reparto_tv_emparejar where codigo = upper(btrim(coalesce(p_codigo, '')));
  if not coalesce(v_existe, false) then raise exception 'codigo_tv' using hint = 'El código ha caducado: se pide uno nuevo.'; end if;
  if v_clave is null then return null; end if;
  delete from reparto_tv_emparejar where codigo = upper(btrim(p_codigo));
  return v_clave;
end $$;
grant execute on function public.fn_reparto_tv_recoger(text) to anon, authenticated;

-- Desde el ERP: escribe el código que sale en la TV. Crea una clave nueva (la anterior de la TV deja de valer, como al crear el
-- enlace) y se la deja a la TV en el buzón.
create or replace function public.fn_reparto_tv_vincular(p_codigo text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_cod text := upper(btrim(coalesce(p_codigo, ''))); v text := encode(extensions.gen_random_bytes(18), 'hex');
begin
  if not fn_puede('/repartos') then raise exception 'Sin permiso de Repartos.' using errcode = '42501'; end if;
  delete from reparto_tv_emparejar where creado_en < now() - interval '15 minutes';
  if not exists (select 1 from reparto_tv_emparejar where codigo = v_cod and clave is null) then
    raise exception 'Ese código no está esperando en ninguna TV. Mira el código que sale ahora en la pantalla de la TV (dura 15 minutos) y vuelve a escribirlo.';
  end if;
  insert into reparto_tv_clave (id, clave_hash, creada_en, creada_por)
  values (1, encode(extensions.digest(v, 'sha256'), 'hex'), now(), coalesce(fn_empleado_actual(), 'ERP'))
  on conflict (id) do update set clave_hash = excluded.clave_hash, creada_en = now(), creada_por = excluded.creada_por;
  update reparto_tv_emparejar set clave = v where codigo = v_cod;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.fn_reparto_tv_vincular(text) to authenticated;
