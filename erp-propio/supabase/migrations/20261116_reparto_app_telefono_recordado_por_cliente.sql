-- App de repartidores: el teléfono bueno que pone un repartidor se recuerda por cliente (Rober, 16/11/2026).
-- En las siguientes entregas de ese cliente la app lo propone sola, mientras el teléfono que llega
-- (el «original») siga siendo el mismo: en cuanto alguien corrige la ficha, deja de aplicarse.
-- Quitarlo desde la app lo olvida (se deja el teléfono a null; la fila no se borra).
create table if not exists public.reparto_cliente_telefono (
  cliente_codigo text primary key,
  telefono text,
  original text,
  puesto_por text references public.repartidor(codigo),
  actualizado_en timestamptz not null default now()
);
comment on table public.reparto_cliente_telefono is
  'App de repartidores: teléfono bueno de un cliente que puso un repartidor. Se propone en sus siguientes entregas mientras el teléfono que llega (original) siga siendo el mismo, es decir, mientras nadie corrija la ficha.';
alter table public.reparto_cliente_telefono enable row level security;
revoke all on public.reparto_cliente_telefono from public, anon, authenticated;
grant select on public.reparto_cliente_telefono to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reparto_cliente_telefono' and policyname = 'reparto_cliente_telefono_lee') then
    create policy reparto_cliente_telefono_lee on public.reparto_cliente_telefono for select to authenticated using ((select public.fn_puede('/repartos')));
  end if;
end $$;

create or replace function public.fn_app_rep_telefono(p_token uuid, p_tienda text, p_numero integer, p_vt text, p_vn integer, p_telefono text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rep text := reparto_privado.sesion(p_token); v_tel text := nullif(regexp_replace(coalesce(p_telefono, ''), '[^0-9+]', '', 'g'), '');
  l reparto_linea; v_cli text; v_ori text;
begin
  perform reparto_privado.linea_permiso(v_rep, p_tienda, p_numero, p_vt, p_vn);
  if v_tel is not null and v_tel !~ '^\+?[0-9]{9,15}$' then
    return jsonb_build_object('ok', false, 'error', 'Ese teléfono no parece válido: revisa las cifras.');
  end if;
  update reparto_linea set telefono_app = v_tel
   where tienda_terminal_codigo = p_tienda and numero = p_numero and venta_tienda_codigo = p_vt and venta_numero = p_vn
  returning * into l;
  if not found then raise exception 'Ese pedido ya no está en esta ruta.'; end if;
  v_ori := coalesce(nullif(l.telefono_movil, ''), nullif(l.telefono_fijo, ''));
  select coalesce((select g.cliente_codigo from reparto_gw_venta g join reparto r on r.tienda_terminal_codigo = p_tienda and r.numero = p_numero and r.origen = 'geminiswin'
                    where g.venta_tienda_codigo = p_vt and g.venta_numero = p_vn),
                  (select v.cliente_codigo from venta v join reparto r on r.tienda_terminal_codigo = p_tienda and r.numero = p_numero and r.origen <> 'geminiswin'
                    where v.tienda_terminal_codigo = p_vt and v.numero = p_vn)) into v_cli;
  if nullif(v_cli, '') is not null then
    insert into reparto_cliente_telefono (cliente_codigo, telefono, original, puesto_por) values (v_cli, v_tel, v_ori, v_rep)
    on conflict (cliente_codigo) do update set telefono = excluded.telefono, original = excluded.original, puesto_por = excluded.puesto_por, actualizado_en = now();
  end if;
  return jsonb_build_object('ok', true, 'telefono', v_tel, 'recordado', nullif(v_cli, '') is not null and v_tel is not null);
end $$;

-- La lista del repartidor usa el teléfono recordado (cambiando solo esas líneas de la función).
do $$
declare v_def text; a text;
begin
  v_def := pg_get_functiondef('public.fn_app_rep_lineas(uuid,text,integer)'::regprocedure);
  if position('reparto_cliente_telefono' in v_def) = 0 then
    a := $x$coalesce(nullif(l.telefono_app, ''), nullif(l.telefono_movil, '')$x$;
    if position(a in v_def) = 0 then raise exception 'falta 1'; end if;
    v_def := replace(v_def, a, $x$coalesce(nullif(l.telefono_app, ''), mt.telefono, nullif(l.telefono_movil, '')$x$);
    a := $x$'telefono_cambiado', nullif(l.telefono_app, '') is not null,$x$;
    if position(a in v_def) = 0 then raise exception 'falta 2'; end if;
    v_def := replace(v_def, a, $x$'telefono_cambiado', coalesce(nullif(l.telefono_app, ''), mt.telefono) is not null,
                   'telefono_recordado', nullif(l.telefono_app, '') is null and mt.telefono is not null,$x$);
    a := $x$left join cliente c on c.codigo = v.cliente_codigo$x$;
    if position(a in v_def) = 0 then raise exception 'falta 3'; end if;
    v_def := replace(v_def, a, a || $x$
            left join reparto_cliente_telefono mt on mt.cliente_codigo = coalesce(g.cliente_codigo, v.cliente_codigo) and mt.telefono is not null
                                                 and mt.original is not distinct from coalesce(nullif(l.telefono_movil, ''), nullif(l.telefono_fijo, ''))$x$);
    execute v_def;
  end if;
end $$;
