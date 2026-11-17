-- Espejo de GeminisWin: un dato imposible no bloquea la carga; se aparta y queda como aviso (17/11/2026).
--
-- Qué pasó: la carga de artículos se paró con «numeric field overflow» a falta de 17.433. Era UN artículo
-- (00003001311) que en GeminisWin tiene un IGIC del 8.200 %, y articulo.igic_pct es numeric(5,2). La columna
-- no se puede ampliar sin rehacer el listado v_lst_articulos, y además un 8.200 % es un error de tecleo en
-- GeminisWin, no un dato que haya que conservar.
--
--  · espejo_gw_aviso: datos de GeminisWin que no se han podido copiar tal cual, con su valor original, para
--    que alguien los corrija ALLÍ. Al corregirlos, la siguiente copia los trae bien y el aviso queda resuelto
--    (resuelto_en), sin borrarse: se conserva el historial.
--  · gw_n_tope(datos, campo, tope, tabla, clave): el número del campo; si se sale del tope, lo apunta como
--    aviso y devuelve null (la carga pone entonces su valor por defecto).
--  · fn_carga_gw_articulo usa gw_n_tope para el IGIC. Si otro campo diera el mismo problema, misma receta.

create table if not exists public.espejo_gw_aviso (
  tabla text not null,
  clave text not null,
  campo text not null,
  valor text,
  motivo text not null,
  en timestamptz not null default now(),
  resuelto_en timestamptz,
  primary key (tabla, clave, campo)
);
alter table public.espejo_gw_aviso enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'espejo_gw_aviso' and policyname = 'espejo_gw_aviso_lee') then
    create policy espejo_gw_aviso_lee on public.espejo_gw_aviso for select to authenticated using (public.fn_es_administrador());
  end if;
end $$;
revoke all on public.espejo_gw_aviso from public, anon, authenticated;
grant select on public.espejo_gw_aviso to authenticated;

create or replace function public.gw_n_tope(d jsonb, k text, p_tope numeric, p_tabla text, p_clave text)
returns numeric language plpgsql volatile set search_path to 'public', 'extensions', 'pg_temp' as $$
declare v numeric := public.gw_n(d, k);
begin
  if v is not null and abs(v) >= p_tope then
    insert into espejo_gw_aviso (tabla, clave, campo, valor, motivo)
    values (p_tabla, p_clave, k, v::text, format('Valor fuera de lo admitido (hasta %s): no se ha copiado', p_tope))
    on conflict (tabla, clave, campo) do update set valor = excluded.valor, motivo = excluded.motivo, en = now(), resuelto_en = null;
    return null;
  end if;
  update espejo_gw_aviso set resuelto_en = now() where tabla = p_tabla and clave = p_clave and campo = k and resuelto_en is null;
  return v;
end $$;
revoke all on function public.gw_n_tope(jsonb, text, numeric, text, text) from public, anon, authenticated;
grant execute on function public.gw_n_tope(jsonb, text, numeric, text, text) to service_role;

do $$
declare v text; a text := $a$coalesce(gw_n(d,'IGIC'), 0)$a$; b text := $b$coalesce(public.gw_n_tope(d, 'IGIC', 1000, 'ARTICULO', clave), 0)$b$;
begin
  v := pg_get_functiondef('public.fn_carga_gw_articulo()'::regprocedure);
  if position(b in v) > 0 then return; end if;
  if position(a in v) = 0 then raise exception 'no encuentro el IGIC en fn_carga_gw_articulo'; end if;
  execute replace(v, a, b);
end $$;
