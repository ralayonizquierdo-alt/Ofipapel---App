-- App de repartidores: el repartidor puede poner otro teléfono para una entrega cuando el que viene
-- no es el bueno (Rober, 16/11/2026). Se usa para «Llamar» y «WhatsApp». No cambia la ficha del
-- cliente ni GeminisWin, y el puente no lo pisa. La oficina lo ve en OFICINA → detalle de la ruta,
-- para corregirlo en GeminisWin si procede.
alter table public.reparto_linea add column if not exists telefono_app text;
comment on column public.reparto_linea.telefono_app is
  'Teléfono que el repartidor ha puesto en la app para esta entrega porque el que venía no era el bueno. No cambia la ficha del cliente ni GeminisWin; el puente no lo toca.';

create or replace function public.fn_app_rep_telefono(p_token uuid, p_tienda text, p_numero integer, p_vt text, p_vn integer, p_telefono text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rep text := reparto_privado.sesion(p_token); v_tel text := nullif(regexp_replace(coalesce(p_telefono, ''), '[^0-9+]', '', 'g'), '');
begin
  perform reparto_privado.linea_permiso(v_rep, p_tienda, p_numero, p_vt, p_vn);
  if v_tel is not null and v_tel !~ '^\+?[0-9]{9,15}$' then
    return jsonb_build_object('ok', false, 'error', 'Ese teléfono no parece válido: revisa las cifras.');
  end if;
  update reparto_linea set telefono_app = v_tel
   where tienda_terminal_codigo = p_tienda and numero = p_numero and venta_tienda_codigo = p_vt and venta_numero = p_vn;
  if not found then raise exception 'Ese pedido ya no está en esta ruta.'; end if;
  return jsonb_build_object('ok', true, 'telefono', v_tel);
end $$;
revoke execute on function public.fn_app_rep_telefono(uuid, text, integer, text, integer, text) from public;
grant execute on function public.fn_app_rep_telefono(uuid, text, integer, text, integer, text) to anon, authenticated, service_role;

-- Las dos listas (repartidor y oficina) pasan a devolverlo, cambiando solo esa línea de cada función.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.fn_app_rep_lineas(uuid,text,integer)'::regprocedure);
  if position('telefono_app' in v_def) = 0 then
    if position($a$'telefono', coalesce(nullif(l.telefono_movil, ''), nullif(l.telefono_fijo, '')),$a$ in v_def) = 0 then raise exception 'No encuentro el teléfono en fn_app_rep_lineas'; end if;
    execute replace(v_def, $a$'telefono', coalesce(nullif(l.telefono_movil, ''), nullif(l.telefono_fijo, '')),$a$,
      $b$'telefono', coalesce(nullif(l.telefono_app, ''), nullif(l.telefono_movil, ''), nullif(l.telefono_fijo, '')),
                   'telefono_original', coalesce(nullif(l.telefono_movil, ''), nullif(l.telefono_fijo, '')), 'telefono_cambiado', nullif(l.telefono_app, '') is not null,$b$);
  end if;
  v_def := pg_get_functiondef('public.fn_app_rep_todas_lineas(uuid,text,bigint)'::regprocedure);
  if position('telefono_app' in v_def) = 0 then
    if position($a$'poblacion', l.poblacion,$a$ in v_def) = 0 then raise exception 'No encuentro la población en fn_app_rep_todas_lineas'; end if;
    execute replace(v_def, $a$'poblacion', l.poblacion,$a$, $b$'poblacion', l.poblacion, 'telefono_repartidor', nullif(l.telefono_app, ''),$b$);
  end if;
end $$;
