-- Reparto: el orden que ve el repartidor en su ruta es el mismo en todas las pantallas (Rober, 17/11/2026).
-- El de la app del repartidor (fn_app_rep_lineas): primero lo que viene de un reparto anterior, después el
-- orden de entrega, y a igualdad, población y dirección. La vista de OFICINA/PEDIDOS y el parte para cerrar
-- en GeminisWin ordenaban por orden y número de venta: ahora usan lo mismo. La ficha del reparto en el ERP
-- se cambia en RepartoFichaPage.tsx. El seguimiento y la pantalla de TV no enseñan líneas.
do $$
declare v text; a text := 'order by l.orden nulls last, l.venta_numero'; f regprocedure;
  b text := 'order by (l.reparto_anterior_numero is not null) desc, l.orden nulls last, l.poblacion, l.direccion, l.venta_numero';
begin
  foreach f in array array['public.fn_app_rep_todas_lineas(uuid,text,bigint)'::regprocedure,
                           (select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'fn_reparto_gw_partes')] loop
    v := pg_get_functiondef(f);
    if position(b in v) > 0 then continue; end if;
    if position(a in v) = 0 then raise exception 'no encuentro el orden en %', f; end if;
    execute replace(v, a, b);
  end loop;
end $$;
