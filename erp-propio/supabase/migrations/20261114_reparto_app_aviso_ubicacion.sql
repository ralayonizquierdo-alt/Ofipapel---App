-- App de repartidores: aviso de ubicación (Rober, 14/11/2026).
-- La primera vez que entra, el repartidor lee el aviso (qué ubicación se recoge, para qué, quién la
-- ve y cuánto se guarda) y pulsa «He leído y entiendo». Queda constancia con fecha, hora y versión
-- del texto. No es un consentimiento: en una relación laboral la base legal es el control de la
-- actividad (art. 20.3 del Estatuto de los Trabajadores) con el deber de informar del art. 90 de la
-- LO 3/2018. El texto vive en src/reparto-app/avisoUbicacion.ts; si cambia, se sube la versión y
-- se vuelve a enseñar a todos.
create table if not exists public.reparto_aviso_leido (
  repartidor_codigo text not null references public.repartidor(codigo),
  version text not null,
  leido_en timestamptz not null default now(),
  dispositivo text,
  primary key (repartidor_codigo, version)
);
comment on table public.reparto_aviso_leido is
  'App de repartidores: constancia de que cada repartidor ha leído el aviso de ubicación (art. 90 LOPDGDD), con fecha, hora y versión del texto.';
alter table public.reparto_aviso_leido enable row level security;
revoke all on public.reparto_aviso_leido from public, anon, authenticated;
grant select on public.reparto_aviso_leido to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reparto_aviso_leido' and policyname = 'reparto_aviso_leido_lee') then
    create policy reparto_aviso_leido_lee on public.reparto_aviso_leido for select to authenticated using ((select public.fn_puede('/repartos')));
  end if;
end $$;

create or replace function public.fn_app_rep_aviso(p_token uuid, p_version text, p_aceptar boolean default false, p_dispositivo text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rep text := reparto_privado.sesion(p_token); v_en timestamptz;
begin
  if coalesce(p_version, '') = '' then raise exception 'Falta la versión del aviso.'; end if;
  if p_aceptar then
    insert into reparto_aviso_leido (repartidor_codigo, version, dispositivo) values (v_rep, p_version, left(p_dispositivo, 200))
    on conflict (repartidor_codigo, version) do nothing;
  end if;
  select leido_en into v_en from reparto_aviso_leido where repartidor_codigo = v_rep and version = p_version;
  return jsonb_build_object('leido', v_en is not null, 'leido_en', v_en);
end $$;
revoke execute on function public.fn_app_rep_aviso(uuid, text, boolean, text) from public;
grant execute on function public.fn_app_rep_aviso(uuid, text, boolean, text) to anon, authenticated, service_role;
