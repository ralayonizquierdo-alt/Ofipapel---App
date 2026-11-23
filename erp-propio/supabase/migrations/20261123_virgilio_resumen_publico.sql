-- Ficha de Virgilio en el hub (inicio.html): solo números y estado, como E-milio y Wasimara. Se añade su rama a
-- fn_agente_resumen_publico (anon). Hoy: peticiones impresas y avisos cerrados/abiertos. Pendiente: lo de vigilancia_aviso.
do $$
declare d text := pg_get_functiondef('public.fn_agente_resumen_publico(text)'::regprocedure);
begin
  if position('''vigilante''' in d) = 0 then
    d := replace(d, 'from correo_proveedor_documento d, hoy where d.recibido_en >= hoy.desde) end,',
      'from correo_proveedor_documento d, hoy where d.recibido_en >= hoy.desde) '
      || 'when p_agente = ''vigilante'' then (select jsonb_build_object('
      || '''peticiones_impresas'', (select count(*) from peticion_impresion i where i.impresa_en >= hoy.desde), '
      || '''avisos_resueltos'', (select count(*) from incidencia i where i.reportado_por = ''Virgilio'' and i.resuelta_en >= hoy.desde), '
      || '''avisos_nuevos'', (select count(*) from incidencia i where i.reportado_por = ''Virgilio'' and i.reportado_en >= hoy.desde)) from hoy) end,');
    d := replace(d, 'from correo_proveedor_documento d) end' || chr(10) || '  ) end',
      'from correo_proveedor_documento d) '
      || 'when p_agente = ''vigilante'' then (select jsonb_build_object('
      || '''resueltas_sin_imprimir'', coalesce(sum(v.cantidad) filter (where v.clave = ''resueltas''), 0), '
      || '''presupuestos_sin_seguimiento'', coalesce(sum(v.cantidad) filter (where v.clave like ''presupuestos:%''), 0), '
      || '''problemas_sistema'', coalesce(sum(v.cantidad) filter (where v.clave = ''sistema''), 0)) from vigilancia_aviso v) end' || chr(10) || '  ) end');
    if (length(d) - length(replace(d, '''vigilante''', ''))) / length('''vigilante''') <> 2 then
      raise exception 'No se pudo añadir Virgilio a fn_agente_resumen_publico';
    end if;
    execute d;
  end if;
end $$;
