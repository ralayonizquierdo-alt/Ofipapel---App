-- Repartos de GeminisWin que se quedan «Generado» (Rober, 21/11/2026). GeminisWin genera el reparto del día siguiente
-- al cerrar el del día, pero a veces deja el anterior con estado 2 en REPARTOS.DBF (48281, 48300, 48312…, 48338, 48342)
-- y había que ocultarlos a mano. Regla nueva en la ingesta del puente: un reparto de GeminisWin está CERRADO si ya
-- existe otro de GeminisWin MÁS NUEVO de la misma ruta (número mayor y día posterior).
--  · Al recibirlo (v_est) y, al final de cada pasada, a los que ya no llegan.
-- Y arreglo del candado (fn_reparto_gw_guarda): dejaba sin efecto «Anular (Nulo)» en las rutas de GeminisWin, porque
-- impedía pasar una línea a «anulado» fuera del puente. Ahora lo permite si es un NULO del ERP (nulo_en puesto).
do $$
declare d text;
  viejo text := 'v_est := case when (r ->> ''estado'')::int = 4 then 4 else 2 end;';
  nuevo text := 'v_est := case when (r ->> ''estado'')::int = 4
                  or exists (select 1 from reparto n where n.origen = ''geminiswin'' and not n.generado_erp and n.ruta_codigo = v_ruta
                                and n.numero > v_num and n.fecha > reparto_privado.gw_dia_reparto(nullif(r ->> ''fecha'', '''')::date))
                  then 4 else 2 end;';
  fin text := '  insert into reparto_gw_pasada (repartos, lineas_nuevas, lineas_cambiadas, lineas_quitadas, avisos)';
begin
  d := pg_get_functiondef('public.fn_reparto_gw_ingesta(jsonb)'::regprocedure);
  if position('n.fecha > reparto_privado.gw_dia_reparto' in d) = 0 then
    if position(viejo in d) = 0 or position(fin in d) = 0 then raise exception 'ingesta: no encuentro dónde aplicar la regla'; end if;
    d := replace(d, viejo, nuevo);
    d := replace(d, fin, '  -- Cerrados por tener ya uno más nuevo de la misma ruta (aunque GeminisWin los deje «Generado»).
  update reparto o set estado = 4, actualizado_en = now()
   where o.origen = ''geminiswin'' and not o.generado_erp and o.estado = 2
     and exists (select 1 from reparto n where n.origen = ''geminiswin'' and not n.generado_erp and n.ruta_codigo = o.ruta_codigo
                   and n.numero > o.numero and n.fecha > o.fecha);

' || fin);
    execute d;
  end if;

  d := pg_get_functiondef('public.fn_reparto_gw_guarda()'::regprocedure);
  if position('nulo_en' in d) = 0 then
    if position('elsif new.estado = ''anulado'' and old.estado <> ''anulado'' then' in d) = 0 then raise exception 'guarda: no encuentro la comprobación'; end if;
    execute replace(d, 'elsif new.estado = ''anulado'' and old.estado <> ''anulado'' then',
                       'elsif new.estado = ''anulado'' and old.estado <> ''anulado'' and new.nulo_en is null then');
  end if;
end $$;
