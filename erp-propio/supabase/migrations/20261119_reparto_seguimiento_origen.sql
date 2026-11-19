-- Control de Repartos (19/11/2026): cada ruta dice si su reparto se generó en el ERP (generado_erp). Con eso el Control
-- pone «Cerrar reparto» (cierre del ERP, que devuelve lo no entregado a la propuesta del día siguiente) solo en las
-- rutas pasadas al ERP, y «Se cierra en GeminisWin» en las demás. Parche idempotente sobre la función en vivo.
do $$
declare d text := pg_get_functiondef('reparto_privado.seguimiento(date)'::regprocedure);
begin
  if position('''generado_erp''' in d) = 0 then
    if position('''ruta'', r.ruta_codigo,' in d) = 0 then raise exception 'seguimiento: no encuentro dónde añadir generado_erp'; end if;
    d := replace(d, '''ruta'', r.ruta_codigo,', '''ruta'', r.ruta_codigo, ''generado_erp'', coalesce(r.generado_erp, false),');
    execute d;
  end if;
end $$;
