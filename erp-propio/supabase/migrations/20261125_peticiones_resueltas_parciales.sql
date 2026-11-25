-- Rober, 25/11/2026: las peticiones PARCIALMENTE resueltas (GeminisWin estado 4, «Parc. Res.») también salen en «Peticiones resueltas
-- para preparar», con lo llegado («1 de 2»), para mandar al cliente lo recibido; el resto queda pendiente. Al imprimir se guarda la
-- cantidad llegada (peticion_impresion.cantidad_impresa): si después llega más, la petición vuelve a salir.
-- Aplicada en Supabase como «peticiones_resueltas_parciales»:
--   · alter table peticion_impresion add column cantidad_impresa numeric;
--   · fn_peticiones_marcar_impresas guarda la «cantidad» de cada petición;
--   · nueva fn_peticiones_resueltas_v3 (la de la pantalla): como fn_peticiones_resueltas_doc + estado 4, parcial, cantidad_pedida y
--     cantidad_recibida (suma de PETIDETA con fecha de recepción). Ver la definición viva para el texto completo.
-- Comprobado: sale la 54-36633 (vitrina 58554, VALORIZA) como parcial, 1 de 2.
alter table peticion_impresion add column if not exists cantidad_impresa numeric;

-- El globo rojo cuenta lo mismo que la ventana (también las parciales). Aplicada como «peticiones_resueltas_nuevas_con_parciales».
create or replace function public.fn_peticiones_resueltas_nuevas()
 returns integer language sql stable
 set search_path to 'public', 'pg_temp'
as $function$
  select count(*)::integer from public.fn_peticiones_resueltas_v3(60, false)
$function$;
