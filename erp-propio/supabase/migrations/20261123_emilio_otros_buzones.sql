-- E-milio puede vigilar otros buzones de @ofipapelsl.com por encargo de NEXA (Rober, 23/11/2026). Hoy su permiso de
-- Microsoft está limitado a compras@ (ApplicationAccessPolicy): cada buzón nuevo hay que añadirlo al grupo
-- erp-lectura-compras y enseñarle la tarea. Por eso entra como función «No activa».
update public.agente_funcion set orden = 7, actualizado_en = now() where agente = 'correo_proveedores' and orden = 6
  and not exists (select 1 from public.agente_funcion where agente = 'correo_proveedores' and orden = 7);
insert into public.agente_funcion (agente, orden, texto, activa)
values ('correo_proveedores', 6,
  'Puedo vigilar otros buzones de @ofipapelsl.com para la tarea que me encarguéis a través de NEXA (avisar de ciertos correos, recoger sus adjuntos…), siempre solo leyendo. Cada buzón nuevo lo autoriza quien administra Microsoft 365.',
  false)
on conflict (agente, orden) do nothing;
