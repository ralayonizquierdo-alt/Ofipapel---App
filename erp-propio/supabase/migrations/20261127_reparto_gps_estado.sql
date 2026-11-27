-- Estado de la ubicación de cada repartidor (Rober, 27/11/2026): la app ya no tiene «Ahora no»; pide la
-- ubicación al abrir y avisa aquí si el móvil la da o la tiene bloqueada, para que la oficina sepa a quién decirle
-- qué tocar. Control de repartos lo enseña en la tarjeta de cada ruta.
create table if not exists public.reparto_gps_estado (
  repartidor_codigo text primary key,
  estado text not null check (estado in ('activa', 'bloqueada', 'sin_senal', 'no_disponible')),
  en timestamptz not null default now(),
  dispositivo text
);
alter table public.reparto_gps_estado enable row level security;

create or replace function public.fn_app_rep_gps_estado(p_token uuid, p_estado text, p_dispositivo text default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare v_rep text := reparto_privado.sesion(p_token);
begin
  if p_estado not in ('activa', 'bloqueada', 'sin_senal', 'no_disponible') then raise exception 'Estado no válido.'; end if;
  insert into reparto_gps_estado (repartidor_codigo, estado, en, dispositivo) values (v_rep, p_estado, now(), left(p_dispositivo, 300))
  on conflict (repartidor_codigo) do update set estado = excluded.estado, en = excluded.en, dispositivo = coalesce(excluded.dispositivo, reparto_gps_estado.dispositivo);
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.fn_app_rep_gps_estado(uuid, text, text) to anon, authenticated;

do $$
declare v text := pg_get_functiondef('reparto_privado.seguimiento'::regproc);
begin
  if position('reparto_gps_estado' in v) > 0 then return; end if;
  if position('''repartidor'', r.repartidor_codigo,' in v) = 0 then raise exception 'seguimiento: patrón'; end if;
  v := replace(v, '''repartidor'', r.repartidor_codigo,',
    '''repartidor'', r.repartidor_codigo, ''gps'', (select jsonb_build_object(''estado'', g.estado, ''en'', g.en) from reparto_gps_estado g where g.repartidor_codigo = r.repartidor_codigo),');
  execute v;
end $$;
