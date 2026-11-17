-- Espejo de GeminisWin: tandas de 2.500 filas y cronómetro por paso (17/11/2026).
--
-- Medido en la carga real de artículos: una tanda de ~4.500 artículos NUEVOS tarda 35 segundos (cada
-- artículo son además 7 filas de precios por tarifa), no los 14 que salían con artículos que ya existían.
-- La conexión se corta a los 60: con 5.000 filas quedaba demasiado justo. Ahora cada tanda son 2.500 como
-- mucho, y en cada pasada queda apuntado cuánto tardó cada paso («seg»), para ver cuál es el lento.
do $$
declare v text; a text; b text;
begin
  v := pg_get_functiondef('public.fn_espejo_gw_procesar(text, text)'::regprocedure);
  a := $a$    execute format('select to_jsonb(public.%I())', 'fn_carga_gw_' || p) into v_r;
    v := v || jsonb_build_array(jsonb_build_object('paso', p, 'resultado', v_r));$a$;
  b := $b$    v_t0 := clock_timestamp();
    execute format('select to_jsonb(public.%I())', 'fn_carga_gw_' || p) into v_r;
    v := v || jsonb_build_array(jsonb_build_object('paso', p, 'seg', round(extract(epoch from clock_timestamp() - v_t0)::numeric, 1), 'resultado', v_r));$b$;
  if position(b in v) = 0 then
    if position(a in v) = 0 then raise exception 'no encuentro el bucle de pasos'; end if;
    v := replace(v, a, b);
    v := replace(v, 'v_desde timestamptz; v_hasta timestamptz;', 'v_desde timestamptz; v_hasta timestamptz; v_t0 timestamptz;');
  end if;
  v := replace(v, 'v_max constant int := 5000', 'v_max constant int := 2500');
  execute v;
end $$;
