-- Ctrl+Intro (lista ordenada de GeminisWin) en las fichas que faltaban (Rober, 22/11/2026: «todo es todo»): ventas/TPV,
-- facturas de proveedor, pagos a proveedor, cobros de clientes, traspasos y números de serie. Fuentes nuevas en
-- gw_lista_ordenada (invoker: cada lista sigue las reglas de acceso de su tabla).
do $$
declare v_def text; v_fin int; v_bloque text;
begin
  v_def := pg_get_functiondef('public.gw_lista_ordenada(text, text, text, text, text, text, integer, boolean)'::regprocedure);
  if position('''traspaso_almacen''' in v_def) > 0 then return; end if;
  v_bloque := $blk$    when 'venta' then
      v_from := '(select v.*, lpad(v.numero::text, 12, ''0'') as numero_ord, to_char(v.fecha, ''YYYYMMDD'') || coalesce(v.hora, '''') as fecha_ord, '
        || 'coalesce(nullif(v.nombre_cliente, ''''), c.nombre) as cliente_nombre from venta v left join cliente c on c.codigo = v.cliente_codigo) t';
      v_key := '(t.tienda_terminal_codigo || ''|'' || t.numero::text)';
      v_campos := array['numero_ord', 'fecha_ord', 'cliente_codigo', 'cliente_nombre'];
      v_cols := 'jsonb_build_object(''tienda_terminal_codigo'', t.tienda_terminal_codigo, ''numero'', t.numero, '
        || '''fecha'', to_char(t.fecha, ''DD/MM/YYYY''), ''hora'', t.hora, ''cliente_codigo'', t.cliente_codigo, '
        || '''cliente_nombre'', t.cliente_nombre, ''tipo_credito'', t.tipo_credito, ''total'', t.total)';
    when 'factura_proveedor' then
      v_from := '(select f.*, lpad(f.id::text, 12, ''0'') as id_ord, to_char(f.fecha_factura, ''YYYYMMDD'') as fecha_ord, '
        || 'upper(coalesce(f.numero_factura_externo, '''')) as numero_factura, pr.nombre as proveedor_nombre '
        || 'from factura_proveedor f left join proveedor pr on pr.codigo = f.proveedor_codigo) t';
      v_key := '(t.tienda_terminal_codigo || ''|'' || t.id::text)';
      v_campos := array['id_ord', 'numero_factura', 'fecha_ord', 'proveedor_codigo', 'proveedor_nombre'];
      v_cols := 'jsonb_build_object(''tienda_terminal_codigo'', t.tienda_terminal_codigo, ''id'', t.id, '
        || '''numero_factura'', t.numero_factura_externo, ''fecha'', to_char(t.fecha_factura, ''DD/MM/YYYY''), '
        || '''proveedor_codigo'', t.proveedor_codigo, ''proveedor_nombre'', t.proveedor_nombre, ''total'', t.total)';
    when 'pago_proveedor' then
      v_from := '(select g.*, lpad(g.codigo_pago::text, 12, ''0'') || lpad(coalesce(g.id_pago, 0)::text, 4, ''0'') as numero_ord, '
        || 'to_char(g.fecha, ''YYYYMMDD'') as fecha_ord, upper(coalesce(g.numero_factura_externa, '''')) as numero_factura from pago_proveedor g) t';
      v_key := '(t.tienda_terminal_codigo || ''|'' || t.codigo_pago::text || ''|'' || coalesce(t.id_pago, 0)::text)';
      v_campos := array['numero_ord', 'fecha_ord', 'receptor_codigo', 'receptor_nombre', 'numero_factura'];
      v_cols := 'jsonb_build_object(''tienda_terminal_codigo'', t.tienda_terminal_codigo, ''codigo_pago'', t.codigo_pago, '
        || '''id_pago'', t.id_pago, ''fecha'', to_char(t.fecha, ''DD/MM/YYYY''), ''receptor_codigo'', t.receptor_codigo, '
        || '''receptor_nombre'', t.receptor_nombre, ''numero_factura'', t.numero_factura_externa, ''cuota'', t.cuota, ''estado'', t.estado_pago)';
    when 'cobro_cliente' then
      v_from := '(select g.*, lpad(g.codigo_pago::text, 12, ''0'') || lpad(coalesce(g.id_pago, 0)::text, 4, ''0'') as numero_ord, '
        || 'to_char(g.fecha, ''YYYYMMDD'') as fecha_ord, upper(coalesce(g.numero_factura_externo, '''')) as numero_factura, c.nombre as cliente_nombre '
        || 'from cobro_cliente g left join cliente c on c.codigo = g.cliente_codigo) t';
      v_key := '(t.tienda_terminal_codigo || ''|'' || t.codigo_pago::text || ''|'' || coalesce(t.id_pago, 0)::text)';
      v_campos := array['numero_ord', 'fecha_ord', 'cliente_codigo', 'cliente_nombre', 'numero_factura'];
      v_cols := 'jsonb_build_object(''tienda_terminal_codigo'', t.tienda_terminal_codigo, ''codigo_pago'', t.codigo_pago, '
        || '''id_pago'', t.id_pago, ''fecha'', to_char(t.fecha, ''DD/MM/YYYY''), ''cliente_codigo'', t.cliente_codigo, '
        || '''cliente_nombre'', t.cliente_nombre, ''numero_factura'', t.numero_factura_externo, ''cuota'', t.cuota, ''estado'', t.estado_cobro)';
    when 'traspaso_almacen' then
      v_from := '(select x.*, lpad(x.numero::text, 12, ''0'') as numero_ord, '
        || 'to_char(x.fecha at time zone ''Atlantic/Canary'', ''YYYYMMDDHH24MI'') as fecha_ord from traspaso_almacen x) t';
      v_key := '(t.tienda_terminal_codigo || ''|'' || t.numero::text)';
      v_campos := array['numero_ord', 'fecha_ord', 'documento_externo'];
      v_cols := 'jsonb_build_object(''tienda_terminal_codigo'', t.tienda_terminal_codigo, ''numero'', t.numero, '
        || '''fecha'', to_char(t.fecha at time zone ''Atlantic/Canary'', ''DD/MM/YYYY''), ''documento_externo'', t.documento_externo, '
        || '''almacen_origen'', t.almacen_origen_codigo, ''almacen_destino'', t.almacen_destino_codigo, ''total'', t.total_traspaso)';
    when 'numero_serie' then
      v_from := 'articulo_numero_serie t';
      v_key := 't.id::text';
      v_campos := array['numero_serie', 'descripcion', 'articulo_codigo', 'cliente_codigo'];
      v_cols := 'jsonb_build_object(''id'', t.id, ''numero_serie'', t.numero_serie, ''descripcion'', t.descripcion, '
        || '''articulo_codigo'', t.articulo_codigo, ''cliente_codigo'', t.cliente_codigo, ''fecha_venta'', to_char(t.fecha_venta, ''DD/MM/YYYY''))';
$blk$;
  v_fin := position(E'    when ''vendedor'', ''tecnico'' then' in v_def);
  if v_fin = 0 then raise exception 'No encuentro dónde añadir las fuentes'; end if;
  execute left(v_def, v_fin - 1) || v_bloque || substr(v_def, v_fin);
end $$;
