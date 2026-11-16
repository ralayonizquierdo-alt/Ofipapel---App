-- Repartos que no deben salir en la vista OFICINA de la app ni en la pantalla de repartos (TV / ERP)
-- (Rober, 16/11/2026: los del lunes de puesta en marcha y los de prueba). No se borran: siguen en
-- Ventas → Repartos. Qué repartos se ocultan se decide a mano (update reparto set oculto = true …).
alter table public.reparto add column if not exists oculto boolean not null default false;
comment on column public.reparto.oculto is 'El reparto no sale en la vista OFICINA de la app ni en la pantalla de repartos (TV / ERP). No lo borra: sigue en Ventas → Repartos.';

do $$
declare v_def text; a text;
begin
  v_def := pg_get_functiondef('public.fn_app_rep_todas(uuid)'::regprocedure);
  a := 'where r.estado = 2 or r.fecha = v_hoy';
  if position('r.oculto' in v_def) = 0 then
    if position(a in v_def) = 0 then raise exception 'falta el filtro en fn_app_rep_todas'; end if;
    execute replace(v_def, a, 'where (r.estado = 2 or r.fecha = v_hoy) and not r.oculto');
  end if;
  v_def := pg_get_functiondef('reparto_privado.seguimiento(date)'::regprocedure);
  a := 'where r.fecha = v_dia or (r.estado = 2 and r.fecha < v_dia)';
  if position('r.oculto' in v_def) = 0 then
    if position(a in v_def) = 0 then raise exception 'falta el filtro en seguimiento'; end if;
    execute replace(v_def, a, 'where (r.fecha = v_dia or (r.estado = 2 and r.fecha < v_dia)) and not r.oculto');
  end if;
end $$;
