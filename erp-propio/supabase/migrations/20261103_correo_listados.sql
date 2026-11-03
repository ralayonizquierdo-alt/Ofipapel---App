-- Enviar un listado por correo desde el ERP (Luis, 03/11/2026: «y enviar por email»). La pantalla manda el listado
-- ya en HTML (tabla) y la dirección; se pone en la cola correo_pendiente y lo envía la función del servidor
-- correo-enviar con el correo de la empresa. Límites: usuario con sesión, direcciones válidas (máx. 10), 20 envíos por
-- hora y empleado, 600 KB por correo. Queda en la auditoría (tabla correo_pendiente no se audita: se apunta aquí).

create or replace function public.fn_correo_listado(p_para text, p_asunto text, p_html text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_emp text := fn_empleado_actual(); v_n int; v_dirs text[];
begin
  if auth.uid() is null or v_emp is null then raise exception 'Sin sesión.'; end if;
  select array_agg(btrim(x)) into v_dirs from regexp_split_to_table(coalesce(p_para, ''), '[,;\s]+') x where btrim(x) <> '';
  if coalesce(cardinality(v_dirs), 0) = 0 then raise exception 'Escribe a quién se envía.'; end if;
  if cardinality(v_dirs) > 10 then raise exception 'Como mucho 10 direcciones por envío.'; end if;
  if exists (select 1 from unnest(v_dirs) d where d !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then raise exception 'Hay alguna dirección de correo mal escrita.'; end if;
  if length(coalesce(p_html, '')) > 600000 then
    raise exception 'El listado es demasiado grande para el correo. Cómo hacerlo bien: filtra menos filas o descárgalo en Excel y adjúntalo desde tu correo.';
  end if;
  if (select count(*) from correo_pendiente where origen = 'listado:' || v_emp and creado_en > now() - interval '1 hour') >= 20 then
    raise exception 'Has enviado muchos listados en la última hora. Prueba dentro de un rato.';
  end if;
  v_n := fn_correo_encolar(array_to_string(v_dirs, ','), left(coalesce(nullif(btrim(p_asunto), ''), 'Listado del ERP'), 200), p_html, 'listado:' || v_emp);
  insert into auditoria (tabla, operacion, registro_pk, empleado_codigo, registro_nombre, datos_despues, ocurrido_en, usuario_id, ip, dispositivo, area)
  values ('uso', 'EXPORTA', 'correo', v_emp, left('Listado por correo: ' || coalesce(p_asunto, ''), 200),
          jsonb_build_object('detalle', 'A: ' || array_to_string(v_dirs, ', ')), now(), auth.uid(), fn_peticion_ip(), fn_peticion_dispositivo(), null);
  return v_n;
end $$;
revoke execute on function public.fn_correo_listado(text, text, text) from public, anon;
grant execute on function public.fn_correo_listado(text, text, text) to authenticated;
