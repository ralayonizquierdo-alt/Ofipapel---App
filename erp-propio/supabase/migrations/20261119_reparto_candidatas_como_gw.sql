-- Generar repartos: la propuesta del ERP sigue las mismas reglas que GeminisWin (comparación del 19/11/2026).
--  1. Abonos y albaranes a 0 € (devoluciones, recogidas, material sin cargo): GeminisWin los mete en el reparto y el
--     ERP los dejaba fuera (pedía total > 0). Ahora entran todos los que tienen importe (aunque sea 0 o negativo).
--  2. Lo no entregado de un reparto anterior ya cerrado, en rutas que no usan la app: como nadie marca nada, la línea
--     se queda «pendiente» y el ERP no lo volvía a proponer. GeminisWin sí sabe que sigue sin entregar (la venta está
--     en estado 2 o 3, «en reparto»): si la venta sigue así y su reparto anterior está cerrado, se propone como «viene
--     del anterior».
do $$
declare v text := pg_get_functiondef('reparto_privado.erp_candidatas(date)'::regprocedure);
  a1 text := $a$     and coalesce(g.total, 0) > 0
$a$;
  a2 text := $a$and (l.estado = 'no_entregado' or (l.estado in ('pendiente', 'viene_anterior') and r.generado_erp and r.estado = 2 and r.fecha < p_fecha))$a$;
  a3 text := $a$and not (r.generado_erp and r.estado = 2 and r.fecha < p_fecha)
$a$;
begin
  if position('g.gw_estado in (2, 3))' in v) > 0 then return; end if;
  if position(a1 in v) = 0 or position(a2 in v) = 0 or (length(v) - length(replace(v, a3, ''))) / length(a3) <> 1 then
    raise exception 'erp_candidatas no tiene los trozos esperados';
  end if;
  v := replace(v, a1, $a$     and g.total is not null
$a$);
  v := replace(v, a2, $a$and (l.estado = 'no_entregado' or (l.estado in ('pendiente', 'viene_anterior') and r.generado_erp and r.estado = 2 and r.fecha < p_fecha)
              or (l.estado in ('pendiente', 'viene_anterior') and r.estado <> 2 and g.gw_estado in (2, 3)))$a$);
  v := replace(v, a3, $a$and not (r.generado_erp and r.estado = 2 and r.fecha < p_fecha)
                   and not (r.estado <> 2 and g.gw_estado in (2, 3))
$a$);
  execute v;
end $$;
