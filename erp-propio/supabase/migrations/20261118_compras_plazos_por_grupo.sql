-- Gestor de Pedidos 2.0: plazos de entrega reales por grupos de proveedor (Rober, 18/11/2026).
--
-- La ficha de GeminisWin traía 20 días en casi todos (un valor por defecto). Rober da los plazos de verdad:
--   · Península: 15-20 días, «más 20 que 15» → 20.
--   · Informática y cartuchos (Inforpor, UFP, Exadi, Mucho Cartucho): 7-10 días → 10.
--   · Locales (Canarias): 2-3 días → 3.
--   · Integral Informática: se le pide a diario y llega en 24 horas → 1.
-- Local = código postal o provincia 35/38. Sin código postal ni provincia → Península (casi todos son marcas de
-- fuera). Solo se rellena donde el ERP no tiene ya un plazo puesto a mano; cada proveedor se puede cambiar después en
-- el Gestor 2.0 → «Condiciones». Tras esto se recalculan los mínimos (fn_compras_politica_calcular).
insert into public.compra_proveedor_condicion (proveedor_codigo, plazo_dias, notas, actualizado_por)
select pr.codigo,
       case g.grupo when 'integral' then 1 when 'informatica' then 10 when 'local' then 3 else 20 end,
       'Plazo por grupo (Rober, 18/11/2026): ' ||
       case g.grupo when 'integral' then 'pedido diario, 24 horas' when 'informatica' then 'informática y cartuchos, 7-10 días'
                    when 'local' then 'local, 2-3 días' else 'Península, 15-20 días' end,
       'Rober (plazos por grupo)'
  from public.proveedor pr
  cross join lateral (select case
           when pr.codigo = '50403' then 'integral'
           when pr.codigo in ('04030', '04075', '04062', '04090') then 'informatica'
           when left(trim(coalesce(pr.codigo_postal, '')), 2) in ('35', '38') or pr.provincia_codigo in ('35', '38') then 'local'
           else 'peninsula' end as grupo) g
 where coalesce(pr.activo, true)
on conflict (proveedor_codigo) do update
   set plazo_dias = excluded.plazo_dias, notas = coalesce(public.compra_proveedor_condicion.notas || ' · ', '') || excluded.notas
 where public.compra_proveedor_condicion.plazo_dias is null;
