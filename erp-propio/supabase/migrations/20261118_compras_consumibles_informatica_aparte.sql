-- Gestor de Pedidos 2.0: los consumibles de informática van aparte (Rober, 18/11/2026: «esos hacemos pedido todas
-- las semanas y los comparamos entre 3 proveedores a subastar al mejor precio… si puedes quitar los consumibles de
-- informática de esas propuestas sería perfecto»; «lo mismo soy yo el que tengo que acostumbrarme al nuevo sistema»).
--
-- Se quitan de la propuesta las familias del parámetro compras.familias_aparte (por el principio del código):
-- 8350 consumibles compatibles, 8351 tóner compatibles, 8361 cartuchos de tinta originales, 8363 tambores y kits,
-- 8364 consumibles láser originales, 8366 cintas. Los accesorios de informática (8370 en adelante) siguen. Para que
-- vuelvan a la propuesta basta con dejar la lista vacía.
insert into public.parametro (clave, valor, descripcion)
values ('compras.familias_aparte', '["8350", "8351", "8361", "8363", "8364", "8366"]'::jsonb,
        'Gestor de Pedidos 2.0: familias (por el principio del código) que no salen en la propuesta porque se piden aparte. Hoy: consumibles de informática, que se comparan cada semana entre 3 proveedores.')
on conflict (clave) do nothing;

do $$
declare v text := pg_get_functiondef('public.fn_compras_semanal_propuesta(text)'::regprocedure);
  ancla text := $a$and (p_proveedor is null or x.prov = p_proveedor)$a$;
begin
  if position('compras.familias_aparte' in v) > 0 then return; end if;
  if (length(v) - length(replace(v, ancla, ''))) / length(ancla) <> 1 then
    raise exception 'fn_compras_semanal_propuesta no tiene el trozo esperado';
  end if;
  v := replace(v, ancla, ancla || $a$
       and not exists (select 1 from jsonb_array_elements_text(coalesce((select q.valor from parametro q where q.clave = 'compras.familias_aparte'), '[]'::jsonb)) fa
                        where coalesce(ar.familia_codigo, '') like fa || '%')$a$);
  execute v;
end $$;
