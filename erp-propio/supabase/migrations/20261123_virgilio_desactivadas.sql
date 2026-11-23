-- Virgilio: funciones que se pueden encender y apagar (Rober, 23/11/2026: «las dos, las seis y las siete: no activada»).
-- Parámetro vigilante.desactivadas: lista de vigilancias apagadas. Hoy: presupuestos (2), riesgo de clientes (6) y recibos
-- vencidos (7); 6 y 7 aún no están montadas. Al apagar una, sus tareas abiertas se cierran solas en la siguiente pasada.
-- Claves: resueltas, presupuestos, sistema, retrasados, correo, riesgo, recibos, cuadre, personales.
insert into public.parametro (clave, valor, descripcion) values
  ('vigilante.desactivadas', '["presupuestos", "riesgo", "recibos"]',
   'Virgilio: vigilancias apagadas. Claves: resueltas, presupuestos, sistema, retrasados, correo, riesgo, recibos, cuadre, personales.')
on conflict (clave) do nothing;

create or replace function public.fn_virgilio_activa(p_vigilancia text)
returns boolean language sql stable set search_path to 'public', 'pg_temp' as $$
  select not coalesce((select valor ? p_vigilancia from parametro where clave = 'vigilante.desactivadas'), false)
$$;

do $$
declare d text := pg_get_functiondef('public.fn_virgilio_pasada()'::regprocedure);
begin
  if position('fn_virgilio_activa' in d) = 0 then
    d := replace(d, 'from fn_peticiones_resueltas(60, false);',
                    'from fn_peticiones_resueltas(60, false) where fn_virgilio_activa(''resueltas'');');
    d := replace(d, 'from fn_virgilio_presupuestos(v_dias) group by comercial loop',
                    'from fn_virgilio_presupuestos(v_dias) where fn_virgilio_activa(''presupuestos'') group by comercial loop');
    d := replace(d, 'into v_sis from fn_virgilio_sistema();',
                    'into v_sis from fn_virgilio_sistema() where fn_virgilio_activa(''sistema'');');
    if (length(d) - length(replace(d, 'fn_virgilio_activa', ''))) / length('fn_virgilio_activa') <> 3 then
      raise exception 'No se pudo poner el encendido/apagado en fn_virgilio_pasada';
    end if;
    execute d;
  end if;
end $$;
