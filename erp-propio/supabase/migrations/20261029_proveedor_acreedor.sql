-- Proveedores y acreedores (petición de Luis, 29/10/2026).
-- Acreedor = a quien se le pagan servicios y no mercancía (luz, teléfono, alquiler, gestoría…).
-- Misma tabla `proveedor`, con la columna `tipo`. En GeminisWin los acreedores son los códigos
-- del grupo 60 (60, 600, 60000 y 60001…): se marcan así en la carga inicial.
-- Ficha propia en Compras → Acreedores (/acreedores), con permiso propio. Idempotente.

alter table public.proveedor add column if not exists tipo text not null default 'proveedor';
do $$ begin
  alter table public.proveedor add constraint proveedor_tipo_chk check (tipo in ('proveedor', 'acreedor'));
exception when duplicate_object then null; end $$;
comment on column public.proveedor.tipo is 'proveedor = mercancía (cuenta 400) · acreedor = servicios y gastos (cuenta 410).';
create index if not exists proveedor_tipo_codigo_idx on public.proveedor (tipo, codigo);

update public.proveedor set tipo = 'acreedor' where codigo like '60%' and tipo <> 'acreedor';

-- Permiso de la opción de menú, concedido a los grupos que ya tienen Proveedores.
insert into public.permiso (codigo, descripcion, modulo, tipo, orden)
values ('/acreedores', 'Acreedores', 'Compras', 'menu', 1061)
on conflict (codigo) do nothing;
insert into public.rol_permiso (rol_id, permiso_codigo)
select rol_id, '/acreedores' from public.rol_permiso where permiso_codigo = '/proveedores'
on conflict do nothing;
