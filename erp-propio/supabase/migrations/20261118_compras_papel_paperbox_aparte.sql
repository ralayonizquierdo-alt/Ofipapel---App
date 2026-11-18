-- Rober, 18/11/2026: «el Paperbox tampoco, es esa oferta también». Se pide aparte como el resto del papel «Oferta».
insert into public.compra_articulo_decision (articulo_codigo, decision, motivo, decidido_por)
values ('97672', 'bajo_pedido', 'Papel de fotocopia de oferta (contenedor): se pide aparte (Rober, 18/11/2026)', 'Rober (papel aparte)')
on conflict (articulo_codigo) do update set decision = excluded.decision, motivo = excluded.motivo, decidido_por = excluded.decidido_por, decidido_en = now();

select public.fn_compras_politica_aplicar('97672', null);
