-- Ctrl+Intro (lista ordenada) en las fichas de Vendedores, Técnicos, Repartidores, Zonas
-- territoriales, Rutas de reparto y Transportistas: se añaden esas fuentes a la lista blanca
-- de gw_lista_ordenada. Se parchea la definición VIGENTE (otras pantallas añaden fuentes a la
-- vez), insertando las ramas nuevas justo antes del «else raise exception»; si ya están, no hace nada.
do $do$
declare
  d text;
  nuevas text := $n$    when 'vendedor', 'tecnico' then
      v_from := p_fuente || ' t'; v_key := 't.codigo'; v_campos := array['codigo', 'nombre'];
      v_cols := 'jsonb_build_object(''codigo'', t.codigo, ''nombre'', t.nombre, ''nombre_corto'', t.nombre_corto, '
        || '''dni'', t.dni, ''poblacion'', t.poblacion, ''activo'', t.activo)';
    when 'repartidor' then
      v_from := 'repartidor t'; v_key := 't.codigo'; v_campos := array['codigo', 'nombre'];
      v_cols := 'jsonb_build_object(''codigo'', t.codigo, ''nombre'', t.nombre, ''nombre_corto'', t.nombre_corto, '
        || '''dni'', t.dni, ''poblacion'', t.poblacion, ''activo'', not coalesce(t.deshabilitado, false))';
    when 'zona_territorial' then
      v_from := 'zona_territorial t'; v_key := 't.codigo'; v_campos := array['codigo', 'descripcion'];
      v_cols := 'jsonb_build_object(''codigo'', t.codigo, ''descripcion'', t.descripcion, ''pedido_minimo'', t.pedido_minimo)';
    when 'ruta_reparto' then
      v_from := 'ruta_reparto t'; v_key := 't.codigo'; v_campos := array['codigo', 'descripcion'];
      v_cols := 'jsonb_build_object(''codigo'', t.codigo, ''descripcion'', t.descripcion, ''activo'', not coalesce(t.deshabilitada, false))';
    when 'transportista' then
      v_from := 'transportista t'; v_key := 't.codigo'; v_campos := array['codigo', 'nombre', 'razon_social', 'nif'];
      v_cols := 'jsonb_build_object(''codigo'', t.codigo, ''nombre'', t.nombre, ''razon_social'', t.razon_social, '
        || '''nif'', t.nif, ''poblacion'', t.poblacion, ''telefono'', coalesce(nullif(t.telefono_fijo, ''''), t.telefono_movil), ''activo'', t.activo)';
$n$;
  marca text := E'    else\n      raise exception ''Lista ordenada: fuente no permitida';
begin
  d := pg_get_functiondef('public.gw_lista_ordenada(text,text,text,text,text,text,integer,boolean)'::regprocedure);
  if position('when ''transportista''' in d) > 0 then
    return;
  end if;
  if position(marca in d) = 0 then
    raise exception 'gw_lista_ordenada: no se encuentra el punto de inserción';
  end if;
  execute replace(d, marca, nuevas || marca);
end
$do$;
