-- Espejo de GeminisWin: un lote con dos registros de la misma clave ya no falla (17/11/2026).
--
-- Qué pasó: ARTBARRA (códigos de barras) no entraba: «ON CONFLICT DO UPDATE command cannot affect row a
-- second time». En el mismo lote venían dos registros con la misma clave (artículo + código de barras), y
-- una sola orden no puede escribir dos veces la misma fila. En GeminisWin esos repetidos existen.
-- Ahora, de cada clave repetida dentro del lote se queda el último registro leído, que es el que quedaría
-- igualmente si llegaran en dos lotes. La respuesta dice cuántos venían repetidos.
create or replace function public.fn_espejo_gw_recibir(p_tabla text, p_filas jsonb, p_equipo text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '120s'
as $$
declare v_rec integer; v_cam integer; v_dis integer;
begin
  if not exists (select 1 from fn_espejo_gw_tablas() t where t.tabla = p_tabla) then
    raise exception 'El espejo no admite la tabla %.', p_tabla;
  end if;
  if jsonb_typeof(p_filas) is distinct from 'array' then raise exception 'Faltan las filas.'; end if;
  v_rec := jsonb_array_length(p_filas);
  select count(distinct f ->> 'c') into v_dis from jsonb_array_elements(p_filas) f
   where f ->> 'c' is not null and jsonb_typeof(f -> 'd') = 'object';
  insert into carga_dbf (tabla, clave, datos, cargado_en)
  select distinct on (f.fila ->> 'c') p_tabla, f.fila ->> 'c', f.fila -> 'd', now()
    from jsonb_array_elements(p_filas) with ordinality f(fila, n)
   where f.fila ->> 'c' is not null and jsonb_typeof(f.fila -> 'd') = 'object'
   order by f.fila ->> 'c', f.n desc
  on conflict (tabla, clave) do update set datos = excluded.datos, cargado_en = excluded.cargado_en
   where carga_dbf.datos is distinct from excluded.datos;
  get diagnostics v_cam = row_count;
  insert into espejo_gw_pasada (tabla, recibidas, cambiadas, equipo) values (p_tabla, v_rec, v_cam, left(p_equipo, 60));
  return jsonb_build_object('ok', true, 'recibidas', v_rec, 'cambiadas', v_cam, 'repetidas', v_rec - v_dis);
end $$;
