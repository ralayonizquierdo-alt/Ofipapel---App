-- Ficha de Almacenes calcada de GeminisWin (Almacén → Almacenes, capturas del 12/11/2026).
-- Solo añade las dos columnas que faltaban; el resto de la ficha ya estaba en la tabla.
-- La tabla ya tiene RLS, políticas con fn_puede_alguno('/almacenes') y trigger de auditoría.

alter table public.almacen
  add column if not exists imagen_modo smallint not null default 1,
  add column if not exists tope_por_fecha_llegada boolean not null default false;

comment on column public.almacen.imagen_modo is
  'Observaciones e Imagen → «Ver Imagen a ...»: 0 Tamaño real, 1 Tamaño ajustado, 2 Rellenar marco.';
comment on column public.almacen.tope_por_fecha_llegada is
  'Tope de Compras por Almacen: false = Por Fecha Pedido, true = Por Fecha Llegada.';
comment on column public.almacen.tope_compra is
  'Tope de Compras por Almacen: importe del tope en euros (TOPE).';
comment on column public.almacen.tope_periodo is
  'Tope de Compras por Almacen → «Para» (TOPEPERIOD de GeminisWin). Se guarda el código tal cual viene de GeminisWin; el significado de cada código está pendiente de confirmar.';
