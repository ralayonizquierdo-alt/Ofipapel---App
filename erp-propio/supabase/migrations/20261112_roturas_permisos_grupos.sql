-- Gestor de Roturas: quién puede qué (Rober, 12/11/2026).
--   Gerencia, Administrador y Compras: todo.
--   Almacén: registrar roturas y confirmar la destrucción.
--   El resto (Dependiente): solo registrar roturas.
insert into public.rol_permiso (rol_id, permiso_codigo)
select r.id, p.codigo
from public.rol r
join (values
  ('Gerencia', '/gestor-roturas'), ('Administrador', '/gestor-roturas'), ('Compras', '/gestor-roturas'),
  ('Gerencia', '/roturas-destruccion'), ('Administrador', '/roturas-destruccion'), ('Compras', '/roturas-destruccion'), ('Almacén', '/roturas-destruccion'),
  ('Gerencia', '/roturas-peticion'), ('Administrador', '/roturas-peticion'), ('Compras', '/roturas-peticion'), ('Almacén', '/roturas-peticion'), ('Dependiente', '/roturas-peticion')
) as v(rol, permiso) on v.rol = r.nombre
join public.permiso p on p.codigo = v.permiso
on conflict do nothing;
