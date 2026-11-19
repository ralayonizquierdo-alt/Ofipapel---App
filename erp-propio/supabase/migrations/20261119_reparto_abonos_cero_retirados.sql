-- Abonos y facturas a CERO en reparto (Rober, 19/11/2026). Una factura con importe cero se trata como un abono: cuando
-- el repartidor la marca como entregada, sale de las rutas (listas y barra de puntos de la oficina y del ERP) y queda en
-- las incidencias de su ruta hasta que David la valida (mismo botón «Validar» de los abonos). Al repartidor le siguen
-- saliendo en su lista, para que vea lo que marcó.
--  · reparto_privado.linea_retirada: entregada (o liquidada) y con importe <= 0 (abono o factura a cero).
--  · Se aplica en seguimiento (barra de puntos y cuentas), fn_reparto_control_lineas (desplegable del ERP),
--    fn_app_rep_todas y fn_app_rep_todas_lineas (vista de oficina de la app). Parches idempotentes.
--  · abonos_sin_validar incluye ahora las de importe cero.
--  · La app de oficina (fn_app_rep_por_cobrar) recibe también los nulos sin validar.
create or replace function reparto_privado.linea_retirada(p_vt text, p_vn bigint, p_estado text)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p_estado in ('entregado', 'liquidado')
     and coalesce((select g.total from reparto_gw_venta g where g.venta_tienda_codigo = p_vt and g.venta_numero = p_vn),
                  (select v.total from venta v where v.tienda_terminal_codigo = p_vt and v.numero = p_vn)) <= 0.005
$$;
revoke all on function reparto_privado.linea_retirada(text, bigint, text) from public, anon, authenticated;

do $$
declare f text; d text; viejo text := 'l.estado <> ''anulado''';
  nuevo text := 'l.estado <> ''anulado'' and not reparto_privado.linea_retirada(l.venta_tienda_codigo, l.venta_numero, l.estado)';
begin
  foreach f in array array['reparto_privado.seguimiento(date)', 'public.fn_reparto_control_lineas(date)',
                           'public.fn_app_rep_todas(uuid)', 'public.fn_app_rep_todas_lineas(uuid,text,bigint)'] loop
    d := pg_get_functiondef(f::regprocedure);
    if position('linea_retirada' in d) = 0 then
      if position(viejo in d) = 0 then raise exception '%: no encuentro dónde filtrar', f; end if;
      execute replace(d, viejo, nuevo);
    end if;
  end loop;

  d := pg_get_functiondef('reparto_privado.abonos_sin_validar()'::regprocedure);
  if position('coalesce(g.total, v.total) < -0.005' in d) > 0 then
    execute replace(d, 'coalesce(g.total, v.total) < -0.005', 'coalesce(g.total, v.total) <= 0.005');
  end if;

  d := pg_get_functiondef('public.fn_app_rep_por_cobrar(uuid)'::regprocedure);
  if position('nulos_sin_validar' in d) = 0 then
    if position('reparto_privado.abonos_sin_validar() else' in d) = 0 then raise exception 'por_cobrar app: no encuentro dónde añadir los nulos'; end if;
    execute replace(d, 'reparto_privado.abonos_sin_validar() else', 'reparto_privado.abonos_sin_validar() || reparto_privado.nulos_sin_validar() else');
  end if;
end $$;
