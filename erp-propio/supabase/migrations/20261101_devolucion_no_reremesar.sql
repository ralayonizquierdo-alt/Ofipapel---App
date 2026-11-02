-- Recibos devueltos (Luis, 01/11/2026): «que vuelva a la próxima remesa sería la peor opción; lo propio
-- es que no, el cliente debe pagarlo por otros medios; volver a remesarlo lo decide el jefe de ventas».
--   1) Al conciliar la devolución, el recibo deja de ser domiciliado: no sale en «Nueva remesa».
--   2) Volver a remesarlo (acción «reremesar») solo lo pueden decidir los super administradores.
do $$
declare def text;
begin
  def := pg_get_functiondef('public.fn_concilia_confirmar(bigint)'::regprocedure);
  if def !~ 'deja de ser domiciliado' then
    def := replace(def, $x$    perform set_config('erp.fecha_reversion', '', true);$x$,
      $x$    perform set_config('erp.fecha_reversion', '', true);
    -- deja de ser domiciliado: no vuelve solo a la próxima remesa; el cliente paga por otros medios
    -- salvo que el jefe de ventas decida volver a remesarlo (fn_remesa_devolucion_decidir).
    update cobro_cliente set es_domiciliado = false, actualizado_en = now()
     where activo and estado_cobro = 'pendiente' and tienda_terminal_codigo = rc.cobro_tienda_codigo and codigo_pago = rc.cobro_codigo;$x$);
    if def !~ 'deja de ser domiciliado' then raise exception 'no aplicado (1)'; end if;
    execute def;
  end if;
  def := pg_get_functiondef('public.fn_remesa_devolucion_decidir(bigint, text[], text, date)'::regprocedure);
  if def !~ 'solo lo decide el jefe de ventas' then
    def := replace(def, $x$  if 'reremesar' = any (p_acciones) and 'otra_via' = any (p_acciones)$x$,
      $x$  if 'reremesar' = any (p_acciones) and not fn_es_super_administrador() then
    raise exception 'Volver a pasar un recibo devuelto al cobro solo lo decide el jefe de ventas (super administradores).' using errcode = '42501';
  end if;
  if 'reremesar' = any (p_acciones) and 'otra_via' = any (p_acciones)$x$);
    if def !~ 'solo lo decide el jefe de ventas' then raise exception 'no aplicado (2)'; end if;
    execute def;
  end if;
end $$;
