-- Anula el PIN de fichaje 1234 de los repartidores que nunca han entrado por la app de Fichaje (23/11/2026). Ficham desde la app
-- de repartos (fn_app_rep_fichar, con su PIN de repartos), así que su PIN de fichaje se quedó en el provisional 1234 desde el 03/11 y
-- con él se podía quitarles el PIN de fichaje y fichar por ellos. Se sustituye por uno aleatorio que nadie conoce: no se borra nada,
-- siguen «provisionales» y gerencia puede volver a dejar a alguien con 1234 (Archivo → Fichaje → Personas) si hiciera falta.
-- No afecta a la app de repartos ni al fichaje desde ella: no usan este PIN. Solo toca a los que siguen con el 1234 provisional.
do $$
begin
  perform set_config('erp.origen', 'Seguridad · PIN de fichaje provisional anulado (repartidores)', true);
  update fichaje_pin fp
     set pin_hash = extensions.crypt(encode(extensions.gen_random_bytes(24), 'hex'), extensions.gen_salt('bf')),
         fallos = 0, bloqueado_hasta = null, actualizado_en = now()
    from fichaje_empleado fe
   where fe.empleado_codigo = fp.empleado_codigo and fe.repartidor_codigo is not null
     and fp.provisional and fp.pin_hash = extensions.crypt('1234', fp.pin_hash);
end $$;
