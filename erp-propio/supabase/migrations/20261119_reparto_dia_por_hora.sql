-- Puente de reparto: el día del reparto según la hora a la que se genera (Rober, 19/11/2026: «en la app se cargó el
-- reparto como el viernes, cuando debería ser para el jueves… se hizo esta mañana»).
--
-- El programa del PC supone que el reparto que se genera en GeminisWin un día es para el día laborable siguiente
-- (REPARTOS.FECHA + 1), porque normalmente David lo genera por la tarde. Hoy lo generó a las 8:30 para el mismo día y
-- salió con fecha de mañana. Y la ingesta volvía a poner esa fecha en cada pasada.
--   · Un reparto NUEVO que llega antes de las 13:00 (hora de Canarias) en un día laborable es para ese mismo día.
--     Por la tarde, el día que manda el PC (el laborable siguiente), como hasta ahora.
--   · Una vez creado, la ingesta ya no le cambia el día.
--   · Se corrigen los repartos de hoy (48338 a 48345), que salieron para el viernes 20.
create or replace function reparto_privado.gw_dia_reparto(p date)
returns date language plpgsql stable set search_path to 'public' as $$
declare v_ahora timestamp := now() at time zone 'Atlantic/Canary'; v_hoy date := (now() at time zone 'Atlantic/Canary')::date;
begin
  if p is null then return v_hoy; end if;
  if extract(hour from v_ahora) < 13 and p > v_hoy and extract(isodow from v_hoy) < 6 then return v_hoy; end if;
  return p;
end $$;
revoke all on function reparto_privado.gw_dia_reparto(date) from public, anon, authenticated;

do $$
declare v text := pg_get_functiondef('public.fn_reparto_gw_ingesta(jsonb)'::regprocedure);
begin
  if position('gw_dia_reparto' in v) > 0 then return; end if;
  if position($a$coalesce(nullif(r ->> 'fecha', '')::date, current_date)$a$ in v) = 0
     or position($a$set ruta_codigo = excluded.ruta_codigo, fecha = excluded.fecha, estado = excluded.estado,$a$ in v) = 0
     or position($a$is distinct from (excluded.ruta_codigo, excluded.fecha, excluded.estado,$a$ in v) = 0 then
    raise exception 'fn_reparto_gw_ingesta no tiene los trozos esperados';
  end if;
  v := replace(v, $a$coalesce(nullif(r ->> 'fecha', '')::date, current_date)$a$, $a$reparto_privado.gw_dia_reparto(nullif(r ->> 'fecha', '')::date)$a$);
  v := replace(v, $a$set ruta_codigo = excluded.ruta_codigo, fecha = excluded.fecha, estado = excluded.estado,$a$,
                  $a$set ruta_codigo = excluded.ruta_codigo, estado = excluded.estado,$a$);
  v := replace(v, $a$is distinct from (excluded.ruta_codigo, excluded.fecha, excluded.estado,$a$,
                  $a$is distinct from (excluded.ruta_codigo, reparto.fecha, excluded.estado,$a$);
  execute v;
end $$;

update public.reparto set fecha = date '2026-11-19', actualizado_en = now()
 where origen = 'geminiswin' and numero between 48338 and 48345 and fecha = date '2026-11-20';
