-- E-milio: margen en el que una diferencia de precio NO avisa (Rober, 22/11/2026: «siempre hay alguna diferencia de
-- precio; tanto a la baja como al alza tenemos que ponerle un porcentaje o baremo en el que no salte el aviso»).
-- Solo avisa si la diferencia supera los DOS topes a la vez: el porcentaje y los euros por unidad (así tampoco saltan
-- los céntimos de los artículos baratos). Se cambian en Archivo → Parámetros.
insert into public.parametro (clave, valor, descripcion) values
  ('compras.tolerancia_precio_pct', '5'::jsonb,
   'E-milio (correo de proveedores): diferencia de precio, en %, por debajo de la cual no avisa (al alza o a la baja). Avisa solo si pasa este % Y los euros de compras.tolerancia_precio_eur.'),
  ('compras.tolerancia_precio_eur', '0.05'::jsonb,
   'E-milio (correo de proveedores): diferencia de precio por unidad, en euros, por debajo de la cual no avisa (al alza o a la baja). Avisa solo si pasa estos euros Y el % de compras.tolerancia_precio_pct.')
on conflict (clave) do nothing;
