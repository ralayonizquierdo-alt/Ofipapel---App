-- Próximo número libre de un documento, SIN reservarlo (petición de Rober, 29/10/2026):
-- al pulsar Agregar, las fichas enseñan ya el número que tendrá el documento. Es solo
-- lectura: el número de verdad se sigue asignando al guardar con fn_siguiente_numero
-- (atómico), así dos puestos a la vez nunca duplican y cancelar no deja huecos.
-- Devuelve lo mismo que daría fn_siguiente_numero ahora mismo: siguiente_numero, o 1 si la
-- secuencia aún no existe.

create or replace function public.fn_proximo_numero(p_tienda text, p_tipo_documento text, p_serie text default '')
returns bigint
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(
    (select s.siguiente_numero
       from secuencia_numeracion s
      where s.tienda_terminal_codigo = p_tienda
        and s.tipo_documento_codigo = p_tipo_documento
        and s.serie = p_serie),
    1)::bigint
$$;

comment on function public.fn_proximo_numero(text, text, text) is
  'Próximo número que daría fn_siguiente_numero, sin reservarlo (para enseñarlo al pulsar Agregar).';

revoke execute on function public.fn_proximo_numero(text, text, text) from public;
revoke execute on function public.fn_proximo_numero(text, text, text) from anon;
grant execute on function public.fn_proximo_numero(text, text, text) to authenticated, service_role;
