-- Validar abonos, facturas a cero y nulos también desde la app de oficina (Rober, 20/11/2026): David lo hace en la app
-- o en el ERP. Solo entradas de oficina (supervisor). Queda apuntado quién: «App · <nombre>».
create or replace function public.fn_app_rep_validar(p_token uuid, p_tienda text, p_numero bigint, p_vt text, p_vn bigint)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_rep text := reparto_privado.sesion(p_token); v_quien text; l reparto_linea;
begin
  if not coalesce((select supervisor from repartidor_pin where repartidor_codigo = v_rep), false) then
    raise exception 'Solo la oficina puede validar.' using errcode = '42501';
  end if;
  v_quien := 'App · ' || coalesce((select coalesce(nullif(nombre_corto, ''), nombre) from repartidor where codigo = v_rep), v_rep);
  select * into l from reparto_linea where tienda_terminal_codigo = p_tienda and numero = p_numero and venta_tienda_codigo = p_vt and venta_numero = p_vn for update;
  if not found then raise exception 'Ese pedido no está en el reparto.'; end if;
  if l.nulo_en is not null then
    update reparto_linea set nulo_validado_en = now(), nulo_validado_por = v_quien
     where tienda_terminal_codigo = p_tienda and numero = p_numero and venta_tienda_codigo = p_vt and venta_numero = p_vn;
  elsif reparto_privado.linea_retirada(p_vt, p_vn, l.estado) then
    update reparto_linea set abono_validado_en = now(), abono_validado_por = v_quien
     where tienda_terminal_codigo = p_tienda and numero = p_numero and venta_tienda_codigo = p_vt and venta_numero = p_vn;
  else
    raise exception 'Ese pedido no es un abono, una factura a cero ni un nulo pendiente de validar.';
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.fn_app_rep_validar(uuid, text, bigint, text, bigint) from public;
grant execute on function public.fn_app_rep_validar(uuid, text, bigint, text, bigint) to anon, authenticated;
