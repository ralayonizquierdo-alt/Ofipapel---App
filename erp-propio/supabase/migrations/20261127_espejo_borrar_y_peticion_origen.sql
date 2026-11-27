-- 27/11/2026. Aplicado en la base como espejo_gw_borrar, gw_peticion_origen y compras_temporada_anticipo.
--
-- 1) fn_espejo_gw_borrar(p_tabla, p_claves jsonb, p_equipo): borra de la copia los registros que ya no existen en
--    GeminisWin (nota 179 de Cowork). El espejo, al acabar una lectura COMPLETA de una tabla, manda
--    POST espejo-gw-ingesta { tabla, borrar: ['IDOFICINA|NUMERO|LINEA|COD_INTERN', …] } (mismo formato que la «c»).
--    Por ahora solo PEDIDLIN → gw_pedido_proveedor_linea (las líneas borradas al editar un pedido se quedaban y el
--    Gestor contaba en camino casi el doble). Otras tablas se ignoran (respuesta «ignorada: true»).
-- 2) gw_peticion: origen_tipo (PEC/VTA/USU), origen_oficina, origen_numero, origen_almacen, desde TIPOORIGEN,
--    IDOFICORIG, IDMOVORIG, IDALMORIG de PETICION (nota 180). fn_carga_gw_gw_peticion los copia.
-- 3) Temporada con anticipo: en fn_compras_temporada_recalcular, los artículos de temporada (algún mes con peso >= 2,
--    del artículo o de su familia) miran 75 días más adelante: lo escolar (jun-sep) se empieza a comprar en abril.
alter table public.gw_peticion add column if not exists origen_tipo text;
alter table public.gw_peticion add column if not exists origen_oficina text;
alter table public.gw_peticion add column if not exists origen_numero bigint;
alter table public.gw_peticion add column if not exists origen_almacen text;
