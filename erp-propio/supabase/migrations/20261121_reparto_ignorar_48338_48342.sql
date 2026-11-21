-- Repartos del jueves 19/11 (52-48338 ruta 1 y 52-48342 ruta 5): cerrados según la oficina, pero REPARTOS.DBF de
-- GeminisWin los sigue teniendo en estado 2 («Generado») y el puente los mandaba como abiertos (Rober, 21/11/2026).
-- Mismo remedio que con 48281, 48300, 48312…: el puente los ignora y se ocultan de las pantallas de reparto.
-- Los abonos y facturas a cero sin validar NO dependen ya de que el reparto esté oculto: siguen saliendo hasta validarlos.
update parametro
   set valor = (select jsonb_agg(distinct x) from jsonb_array_elements_text(valor || '["52-48338","52-48342"]'::jsonb) x)
 where clave = 'reparto.puente_gw_ignorar'
   and not (valor ? '52-48338' and valor ? '52-48342');

update reparto set oculto = true where tienda_terminal_codigo = '52' and numero in (48338, 48342) and not oculto;

do $$
declare d text := pg_get_functiondef('reparto_privado.abonos_sin_validar()'::regprocedure);
begin
  if position('where not r.oculto and r.fecha' in d) > 0 then
    execute replace(d, 'where not r.oculto and r.fecha', 'where r.fecha');
  end if;
end $$;
