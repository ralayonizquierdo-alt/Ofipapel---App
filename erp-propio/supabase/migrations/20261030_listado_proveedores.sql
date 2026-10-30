-- Informes de Proveedores (Luis, 30/10/2026; captura de GeminisWin «Informes de Proveedores»):
-- se abre con la impresora de la ficha de Proveedores. Informes: «Listado de Proveedores» y
-- «Listado de Cuentas Contables». Filtros: Código, Nif y Nombre (Desde/Hasta · Cualquiera ·
-- Seleccionar) y dos «Filtrar Según Campos» (campo + No Filtrar / Igual / Desde-Hasta + valores).
-- Orden de salida: Código, Nombre, Nif o Población.

-- «Filtrar Según Campos» del proveedor: f = {campo, modo: no|igual|desdeHasta, desde, hasta}.
-- Las fechas llegan como AAAA-MM-DD y se comparan igual que el texto.
create or replace function public.lst_campo_proveedor(pr public.proveedor, f jsonb) returns boolean
language sql stable as $$
  select case when coalesce(f->>'modo', 'no') = 'no' then true
    else (with v as (
      select case f->>'campo'
        when 'fecha_alta' then to_char(pr.fecha_alta, 'YYYY-MM-DD')
        when 'fecha_baja' then to_char(pr.fecha_baja, 'YYYY-MM-DD')
        when 'fecha_ultima_compra' then to_char(pr.fecha_ultima_compra, 'YYYY-MM-DD')
        when 'fecha_ultimo_pedido' then to_char(pr.fecha_ultimo_pedido, 'YYYY-MM-DD')
        when 'poblacion' then upper(pr.poblacion)
        when 'provincia' then pr.provincia_codigo
        when 'codigo_postal' then pr.codigo_postal
        when 'forma_pago' then pr.forma_pago_codigo
        when 'tipo' then pr.tipo
        when 'contacto' then upper(pr.contacto)
        else null end as x)
      select case f->>'modo'
        when 'igual' then coalesce(upper(x) = upper(f->>'desde'), false)
        else coalesce((coalesce(f->>'desde', '') = '' or upper(x) >= upper(f->>'desde'))
                  and (coalesce(f->>'hasta', '') = '' or upper(x) <= upper(f->>'hasta')), false) end
      from v) end
$$;

create or replace function public.fn_lst_proveedores(p jsonb)
returns table(nivel int, grupo text, grupo_desc text, clave text, descripcion text, nif text, poblacion text, telefono text,
              contacto text, forma_pago text, tipo text, cta_400 text, cta_600 text, cta_401 text, cta_572 text, n bigint)
language sql stable security invoker set search_path = public as $$
  with b as (
    select pr.codigo, coalesce(pr.nombre, '') as nom, pr.nif as nf, pr.poblacion as pob,
           nullif(concat_ws(' / ', nullif(trim(pr.telefono_fijo), ''), nullif(trim(pr.telefono_movil), '')), '') as tel,
           pr.contacto as con, coalesce(fp.descripcion, pr.forma_pago_codigo) as fpd,
           case when pr.tipo = 'acreedor' then 'Acreedor' else 'Proveedor' end as tp,
           pr.cuenta_contable_400 as c400, pr.cuenta_contable_600 as c600, pr.cuenta_contable_401 as c401, pr.cuenta_contable_572 as c572
    from proveedor pr
    left join forma_pago fp on fp.codigo = pr.forma_pago_codigo
    where lst_en(pr.codigo, p->'codigos')
      and lst_en(coalesce(pr.nif, ''), p->'nifs')
      and lst_en(upper(coalesce(pr.nombre, '')), p->'nombres')
      and lst_campo_proveedor(pr, p->'campo1')
      and lst_campo_proveedor(pr, p->'campo2')
      and (coalesce(p->>'tipo', '') = '' or pr.tipo = p->>'tipo')
      and (not coalesce((p->>'soloActivos')::boolean, false) or coalesce(pr.activo, true))
  )
  select (case when grouping(b.codigo) = 1 then 2 else 0 end)::int, ''::text, ''::text, b.codigo,
         min(b.nom), min(b.nf), min(b.pob), min(b.tel), min(b.con), min(b.fpd), min(b.tp),
         min(b.c400), min(b.c600), min(b.c401), min(b.c572), count(*)
  from b
  group by grouping sets ((b.codigo), ())
  order by grouping(b.codigo),
           case when p->>'orden' = 'nombre' then min(b.nom) end,
           case when p->>'orden' = 'nif' then min(b.nf) end,
           case when p->>'orden' = 'poblacion' then min(b.pob) end,
           b.codigo
$$;
grant execute on function public.fn_lst_proveedores(jsonb) to authenticated;
revoke execute on function public.fn_lst_proveedores(jsonb) from anon, public;

-- Opción de menú Compras → Listados de Proveedores (también la impresora de la ficha): quien
-- puede abrir la ficha de Proveedores puede sacar sus informes.
insert into public.permiso (codigo, descripcion, modulo, tipo, orden)
values ('/listados-compras/proveedores', 'Listados de Proveedores', 'Compras', 'menu', 57)
on conflict (codigo) do nothing;
insert into public.rol_permiso (rol_id, permiso_codigo)
select rp.rol_id, '/listados-compras/proveedores' from public.rol_permiso rp where rp.permiso_codigo = '/proveedores'
on conflict do nothing;
