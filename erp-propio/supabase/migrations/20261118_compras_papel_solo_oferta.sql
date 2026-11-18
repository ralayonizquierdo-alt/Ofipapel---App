-- Corrección (Rober, 18/11/2026: «solo el de oferta, el que compramos por contenedores»). Se pide aparte solo el
-- papel de fotocopia «Oferta» (Mattio, Paperline, Copystar...). El resto del papel de fotocopia que se marcó en
-- 20261118_compras_papel_fotocopia_aparte.sql vuelve a estar sin decidir y a proponerse por mínimos.
update public.compra_articulo_decision d
   set decision = null, motivo = 'Vuelve a la propuesta: solo se pide aparte el papel «Oferta» (Rober, 18/11/2026)'
  from public.articulo a
 where a.codigo_interno = d.articulo_codigo and d.decidido_por = 'Rober (papel aparte)'
   and d.decision = 'bajo_pedido' and a.descripcion not ilike '%oferta%';

select public.fn_compras_politica_calcular();
