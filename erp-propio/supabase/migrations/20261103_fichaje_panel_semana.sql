-- «Mi fichaje» más completo (Rober, 03/11/2026): el panel devuelve también los fichajes de la semana en curso, para
-- enseñar las horas de hoy y de la semana. Y los empleados del ERP que no estaban en la plantilla (gerencia) también
-- fichan.
create or replace function fichaje_privado.panel(p_emp text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_dia date := fichaje_privado.hoy(); v_estado text := fichaje_privado.estado(p_emp, v_dia); v_rep text; v_token uuid;
begin
  select repartidor_codigo into v_rep from fichaje_empleado where empleado_codigo = p_emp;
  if v_rep is not null and v_estado = 'trabajando' then
    insert into reparto_app_sesion (repartidor_codigo, dispositivo) values (v_rep, 'Fichaje') returning token into v_token;
  end if;
  return jsonb_build_object(
    'ok', true, 'empleado', p_emp,
    'nombre', (select coalesce(nullif(nombre_corto, ''), nombre) from empleado where codigo = p_emp),
    'estado', v_estado, 'siguientes', to_jsonb(fichaje_privado.siguientes(v_estado)),
    'hoy', coalesce((select jsonb_agg(jsonb_build_object('tipo', tipo, 'en', en, 'origen', origen) order by en, id)
                       from fichaje_evento where empleado_codigo = p_emp and dia = v_dia and anulado_por is null), '[]'::jsonb),
    'semana', coalesce((select jsonb_agg(jsonb_build_object('tipo', tipo, 'en', en, 'dia', dia) order by en, id)
                          from fichaje_evento where empleado_codigo = p_emp and anulado_por is null
                           and dia between date_trunc('week', v_dia)::date and v_dia), '[]'::jsonb),
    'repartidor', v_rep, 'reparto_token', v_token);
end $$;

insert into fichaje_empleado (empleado_codigo, departamento_codigo)
select codigo, 'gerencia' from empleado where codigo in ('ROBER', 'LUIS', 'DAVID')
on conflict (empleado_codigo) do nothing;
