-- Registro de incidencias (Luis, 01/11/2026): tipo nuevo «tarea» (📌 tareas pendientes de cada uno:
-- configurar, traer datos, preguntar a la asesoría…). La lista inicial de tareas se cargó al aplicar
-- esta migración en la base de datos (insert de 10 tareas: correo de avisos, correos de devoluciones,
-- cuentas 4312/4315 con la asesoría, datos SEPA, martes CONTANET/N43, descarga total de GeminisWin,
-- usuario de David, programa de la gestoría, propuesta web, mandatos SEPA).
alter table public.incidencia drop constraint if exists incidencia_tipo_check;
alter table public.incidencia add constraint incidencia_tipo_check check (tipo in ('fallo', 'mejora', 'duda', 'tarea'));
