-- Sr. Puente también es el encargado de sacar datos de ContaNet (Rober, 23/11/2026: «ya están todos sacados, pero si
-- se necesitara algo más, este sería el agente»). La extracción de noviembre se hizo en el PC de Mónica (PLAN_CONTANET.md).
update public.agente_funcion set orden = 5, actualizado_en = now() where agente = 'pc_monica' and orden = 4
  and not exists (select 1 from public.agente_funcion where agente = 'pc_monica' and orden = 5);
insert into public.agente_funcion (agente, orden, texto, activa)
values ('pc_monica', 4,
  '4. Soy el encargado de sacar los datos de ContaNet (la contabilidad) que hagan falta. Ya están todos sacados (noviembre de 2026); si se necesita algo más, me lo pedís y lo saco.',
  true)
on conflict (agente, orden) do nothing;
