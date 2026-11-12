-- Gestor de Roturas: grupos de acceso «Almacén» y «Compras» (Rober, 12/11/2026).
-- Almacén: todo el menú Almacén (incluye Petición de Abono y Confirmar Destrucción).
-- Compras: todo el menú Compras (incluye el Gestor de Roturas) y, además, registrar roturas.
-- Se pueden ajustar después en Archivo → Grupos de Acceso. No son administradores.
insert into public.rol (codigo, nombre, nivel_acceso, es_administrador)
select v.codigo, v.nombre, (select nivel_acceso from public.rol where codigo = 'DEPENDIENTE'), false
  from (values ('ALMACEN', 'Almacén'), ('COMPRAS', 'Compras')) v(codigo, nombre)
 where not exists (select 1 from public.rol r where r.codigo = v.codigo);

insert into public.rol_permiso (rol_id, permiso_codigo)
select r.id, p.codigo from public.rol r join public.permiso p on lower(p.modulo) = 'almacén' where r.codigo = 'ALMACEN'
on conflict do nothing;
insert into public.rol_permiso (rol_id, permiso_codigo)
select r.id, p.codigo from public.rol r join public.permiso p on lower(p.modulo) = 'compras' or p.codigo = '/roturas-peticion' where r.codigo = 'COMPRAS'
on conflict do nothing;
