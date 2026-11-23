-- Anula el PIN de fichaje 1234 que sigue sin usar en el resto de empleados (23/11/2026, Rober: nadie usa todavía la app de Fichaje).
-- Se sustituye por uno aleatorio que nadie conoce: con el 1234 sin cambiar se podía quitarles el PIN y fichar por ellos. No se borra nada;
-- siguen «provisionales». Cuando empiece a usarse, gerencia deja a cada persona su PIN en Archivo → Fichaje → Personas (queda en 1234
-- provisional) y cada uno lo cambia en su primera entrada. Solo toca los que siguen con el 1234 provisional.
do $$
begin
  perform set_config('erp.origen', 'Seguridad · PIN de fichaje provisional 1234 anulado (todos)', true);
  update fichaje_pin fp
     set pin_hash = extensions.crypt(encode(extensions.gen_random_bytes(24), 'hex'), extensions.gen_salt('bf')),
         fallos = 0, bloqueado_hasta = null, actualizado_en = now()
   where fp.provisional and fp.pin_hash = extensions.crypt('1234', fp.pin_hash);
end $$;
