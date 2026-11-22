-- Ficha de consulta «Pedidos de GeminisWin» (Rober, 22/11/2026): Ctrl+Intro por número, fecha, proveedor y nombre.
-- Fuente 'gw_pedido_proveedor' en gw_lista_ordenada (invoker: sigue las reglas de acceso de gw_pedido_proveedor).

create or replace function public.gw_estado_pedido_nombre(p smallint)
returns text language sql immutable as $$
  select case p when 1 then 'Pendiente' when 2 then 'Pend. confirmar' when 3 then 'Confirmado' when 4 then 'Conformado'
                when 5 then 'Pend. entrega' when 6 then 'Recepcionado' when 7 then 'Liquidado' end
$$;

do $$
declare v_def text; v_ini int; v_fin int; v_bloque text;
begin
  v_def := pg_get_functiondef('public.gw_lista_ordenada(text, text, text, text, text, text, integer, boolean)'::regprocedure);
  v_bloque :=
       E'    when ''gw_pedido_proveedor'' then\n'
    || E'      v_from := ''(select p.*, lpad(p.numero::text, 12, ''''0'''') as numero_ord, '
    || E'to_char(p.fecha_hora at time zone ''''Atlantic/Canary'''', ''''YYYYMMDDHH24MI'''') as fecha_ord, pr.nombre as proveedor_nombre '
    || E'from gw_pedido_proveedor p left join proveedor pr on pr.codigo = p.proveedor_codigo) t'';\n'
    || E'      v_key := ''(t.oficina || ''''|'''' || t.numero::text)'';\n'
    || E'      v_campos := array[''numero_ord'', ''fecha_ord'', ''proveedor_codigo'', ''proveedor_nombre''];\n'
    || E'      v_cols := ''jsonb_build_object(''''oficina'''', t.oficina, ''''numero'''', t.numero, '
    || E'''''fecha'''', to_char(t.fecha_hora at time zone ''''Atlantic/Canary'''', ''''DD/MM/YYYY''''), '
    || E'''''proveedor_codigo'''', t.proveedor_codigo, ''''proveedor_nombre'''', t.proveedor_nombre, '
    || E'''''estado'''', public.gw_estado_pedido_nombre(t.estado_pedido), ''''total'''', t.total)'';\n';
  v_ini := position(E'    when ''gw_pedido_proveedor'' then' in v_def);
  v_fin := position(E'    when ''vendedor'', ''tecnico'' then' in v_def);
  if v_fin = 0 then raise exception 'No encuentro dónde añadir la fuente gw_pedido_proveedor'; end if;
  if v_ini > 0 then
    v_def := left(v_def, v_ini - 1) || v_bloque || substr(v_def, v_fin);
  else
    v_def := left(v_def, v_fin - 1) || v_bloque || substr(v_def, v_fin);
  end if;
  execute v_def;
end $$;
