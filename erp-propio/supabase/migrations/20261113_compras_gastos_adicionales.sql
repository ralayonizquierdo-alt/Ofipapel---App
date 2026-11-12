-- Compras → «Otros gastos adicionales» (ventana «Gastos adicionales - Compras» de GeminisWin,
-- capturas del 12/11/2026): hasta tres documentos/conceptos por compra, con nº de factura, importe,
-- IGIC, total, cuentas contables (solo como dato: NO generan asientos), pagado y forma de pago.
-- Solo añade: una tabla de conceptos, una tabla con los gastos de cada compra y una columna de
-- total en pedido_proveedor. No toca factura_proveedor ni fn_rotura_cuadrar.

-- 1. Conceptos del desplegable. El código es el que enseña GeminisWin (algunos no tienen).
create table if not exists public.concepto_gasto_compra (
  id bigint generated always as identity primary key,
  codigo text,
  descripcion text not null unique,
  cuenta_partida text,
  cuenta_contrapartida text,
  actualizado_en timestamptz not null default now()
);

comment on table public.concepto_gasto_compra is
  'Conceptos de «Otros gastos adicionales» de una compra (AIEM, despacho, forfait…). Las cuentas son solo un dato por defecto: no generan asientos.';

alter table public.concepto_gasto_compra enable row level security;
revoke all on public.concepto_gasto_compra from public, anon;
grant select, insert, update, delete on public.concepto_gasto_compra to authenticated, service_role;

create policy lectura_concepto_gasto_compra on public.concepto_gasto_compra
  for select to authenticated using (true);
create policy permiso_alta_concepto_gasto_compra on public.concepto_gasto_compra
  for insert to authenticated with check ((select public.fn_puede_alguno('{/pedidos-proveedor}'::text[])));
create policy permiso_modifica_concepto_gasto_compra on public.concepto_gasto_compra
  for update to authenticated
  using ((select public.fn_puede_alguno('{/pedidos-proveedor}'::text[])))
  with check ((select public.fn_puede_alguno('{/pedidos-proveedor}'::text[])));
create policy permiso_borra_concepto_gasto_compra on public.concepto_gasto_compra
  for delete to authenticated using ((select public.fn_es_administrador()));

create or replace trigger trg_auditoria_concepto_gasto_compra
  after insert or update or delete on public.concepto_gasto_compra
  for each row execute function public.fn_auditoria_trigger();

-- Los conceptos que se leen en la captura, en su orden (la lista de GeminisWin sigue por debajo:
-- los que falten se añaden cuando haya captura).
insert into public.concepto_gasto_compra (codigo, descripcion) values
  (null, 'AIEM'),
  ('2', 'AYUNTAMIENTO (Permisos)'),
  ('3', 'B.A.F.'),
  (null, 'Canon Digital'),
  ('4', 'DESPACHO EXPORTACION'),
  ('5', 'Forfait Despacho Import'),
  ('6', 'Impresos y Fotocopias')
on conflict (descripcion) do nothing;

-- 2. Gastos adicionales de cada compra: tres bloques «Documento y/o Concepto».
create table if not exists public.pedido_proveedor_gasto (
  tienda_terminal_codigo text not null,
  numero bigint not null,
  bloque smallint not null check (bloque between 1 and 3),
  concepto_id bigint references public.concepto_gasto_compra (id),
  descripcion text,
  pagado boolean not null default false,
  forma_pago_codigo text references public.forma_pago (codigo),
  numero_factura text,
  importe numeric not null default 0,
  igic numeric not null default 0,
  total numeric not null default 0,
  cuenta_partida text,
  cuenta_contrapartida text,
  actualizado_en timestamptz not null default now(),
  primary key (tienda_terminal_codigo, numero, bloque),
  foreign key (tienda_terminal_codigo, numero)
    references public.pedido_proveedor (tienda_terminal_codigo, numero) on delete cascade
);

comment on table public.pedido_proveedor_gasto is
  '«Otros gastos adicionales» de una compra (ventana «Gastos adicionales - Compras»): hasta 3 documentos. La suma de importes va a pedido_proveedor.otros_gastos (se reparte en el coste de las líneas al Actualizar) y la de IGIC a otros_gastos_igic. Las cuentas contables son solo un dato: no generan asientos.';
comment on column public.pedido_proveedor_gasto.igic is 'Importe de IGIC del documento (euros), no porcentaje.';

alter table public.pedido_proveedor_gasto enable row level security;
revoke all on public.pedido_proveedor_gasto from public, anon;
grant select, insert, update, delete on public.pedido_proveedor_gasto to authenticated, service_role;

create policy lectura_pedido_proveedor_gasto on public.pedido_proveedor_gasto
  for select to authenticated using (true);
create policy permiso_alta_pedido_proveedor_gasto on public.pedido_proveedor_gasto
  for insert to authenticated with check ((select public.fn_puede_alguno('{/pedidos-proveedor}'::text[])));
create policy permiso_modifica_pedido_proveedor_gasto on public.pedido_proveedor_gasto
  for update to authenticated
  using ((select public.fn_puede_alguno('{/pedidos-proveedor}'::text[])))
  with check ((select public.fn_puede_alguno('{/pedidos-proveedor}'::text[])));
create policy permiso_borra_pedido_proveedor_gasto on public.pedido_proveedor_gasto
  for delete to authenticated using ((select public.fn_puede_alguno('{/pedidos-proveedor}'::text[])));

create or replace trigger trg_auditoria_pedido_proveedor_gasto
  after insert or update or delete on public.pedido_proveedor_gasto
  for each row execute function public.fn_auditoria_trigger();

-- 3. IGIC de los otros gastos en la cabecera (el importe ya estaba en otros_gastos).
alter table public.pedido_proveedor
  add column if not exists otros_gastos_igic numeric not null default 0;

comment on column public.pedido_proveedor.otros_gastos is
  'Otros gastos adicionales: suma de importes (sin IGIC) de pedido_proveedor_gasto. Se reparte en el coste de las líneas al Actualizar.';
comment on column public.pedido_proveedor.otros_gastos_igic is
  'IGIC de los otros gastos adicionales: suma de pedido_proveedor_gasto.igic.';
