-- Pantalla de fichar como la de antes (Rober, 03/11/2026): un desplegable por grupo (Ofipapel, Aliz-1, Aliz-2,
-- Comerciales, Reparto) y, dentro de Ofipapel, apartados por departamento; nombres «Apellidos, Nombre» como en la
-- plantilla de Vacaciones (nombre_lista; se rellenó una vez desde la plantilla, sin datos en el repositorio).
alter table public.fichaje_empleado add column if not exists nombre_lista text;

create or replace function public.fn_fichaje_personas() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(g order by g ->> 'orden'), '[]'::jsonb) from (
    select jsonb_build_object('grupo', d.grupo, 'orden', lpad(min(d.orden)::text, 5, '0'),
             'personas', jsonb_agg(jsonb_build_object(
                 'codigo', e.codigo,
                 'nombre', coalesce(nullif(fe.nombre_lista, ''), e.nombre),
                 'corto', coalesce(nullif(e.nombre_corto, ''), e.nombre),
                 'dep', d.nombre, 'dep_orden', d.orden)
               order by d.orden, coalesce(nullif(fe.nombre_lista, ''), e.nombre))) g
      from fichaje_empleado fe
      join empleado e on e.codigo = fe.empleado_codigo and e.activo
      join fichaje_departamento d on d.codigo = fe.departamento_codigo
      join fichaje_pin p on p.empleado_codigo = fe.empleado_codigo
     where fe.activo
     group by d.grupo) x $$;
