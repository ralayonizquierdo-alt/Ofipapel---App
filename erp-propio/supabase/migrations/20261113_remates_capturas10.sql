-- Remates con las capturas 10 de GeminisWin (12/11/2026).
-- 1) En la ventana «Gastos adicionales - Compras» el campo IGIC es un PORCENTAJE (importe 2.000,
--    IGIC 7 → total 2.140). Se guarda el % y el IGIC en euros sigue en «igic».
alter table public.pedido_proveedor_gasto add column if not exists igic_pct numeric(7, 3) not null default 0;
update public.pedido_proveedor_gasto set igic_pct = round(igic / importe * 100, 3) where igic_pct = 0 and igic <> 0 and importe <> 0;

-- 2) Los conceptos son 23, no 7 (lista completa del desplegable, en su orden).
alter table public.concepto_gasto_compra add column if not exists orden smallint;
insert into public.concepto_gasto_compra (codigo, descripcion) values
  ('IPS', 'Ingreso Pagarés Santander'),
  ('TBS', 'Ingreso Talones Bs'),
  ('VISA BBVA', 'Ingreso Tarjetas BBVA'),
  ('VISA BS', 'Ingreso Tarjetas BS'),
  ('VISA C7', 'Ingreso Tarjetas C7'),
  ('VISA CX', 'Ingreso Tarjetas Caixa'),
  ('IBS', 'Ingresos Banco Santander'),
  ('IBK', 'Ingresos Bankia'),
  ('IBBVA', 'Ingresos BBVA'),
  ('7', 'Portes Extrarradio'),
  ('8', 'Recargo Minorista'),
  ('9', 'RECOGIDA DESTINO'),
  ('10', 'SEGURO'),
  (null, 'T-3 Canon APT (Desemba-Destino)'),
  ('12', 'TRABAJOS IMPRENTA'),
  (null, 'Varios según Factura Transport')
on conflict (descripcion) do nothing;
update public.concepto_gasto_compra c set orden = v.orden
from (values
  ('AIEM', 1), ('AYUNTAMIENTO (Permisos)', 2), ('B.A.F.', 3), ('Canon Digital', 4), ('DESPACHO EXPORTACION', 5),
  ('Forfait Despacho Import', 6), ('Impresos y Fotocopias', 7), ('Ingreso Pagarés Santander', 8), ('Ingreso Talones Bs', 9),
  ('Ingreso Tarjetas BBVA', 10), ('Ingreso Tarjetas BS', 11), ('Ingreso Tarjetas C7', 12), ('Ingreso Tarjetas Caixa', 13),
  ('Ingresos Banco Santander', 14), ('Ingresos Bankia', 15), ('Ingresos BBVA', 16), ('Portes Extrarradio', 17),
  ('Recargo Minorista', 18), ('RECOGIDA DESTINO', 19), ('SEGURO', 20), ('T-3 Canon APT (Desemba-Destino)', 21),
  ('TRABAJOS IMPRENTA', 22), ('Varios según Factura Transport', 23)
) as v(descripcion, orden) where c.descripcion = v.descripcion;
