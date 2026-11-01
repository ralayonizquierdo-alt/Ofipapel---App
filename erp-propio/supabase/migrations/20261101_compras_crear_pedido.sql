-- Compras con NEXA, fase 3: crear el BORRADOR de pedido a proveedor a partir de las líneas «pedir».
-- Hace lo mismo que «Generar pedidos» del Gestor de Pedidos a Proveedores: número con fn_siguiente_numero, pedido en
-- estado «pendiente» (sin confirmar ni mover stock), precios y descuentos del proveedor (o del artículo), IGIC y totales
-- calculados como calcularCompra (src/pages/compras/pedidos/compras.ts) para un pedido sin descuento de pie ni gastos.
-- Las peticiones abiertas que cubre (pendiente / atendida) pasan a «tramitada» y se anota en qué pedido y línea van
-- (peticion_tramitacion), igual que hace el Gestor al generar pedidos.
-- SECURITY INVOKER: con los permisos de quien lo llama. Rober lo revisa en el Gestor y lo confirma él.

create or replace function public.fn_compras_crear_pedido(
  p_proveedor text,
  p_lineas jsonb,
  p_almacen text default null,
  p_observaciones text default null,
  p_tienda text default '01'
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_prov proveedor;
  v_almacen text;
  v_numero bigint;
  v_n int := 0;
  v_subtotal numeric := 0;
  v_igic numeric := 0;
  v_canon numeric := 0;
  v_sub numeric;
  v_pet int := 0;
  r record;
begin
  if jsonb_typeof(p_lineas) is distinct from 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Faltan las líneas del pedido: [{"articulo": "...", "cantidad": N}, ...].';
  end if;
  if jsonb_array_length(p_lineas) > 300 then
    raise exception 'Demasiadas líneas para un borrador (máximo 300).';
  end if;
  select * into v_prov from proveedor where codigo = p_proveedor;
  if not found then raise exception 'No existe el proveedor %.', p_proveedor; end if;
  v_almacen := coalesce(nullif(p_almacen, ''), (select t.almacen_codigo from tienda_terminal t where t.codigo = p_tienda));
  if v_almacen is null then raise exception 'No se sabe en qué almacén se recibe el pedido: indica el almacén.'; end if;

  v_numero := public.fn_siguiente_numero(p_tienda, 'pedido_proveedor', '');
  insert into pedido_proveedor (tienda_terminal_codigo, numero, proveedor_codigo, almacen_codigo, estado, observaciones)
  values (p_tienda, v_numero, p_proveedor, v_almacen, 'pendiente',
          coalesce(nullif(btrim(p_observaciones), ''), 'Borrador preparado por NEXA: revisar antes de confirmar'));

  for r in
    select l.articulo, sum(l.cantidad) as cantidad
      from jsonb_to_recordset(p_lineas) as l(articulo text, cantidad numeric)
     where l.articulo is not null and coalesce(l.cantidad, 0) > 0
     group by l.articulo
     order by l.articulo
  loop
    declare
      a articulo;
      ap articulo_proveedor;
      v_precio numeric;
      v_dto numeric;
      v_canon_u numeric;
      v_queda numeric := r.cantidad;
      v_falta numeric;
      pt record;
    begin
      select * into a from articulo where codigo_interno = r.articulo;
      if not found then raise exception 'No existe el artículo %.', r.articulo; end if;
      select * into ap from articulo_proveedor where articulo_codigo = r.articulo and proveedor_codigo = p_proveedor;
      v_precio := coalesce(nullif(ap.coste_puro, 0), a.coste_puro, 0);
      v_dto := coalesce(ap.ultimo_descuento_pct, a.ultimo_descuento_compra_pct, 0);
      v_canon_u := case when coalesce(v_prov.no_aplica_impuesto2, false) then 0 else coalesce(a.impuesto2_pct, 0) end;
      v_n := v_n + 1;
      insert into pedido_proveedor_linea (tienda_terminal_codigo, numero, linea, articulo_codigo, codigo_compra, descripcion,
                                          cantidad, total_unidades, total_unidades_bonificadas, unidades_por_caja, cajas_por_bulto,
                                          precio_compra, descuento_pct, coste_neto, igic_pct, canon)
      values (p_tienda, v_numero, v_n, r.articulo,
              coalesce(nullif(ap.codigo_compra, ''), nullif(a.codigo_compra_habitual, ''), a.codigo_interno), a.descripcion,
              r.cantidad, r.cantidad, 0, coalesce(a.unidades_por_caja, 0), coalesce(a.cajas_por_bulto, 0),
              v_precio, v_dto, round(v_precio * (1 - v_dto / 100), 3), coalesce(a.igic_pct, 0), v_canon_u);
      v_sub := round(r.cantidad * v_precio * (1 - v_dto / 100), 3);
      v_subtotal := v_subtotal + v_sub;
      v_igic := v_igic + v_sub * coalesce(a.igic_pct, 0) / 100;
      v_canon := v_canon + v_canon_u * r.cantidad;
      -- Las peticiones abiertas de este artículo que la línea cubre (por orden de fecha) quedan tramitadas en ella,
      -- como hace «Generar pedidos» del Gestor (vincularPeticionesAPedido).
      for pt in
        select q.tienda_terminal_codigo as tienda, q.numero, q.cantidad, q.cantidad_tramitada
          from peticion q
         where q.articulo_codigo = r.articulo and q.estado in ('pendiente', 'atendida')
         order by q.fecha_hora, q.tienda_terminal_codigo, q.numero
      loop
        v_falta := greatest(0, coalesce(pt.cantidad, 0) - coalesce(pt.cantidad_tramitada, 0));
        continue when v_falta <= 0;
        exit when v_falta > v_queda;
        v_queda := v_queda - v_falta;
        update peticion
           set estado = 'tramitada', cantidad_tramitada = coalesce(pt.cantidad, v_falta), proveedor_codigo = p_proveedor,
               empleado_atencion_codigo = public.fn_empleado_actual(), actualizado_en = now()
         where tienda_terminal_codigo = pt.tienda and numero = pt.numero;
        insert into peticion_tramitacion (tienda_terminal_codigo, numero, pedido_proveedor_tienda_codigo, pedido_proveedor_numero,
                                          pedido_proveedor_linea, fecha_hora, cantidad, proveedor_codigo, almacen_codigo, actualizado_en)
        values (pt.tienda, pt.numero, p_tienda, v_numero, v_n, now(), v_falta, p_proveedor, v_almacen, now())
        on conflict (tienda_terminal_codigo, numero) do update
          set pedido_proveedor_tienda_codigo = excluded.pedido_proveedor_tienda_codigo, pedido_proveedor_numero = excluded.pedido_proveedor_numero,
              pedido_proveedor_linea = excluded.pedido_proveedor_linea, fecha_hora = excluded.fecha_hora, cantidad = excluded.cantidad,
              proveedor_codigo = excluded.proveedor_codigo, almacen_codigo = excluded.almacen_codigo, actualizado_en = excluded.actualizado_en;
        v_pet := v_pet + 1;
      end loop;
    end;
  end loop;

  if v_n = 0 then raise exception 'Ninguna línea válida (artículo y cantidad mayor que cero).'; end if;

  v_subtotal := round(v_subtotal, 2);
  v_igic := round(v_igic, 2);
  v_canon := round(v_canon, 2);
  update pedido_proveedor
     set subtotal = v_subtotal, total_descuento = 0, base_imponible = v_subtotal, total_igic = v_igic, total_gastos = 0,
         total_canon = v_canon, total = round(v_subtotal + v_canon + v_igic, 2), total_a_pagar_proveedor = round(v_subtotal + v_canon + v_igic, 2)
   where tienda_terminal_codigo = p_tienda and numero = v_numero;

  return jsonb_build_object('tienda', p_tienda, 'numero', v_numero, 'proveedor', p_proveedor, 'lineas', v_n,
                            'subtotal', v_subtotal, 'total', round(v_subtotal + v_canon + v_igic, 2), 'estado', 'pendiente',
                            'peticiones_tramitadas', v_pet);
end;
$$;

revoke execute on function public.fn_compras_crear_pedido(text, jsonb, text, text, text) from public, anon;
grant execute on function public.fn_compras_crear_pedido(text, jsonb, text, text, text) to authenticated;

insert into public.nexa_operacion (codigo, descripcion, tipo, objeto, accion, nivel, permiso, bloqueada, notas, receta) values
  ('funcion:fn_compras_crear_pedido', 'Crea el borrador de un pedido a proveedor (estado pendiente, sin confirmar ni mover stock)', 'funcion',
   'fn_compras_crear_pedido', '*', 3, '/pedidos-proveedor', false,
   'Crea un documento con número: nivel 3. No confirma ni recibe nada; se borra desde el propio Gestor si no sirve.',
   'Solo después de enseñar la propuesta (fn_compras_gestor_proveedor) y de que Rober diga qué líneas quiere: select fn_compras_crear_pedido(''PROVEEDOR'', ''[{"articulo":"COD","cantidad":N}, ...]''::jsonb). Pasa solo las líneas «pedir» (y las «dudosas» que Rober acepte) con la cantidad sugerida o la que él corrija. Un pedido por proveedor. Después dile el número y que lo revise y confirme en Compras → Gestor de Pedidos a Proveedores; tú no lo confirmas.')
on conflict (codigo) do update set descripcion = excluded.descripcion, nivel = excluded.nivel, permiso = excluded.permiso,
                                    notas = excluded.notas, receta = excluded.receta, actualizado_en = now();
