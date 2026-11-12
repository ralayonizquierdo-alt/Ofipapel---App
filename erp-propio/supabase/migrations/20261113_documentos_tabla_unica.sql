-- Una sola tabla de «Documentos» (Rober, 12/11/2026; capturas 11 de GeminisWin, tabla DOCUMENT.DBF):
-- código, descripción y cuenta contable. La usan el campo «Documento» del movimiento de caja y el
-- desplegable «Documento y/o Concepto» de los gastos adicionales de compras. Es la tabla que ya
-- existía como concepto_gasto_compra: se le añade la cuenta contable y se abre también a Caja.
-- El «Concepto» se sigue escribiendo a mano en todos los sitios. La cuenta es solo un dato: no
-- genera asientos.
alter table public.concepto_gasto_compra add column if not exists cuenta_contable text;
comment on table public.concepto_gasto_compra is
  'Tabla «Documentos» de GeminisWin (DOCUMENT.DBF): código, descripción y cuenta contable. Compartida por Caja (campo Documento del movimiento) y Compras (gastos adicionales). No genera asientos.';

update public.concepto_gasto_compra c set cuenta_contable = v.cuenta
from (values ('IBBVA', '57203860'), ('IBK', '57206868'), ('IBS', '57205740'), ('VISA CX', '57201720')) as v(codigo, cuenta)
where c.codigo = v.codigo and c.cuenta_contable is null;

-- Quien lleva los movimientos de caja también puede dar de alta y modificar documentos (en GeminisWin
-- la lista se mantiene desde la propia ventana).
alter policy permiso_alta_concepto_gasto_compra on public.concepto_gasto_compra
  with check ((select public.fn_puede_alguno('{/pedidos-proveedor,/caja/movimientos}'::text[])));
alter policy permiso_modifica_concepto_gasto_compra on public.concepto_gasto_compra
  using ((select public.fn_puede_alguno('{/pedidos-proveedor,/caja/movimientos}'::text[])))
  with check ((select public.fn_puede_alguno('{/pedidos-proveedor,/caja/movimientos}'::text[])));
