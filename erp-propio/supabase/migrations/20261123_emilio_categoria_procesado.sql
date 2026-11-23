-- E-milio marca en Outlook los correos que ya ha procesado (Rober, 23/11/2026: «cuando E-milio procese algún email
-- del Outlook tiene que ponerlo como procesado»). Categoría de Outlook configurable; necesita Mail.ReadWrite en la app
-- de lectura (si no lo tiene, sigue leyendo y lo dice en su resumen).
insert into public.parametro (clave, valor, descripcion)
values ('compras.categoria_procesado', '"Procesado por E-milio"', 'Categoría de Outlook que E-milio pone a cada correo del buzón de compras que ya ha procesado.')
on conflict (clave) do nothing;
update public.agente_funcion
   set texto = 'Vigilo el buzón de compras día y noche, cada 10 minutos. No borro, no muevo y no contesto a nadie: a cada correo que proceso le pongo en Outlook la categoría «Procesado por E-milio».',
       actualizado_en = now()
 where agente = 'correo_proveedores' and orden = 1;
