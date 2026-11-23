-- Espejito, el agente del PC de Mónica (Rober, 23/11/2026). Agrupa lo que corre en ese PC: el espejo de GeminisWin →
-- ERP (tarea de Windows, cada 10 min) y el puente del reparto (cada 5 min, 07:00–21:00), más el cierre de repartos en
-- GeminisWin que hace su Cowork cuando alguien se lo pide. Ver docs/COWORK_TAREAS.md, «PC de Mónica».
-- No hace falta tocar el PC: lo que ha hecho sale de lo que ya dejan en el ERP (espejo_gw_pasada y reparto_gw_pasada).
-- Virgilio vigila también el puente (más de 30 min sin señales en su horario).

insert into public.agente (codigo, nombre, que_hace, funcion, cada, permiso, ordenes, activo, intro)
values ('pc_monica', 'Espejito',
  'Trabaja en el PC de Mónica (equipo MONICA): copia GeminisWin al ERP cada 10 minutos (espejo) y lleva los repartos de GeminisWin '
  || 'a la app de repartidores cada 5 minutos de 07:00 a 21:00 (puente). Su Cowork cierra los repartos del día en GeminisWin cuando '
  || 'alguien se lo pide. Solo lee GeminisWin.',
  null, 'espejo cada 10 min; puente cada 5 min de 07:00 a 21:00 (PC de Mónica)', null, array[]::text[], true,
  '¡Hola! Soy Espejito, el agente del PC de Mónica. Copio GeminisWin al ERP sin parar y llevo los repartos a la app de los repartidores, para que todo esté siempre al día.')
on conflict (codigo) do update set nombre = excluded.nombre, que_hace = excluded.que_hace, cada = excluded.cada, intro = excluded.intro, activo = true;

insert into public.agente_funcion (agente, orden, texto, activa) values
  ('pc_monica', 1, '1. Copio GeminisWin al ERP cada 10 minutos, día y noche: ventas, facturas, cobros, caja, pedidos, peticiones, artículos, clientes… De día lo de los últimos 60 días; de noche y los domingos, los ficheros enteros.', true),
  ('pc_monica', 2, '2. Llevo los repartos abiertos de GeminisWin y los cambios de sus ventas a la app de los repartidores, cada 5 minutos de 7:00 a 21:00, todos los días.', true),
  ('pc_monica', 3, '3. Cuando alguien me lo pide, cierro los repartos del día en GeminisWin con el parte de la app y genero los del día siguiente (hace falta que una persona meta la contraseña).', true),
  ('pc_monica', 4, 'Solo leo GeminisWin: nunca escribo en sus ficheros. Trabajo en el PC de Mónica: si está apagado no puedo copiar nada, y Virgilio avisa.', true)
on conflict (agente, orden) do nothing;

-- Hub (solo números) y NEXA: lo de hoy de Espejito, sacado del rastro del espejo y del puente.
do $$
declare d text := pg_get_functiondef('public.fn_agente_resumen_publico(text)'::regprocedure);
begin
  if position('pc_monica' in d) = 0 then
    d := replace(d, 'when p_agente = ''geminis_pc'' then (select jsonb_build_object(',
      'when p_agente = ''pc_monica'' then (select jsonb_build_object('
      || '''espejo_vueltas'', (select count(distinct date_trunc(''minute'', e.en)) from espejo_gw_pasada e where e.en >= hoy.desde), '
      || '''espejo_cambiadas'', (select coalesce(sum(e.cambiadas), 0) from espejo_gw_pasada e where e.en >= hoy.desde), '
      || '''espejo_errores'', (select count(*) from espejo_gw_pasada e where e.en >= hoy.desde and e.error is not null), '
      || '''ultima_espejo'', (select max(e.en) from espejo_gw_pasada e), '
      || '''puente_vueltas'', (select count(*) from reparto_gw_pasada r where r.en >= hoy.desde), '
      || '''puente_repartos'', (select r.repartos from reparto_gw_pasada r order by r.id desc limit 1), '
      || '''ultima_puente'', (select max(r.en) from reparto_gw_pasada r)) from hoy) '
      || 'when p_agente = ''geminis_pc'' then (select jsonb_build_object(');
    if position('pc_monica' in d) = 0 then raise exception 'No se pudo añadir Espejito a fn_agente_resumen_publico'; end if;
    execute d;
  end if;
end $$;

-- Virgilio: el puente del reparto parado (más de 30 min sin señales entre las 07:30 y las 20:45).
do $$
declare d text := pg_get_functiondef('public.fn_virgilio_sistema()'::regprocedure);
begin
  if position('puente del reparto' in d) = 0 then
    d := replace(d, '  union all' || chr(10) || '  select ''E-milio (correo de proveedores) da error: ''',
      '  union all' || chr(10)
      || '  select ''El puente del reparto no manda nada a la app desde el '' || to_char((select max(en) from reparto_gw_pasada) at time zone ''Atlantic/Canary'', ''DD/MM HH24:MI'')' || chr(10)
      || '         || '' (revisar el PC de Mónica).''' || chr(10)
      || '    from ahora where h::time between ''07:30'' and ''20:45''' || chr(10)
      || '     and coalesce((select max(en) from reparto_gw_pasada), ''-infinity'') < now() - interval ''30 minutes''' || chr(10)
      || '  union all' || chr(10) || '  select ''E-milio (correo de proveedores) da error: ''');
    if position('puente del reparto' in d) = 0 then raise exception 'No se pudo añadir el puente a fn_virgilio_sistema'; end if;
    execute d;
  end if;
end $$;
update public.agente_funcion set texto = '3. Que el sistema funcione: el espejo de GeminisWin, el puente del reparto, las tareas automáticas, E-milio y Geminio. Si algo se para, aviso.',
       actualizado_en = now()
 where agente = 'vigilante' and orden = 3;
