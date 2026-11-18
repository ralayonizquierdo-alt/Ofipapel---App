-- Gestor de Pedidos 2.0: el papel de fotocopia blanco se pide aparte (Rober, 18/11/2026: «se pide aparte, no lo pido
-- yo, se lo puedes obviar»). Se marca «Bajo pedido» el papel de fotocopia de las familias de folio blanco
-- (557010 A4 80 g, 557020 A3, 557050 ofertas: Mattio, Paperline, Paperbox...): deja de proponerse por mínimos.
-- El de colores y gramajes especiales sigue en la propuesta. Cada uno se puede cambiar desde la propuesta.
insert into public.compra_articulo_decision (articulo_codigo, decision, motivo, decidido_por)
select a.codigo_interno, 'bajo_pedido', 'Papel de fotocopia: se pide aparte (Rober, 18/11/2026)', 'Rober (papel aparte)'
  from public.articulo a
 where a.descripcion ilike '%papel%fotocop%' and a.familia_codigo in ('557010', '557020', '557050')
on conflict (articulo_codigo) do nothing;

select public.fn_compras_politica_calcular();
