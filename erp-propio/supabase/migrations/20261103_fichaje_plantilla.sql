-- Plantilla de Fichaje (Rober, 03/11/2026): «los empleados ya están en la app de fichajes, no hay que darlos de alta
-- otra vez». Se cargaron una vez en el ERP las 36 personas de Vacaciones y Turnos (de donde las leía fichaje.html),
-- cada una con su departamento. Las que ya existían en GeminisWin como repartidor o vendedor llevan su número de allí
-- como código; el resto lleva un código provisional F01…F16 a la espera del número de GeminisWin (lo busca Cowork).
-- Los 9 repartidores quedan enlazados con su ficha de repartidor. Los datos se cargaron con una sentencia aparte (son
-- datos reales: no van en el repositorio).
--
-- fn_fichaje_pin_generar: da un PIN al azar a quien ficha y aún no tiene, y devuelve la lista UNA vez para imprimirla
-- y repartirla (en la base solo queda el hash).
create or replace function public.fn_fichaje_pin_generar() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r record; v_pin text; v_lista jsonb := '[]'::jsonb;
begin
  if not fn_puede('/fichaje-gestion') then raise exception 'Sin permiso de Fichaje (gestión).' using errcode = '42501'; end if;
  for r in select e.codigo, e.nombre, coalesce(e.numero_operario, e.codigo) numero, d.nombre dep
             from fichaje_empleado fe join empleado e on e.codigo = fe.empleado_codigo
             left join fichaje_departamento d on d.codigo = fe.departamento_codigo
            where fe.activo and e.activo and not exists (select 1 from fichaje_pin p where p.empleado_codigo = e.codigo)
            order by d.orden, e.nombre loop
    v_pin := lpad((1000 + floor(random() * 9000))::int::text, 4, '0');
    insert into fichaje_pin (empleado_codigo, pin_hash) values (r.codigo, extensions.crypt(v_pin, extensions.gen_salt('bf')));
    v_lista := v_lista || jsonb_build_object('numero', r.numero, 'nombre', r.nombre, 'departamento', r.dep, 'pin', v_pin);
  end loop;
  return v_lista;
end $$;
grant execute on function public.fn_fichaje_pin_generar() to authenticated;
