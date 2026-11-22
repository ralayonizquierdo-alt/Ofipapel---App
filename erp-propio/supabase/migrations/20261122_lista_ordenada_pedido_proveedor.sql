-- Ctrl+Intro (lista ordenada) en la ficha de Pedidos a Proveedores (Rober, 22/11/2026): por número, fecha, código de
-- proveedor y nombre del proveedor, como en GeminisWin. Nueva fuente 'pedido_proveedor' en gw_lista_ordenada
-- (invoker: la lectura sigue las reglas de acceso de pedido_proveedor).
do $$
declare v_def text; v_nuevo text;
begin
  v_def := pg_get_functiondef('public.gw_lista_ordenada(text, text, text, text, text, text, integer, boolean)'::regprocedure);
  if position('''pedido_proveedor''' in v_def) > 0 then return; end if;
  v_nuevo := replace(v_def, E'    when ''vendedor'', ''tecnico'' then',
    E'    when ''pedido_proveedor'' then\n'
    || E'      v_from := ''(select p.*, lpad(p.numero::text, 12, ''''0'''') as numero_ord, '
    || E'to_char(p.fecha_hora at time zone ''''Atlantic/Canary'''', ''''YYYYMMDDHH24MI'''') as fecha_ord, pr.nombre as proveedor_nombre '
    || E'from pedido_proveedor p left join proveedor pr on pr.codigo = p.proveedor_codigo) t'';\n'
    || E'      v_key := ''(t.tienda_terminal_codigo || ''''|'''' || t.numero::text)'';\n'
    || E'      v_campos := array[''numero_ord'', ''fecha_ord'', ''proveedor_codigo'', ''proveedor_nombre''];\n'
    || E'      v_cols := ''jsonb_build_object(''''tienda_terminal_codigo'''', t.tienda_terminal_codigo, ''''numero'''', t.numero, '''
    || E'''fecha'''', to_char(t.fecha_hora at time zone ''''Atlantic/Canary'''', ''''DD/MM/YYYY''''), '''
    || E'''proveedor_codigo'''', t.proveedor_codigo, ''''proveedor_nombre'''', t.proveedor_nombre, '''
    || E'''estado'''', t.estado, ''''abono'''', coalesce(t.es_abono, false), ''''total'''', t.total)'';\n'
    || E'    when ''vendedor'', ''tecnico'' then');
  if v_nuevo = v_def then raise exception 'No encuentro dónde añadir la fuente pedido_proveedor'; end if;
  execute v_nuevo;
end $$;
