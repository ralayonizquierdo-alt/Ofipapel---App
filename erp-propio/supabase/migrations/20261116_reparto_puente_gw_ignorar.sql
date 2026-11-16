-- Puente con GeminisWin: lista de repartos que no se traen a la app aunque sigan abiertos en
-- GeminisWin (Rober, 16/11/2026: dos repartos antiguos de la ruta 01 que no se habían cerrado allí).
-- Parámetro «reparto.puente_gw_ignorar»: ["oficina-número", …]. Para volver a traer uno, se quita de la
-- lista y el puente lo reabre solo en la siguiente pasada. Los valores concretos se ponen a mano.
insert into public.parametro (clave, valor, descripcion)
values ('reparto.puente_gw_ignorar', '[]'::jsonb, 'Puente con GeminisWin: repartos que NO se traen a la app aunque sigan abiertos en GeminisWin, como "oficina-número" (por ejemplo ["52-48281"]).')
on conflict (clave) do nothing;

do $$
declare v_def text; a text := 'if v_ruta is null or not (v_rutas ? v_ruta) then continue; end if;';
begin
  v_def := pg_get_functiondef('public.fn_reparto_gw_ingesta(jsonb)'::regprocedure);
  if position('puente_gw_ignorar' in v_def) = 0 then
    if position(a in v_def) = 0 then raise exception 'No encuentro el filtro de rutas en fn_reparto_gw_ingesta'; end if;
    execute replace(v_def, a, a || $x$
    if coalesce((select valor from parametro where clave = 'reparto.puente_gw_ignorar'), '[]'::jsonb) ? (v_ofi || '-' || v_num) then continue; end if;$x$);
  end if;
end $$;
