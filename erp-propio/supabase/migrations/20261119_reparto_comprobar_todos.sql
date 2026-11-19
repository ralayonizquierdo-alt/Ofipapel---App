-- Control de Repartos (Rober, 19/11/2026): «Marcar todos» / «Desmarcar todos» los pedidos de una ruta como comprobados.
create or replace function public.fn_reparto_control_comprobar_todos(p_tienda text, p_numero bigint, p_ok boolean)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_n int;
begin
  if not fn_puede('/repartos') then
    raise exception 'No tienes permiso de Repartos. Pídelo a un administrador (Archivo → Usuarios y permisos).' using errcode = '42501';
  end if;
  update reparto_linea set comprobado_en = case when p_ok then coalesce(comprobado_en, now()) end
   where tienda_terminal_codigo = p_tienda and numero = p_numero and estado <> 'anulado'
     and (comprobado_en is null) = p_ok;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'cambiados', v_n);
end $$;
revoke all on function public.fn_reparto_control_comprobar_todos(text, bigint, boolean) from public, anon;
grant execute on function public.fn_reparto_control_comprobar_todos(text, bigint, boolean) to authenticated;
