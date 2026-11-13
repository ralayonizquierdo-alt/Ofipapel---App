-- Puente de reparto con GeminisWin (tarea 35; Rober, 13/11/2026). Apaño hasta usar el ERP propio.
--
-- Un programa en un PC de la oficina (scripts/geminiswin/puente_reparto.py) lee, SOLO LECTURA, los
-- ficheros de GeminisWin (REPARTOS, REPARLIN, VENTAS, FACTURAS) cada 5 minutos de 13:00 a 16:00 y
-- manda aquí los repartos abiertos de las rutas elegidas, para que el repartidor los vea en la app.
-- Estructura y estados de GeminisWin: LEEME de Cowork del 13/11/2026 (REPARTOS.ESTADO 2 = Generado,
-- 4 = Entregado; REPARLIN.ESTADO 2 pendiente, 3 viene de anterior, 4 entregado, 5 entregado y
-- cobrado, 7 no entregado).
--
--  · reparto.origen: 'erp' (los de siempre) o 'geminiswin' (los que trae el puente).
--  · reparto_gw_venta: lo que la app necesita de cada venta de GeminisWin (cliente, importe, si
--    está pagada, forma de pago, nº de factura). Esas ventas NO existen en la tabla venta del ERP.
--  · Parámetro «reparto.puente_gw_rutas»: lista de rutas que entran por el puente. Vacía = ninguna.
--  · fn_reparto_gw_ingesta: la única puerta de entrada. Solo la llama la función del servidor
--    «reparto-gw-ingesta» (service_role), que exige una clave propia del puente.
--  · La ingesta NUNCA pisa lo que el repartidor ya marcó en la app, ni toca repartos del ERP.

alter table public.reparto add column if not exists origen text not null default 'erp' check (origen in ('erp', 'geminiswin'));

create table if not exists public.reparto_gw_venta (
  venta_tienda_codigo text not null,
  venta_numero bigint not null,
  cliente_codigo text,
  nombre_cliente text,
  fecha date,
  total numeric(16, 3),
  total_pagado numeric(16, 3),
  total_pendiente numeric(16, 3),
  forma_pago smallint,                 -- GeminisWin: 1 contado, 3 crédito
  forma_pago_texto text,
  factura_numero text,                 -- nº visible de la factura, si está facturada
  actualizado_en timestamptz not null default now(),
  primary key (venta_tienda_codigo, venta_numero)
);
comment on table public.reparto_gw_venta is
  'Puente con GeminisWin (temporal): datos de cada venta de GeminisWin que va en un reparto traído por el puente. No son ventas del ERP.';
alter table public.reparto_gw_venta enable row level security;
revoke all on public.reparto_gw_venta from public, anon, authenticated;
grant select on public.reparto_gw_venta to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reparto_gw_venta' and policyname = 'reparto_gw_venta_lee') then
    create policy reparto_gw_venta_lee on public.reparto_gw_venta for select to authenticated using ((select public.fn_puede('/repartos')));
  end if;
end $$;

-- Registro de cada pasada del puente (para ver que está vivo y qué trajo).
create table if not exists public.reparto_gw_pasada (
  id bigint generated always as identity primary key,
  en timestamptz not null default now(),
  repartos integer not null default 0,
  lineas_nuevas integer not null default 0,
  lineas_cambiadas integer not null default 0,
  lineas_quitadas integer not null default 0,
  avisos jsonb
);
alter table public.reparto_gw_pasada enable row level security;
revoke all on public.reparto_gw_pasada from public, anon, authenticated;
grant select on public.reparto_gw_pasada to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reparto_gw_pasada' and policyname = 'reparto_gw_pasada_lee') then
    create policy reparto_gw_pasada_lee on public.reparto_gw_pasada for select to authenticated using ((select public.fn_puede('/repartos')));
  end if;
end $$;

insert into public.parametro (clave, valor, descripcion)
values ('reparto.puente_gw_rutas', '[]'::jsonb, 'Puente con GeminisWin: códigos de las rutas cuyos repartos se traen a la app (por ejemplo ["01"]). Vacío = ninguna.')
on conflict (clave) do nothing;

/**
 * Entrada del puente. p = { completo: true, repartos: [ { oficina, numero, ruta, fecha, repartidor, estado,
 *   lineas: [ { ofi_venta, venta, orden, contacto, direccion, cp, poblacion, tlf_fijo, tlf_movil, email,
 *               estado, viene_de, ant_oficina, ant_numero, cliente_codigo, nombre, fecha, total, pagado,
 *               pendiente, forma_pago, forma_texto, factura } ] } ] }
 * «completo» = cada reparto trae TODAS sus líneas: las que falten y sigan pendientes se quitan de la app.
 */
create or replace function public.fn_reparto_gw_ingesta(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rutas jsonb := coalesce((select valor from parametro where clave = 'reparto.puente_gw_rutas'), '[]'::jsonb);
  r jsonb; l jsonb; v_ofi text; v_num bigint; v_ruta text; v_rep text; v_est int; v_origen text;
  v_estado text; v_gw int; v_nuevas int := 0; v_camb int := 0; v_quit int := 0; v_reps int := 0; v_n int;
  v_avisos jsonb := '[]'::jsonb; v_claves text[];
begin
  if jsonb_typeof(p -> 'repartos') <> 'array' then raise exception 'Falta la lista de repartos.' using errcode = '22023'; end if;
  for r in select * from jsonb_array_elements(p -> 'repartos') loop
    v_ofi := btrim(r ->> 'oficina'); v_num := (r ->> 'numero')::bigint; v_ruta := nullif(btrim(r ->> 'ruta'), '');
    if v_ruta is null or not (v_rutas ? v_ruta) then continue; end if;                 -- ruta no elegida: se ignora
    if not exists (select 1 from tienda_terminal where codigo = v_ofi) then
      v_avisos := v_avisos || to_jsonb(format('Reparto %s-%s: la tienda %s no existe en el ERP.', v_ofi, v_num, v_ofi)); continue;
    end if;
    if not exists (select 1 from ruta_reparto where codigo = v_ruta) then
      v_avisos := v_avisos || to_jsonb(format('Reparto %s-%s: la ruta %s no existe en el ERP.', v_ofi, v_num, v_ruta)); continue;
    end if;
    select origen into v_origen from reparto where tienda_terminal_codigo = v_ofi and numero = v_num;
    if found and v_origen <> 'geminiswin' then
      v_avisos := v_avisos || to_jsonb(format('Reparto %s-%s: ya existe uno del ERP con ese número; no se toca.', v_ofi, v_num)); continue;
    end if;
    v_rep := nullif(btrim(r ->> 'repartidor'), '');
    if v_rep is not null and not exists (select 1 from repartidor where codigo = v_rep) then v_rep := null; end if;
    v_est := case when (r ->> 'estado')::int = 4 then 4 else 2 end;

    insert into reparto (tienda_terminal_codigo, numero, ruta_codigo, fecha, repartidor_codigo, estado, origen)
    values (v_ofi, v_num, v_ruta, coalesce(nullif(r ->> 'fecha', '')::date, current_date), v_rep, v_est, 'geminiswin')
    on conflict (tienda_terminal_codigo, numero) do update
      set ruta_codigo = excluded.ruta_codigo, fecha = excluded.fecha, estado = excluded.estado,
          -- En GeminisWin el repartidor suele estar vacío mientras está «Generado»: no se borra el que cogió la ruta en la app.
          repartidor_codigo = coalesce(excluded.repartidor_codigo, reparto.repartidor_codigo), actualizado_en = now()
      where (reparto.ruta_codigo, reparto.fecha, reparto.estado, reparto.repartidor_codigo)
            is distinct from (excluded.ruta_codigo, excluded.fecha, excluded.estado, coalesce(excluded.repartidor_codigo, reparto.repartidor_codigo));
    v_reps := v_reps + 1;
    v_claves := '{}';

    for l in select * from jsonb_array_elements(coalesce(r -> 'lineas', '[]'::jsonb)) loop
      v_gw := coalesce((l ->> 'estado')::int, 2);
      v_estado := case when v_gw in (4, 5) then 'entregado' when v_gw = 7 then 'no_entregado'
                       when v_gw = 3 or (l ->> 'viene_de')::int = 7 then 'viene_anterior' else 'pendiente' end;
      v_claves := v_claves || ((l ->> 'ofi_venta') || '|' || (l ->> 'venta'));

      insert into reparto_gw_venta (venta_tienda_codigo, venta_numero, cliente_codigo, nombre_cliente, fecha, total, total_pagado, total_pendiente,
                                    forma_pago, forma_pago_texto, factura_numero)
      values (l ->> 'ofi_venta', (l ->> 'venta')::bigint, nullif(btrim(l ->> 'cliente_codigo'), ''), nullif(btrim(l ->> 'nombre'), ''),
              nullif(l ->> 'fecha', '')::date, nullif(l ->> 'total', '')::numeric, nullif(l ->> 'pagado', '')::numeric, nullif(l ->> 'pendiente', '')::numeric,
              nullif(l ->> 'forma_pago', '')::smallint, nullif(btrim(l ->> 'forma_texto'), ''), nullif(btrim(l ->> 'factura'), ''))
      on conflict (venta_tienda_codigo, venta_numero) do update
        set cliente_codigo = excluded.cliente_codigo, nombre_cliente = excluded.nombre_cliente, fecha = excluded.fecha, total = excluded.total,
            total_pagado = excluded.total_pagado, total_pendiente = excluded.total_pendiente, forma_pago = excluded.forma_pago,
            forma_pago_texto = excluded.forma_pago_texto, factura_numero = excluded.factura_numero, actualizado_en = now()
        where (reparto_gw_venta.total, reparto_gw_venta.total_pagado, reparto_gw_venta.total_pendiente, reparto_gw_venta.nombre_cliente, reparto_gw_venta.factura_numero, reparto_gw_venta.forma_pago)
              is distinct from (excluded.total, excluded.total_pagado, excluded.total_pendiente, excluded.nombre_cliente, excluded.factura_numero, excluded.forma_pago);

      if not exists (select 1 from reparto_linea where tienda_terminal_codigo = v_ofi and numero = v_num
                       and venta_tienda_codigo = l ->> 'ofi_venta' and venta_numero = (l ->> 'venta')::bigint) then
        insert into reparto_linea (tienda_terminal_codigo, numero, venta_tienda_codigo, venta_numero, orden, contacto, direccion, codigo_postal, poblacion,
                                   telefono_fijo, telefono_movil, email, estado, reparto_anterior_tienda_codigo, reparto_anterior_numero)
        values (v_ofi, v_num, l ->> 'ofi_venta', (l ->> 'venta')::bigint, nullif(l ->> 'orden', '')::int, nullif(btrim(l ->> 'contacto'), ''),
                nullif(btrim(l ->> 'direccion'), ''), nullif(btrim(l ->> 'cp'), ''), nullif(btrim(l ->> 'poblacion'), ''),
                nullif(btrim(l ->> 'tlf_fijo'), ''), nullif(btrim(l ->> 'tlf_movil'), ''), nullif(btrim(l ->> 'email'), ''), v_estado,
                case when v_estado = 'viene_anterior' then nullif(btrim(l ->> 'ant_oficina'), '') end,
                case when v_estado = 'viene_anterior' then coalesce(nullif(l ->> 'ant_numero', '')::bigint, 0) end);
        v_nuevas := v_nuevas + 1;
      else
        -- Ya estaba. Dirección y contacto se refrescan; el estado solo cambia si en GeminisWin ya está
        -- resuelto a mano (entregado / no entregado) o si la línea se había quitado y vuelve.
        update reparto_linea x
           set contacto = nullif(btrim(l ->> 'contacto'), ''), direccion = nullif(btrim(l ->> 'direccion'), ''),
               codigo_postal = nullif(btrim(l ->> 'cp'), ''), poblacion = nullif(btrim(l ->> 'poblacion'), ''),
               telefono_fijo = nullif(btrim(l ->> 'tlf_fijo'), ''), telefono_movil = nullif(btrim(l ->> 'tlf_movil'), ''),
               estado = case when v_estado in ('entregado', 'no_entregado') and x.estado in ('pendiente', 'viene_anterior', 'anulado') then v_estado
                             when x.estado = 'anulado' then v_estado else x.estado end,
               actualizado_en = now()
         where x.tienda_terminal_codigo = v_ofi and x.numero = v_num and x.venta_tienda_codigo = l ->> 'ofi_venta' and x.venta_numero = (l ->> 'venta')::bigint
           and (x.contacto, x.direccion, x.codigo_postal, x.poblacion, x.telefono_fijo, x.telefono_movil,
                case when v_estado in ('entregado', 'no_entregado') and x.estado in ('pendiente', 'viene_anterior', 'anulado') then v_estado
                     when x.estado = 'anulado' then v_estado else x.estado end)
               is distinct from (nullif(btrim(l ->> 'contacto'), ''), nullif(btrim(l ->> 'direccion'), ''), nullif(btrim(l ->> 'cp'), ''), nullif(btrim(l ->> 'poblacion'), ''),
                                 nullif(btrim(l ->> 'tlf_fijo'), ''), nullif(btrim(l ->> 'tlf_movil'), ''), x.estado);
        get diagnostics v_n = row_count; v_camb := v_camb + v_n;
      end if;
    end loop;

    -- Líneas que GeminisWin ya no tiene en este reparto: se quitan de la app solo si nadie las ha tocado.
    if coalesce((p ->> 'completo')::boolean, false) then
      update reparto_linea x set estado = 'anulado', actualizado_en = now()
       where x.tienda_terminal_codigo = v_ofi and x.numero = v_num and x.estado in ('pendiente', 'viene_anterior')
         and x.entregado_en is null and x.intento1_en is null
         and not ((x.venta_tienda_codigo || '|' || x.venta_numero) = any (v_claves));
      get diagnostics v_n = row_count; v_quit := v_quit + v_n;
    end if;
  end loop;

  insert into reparto_gw_pasada (repartos, lineas_nuevas, lineas_cambiadas, lineas_quitadas, avisos)
  values (v_reps, v_nuevas, v_camb, v_quit, nullif(v_avisos, '[]'::jsonb));
  return jsonb_build_object('ok', true, 'repartos', v_reps, 'lineas_nuevas', v_nuevas, 'lineas_cambiadas', v_camb, 'lineas_quitadas', v_quit, 'avisos', v_avisos);
end $$;
revoke execute on function public.fn_reparto_gw_ingesta(jsonb) from public, anon, authenticated;
grant execute on function public.fn_reparto_gw_ingesta(jsonb) to service_role;

-- La app: en los repartos de GeminisWin, el cliente, el importe y lo pagado salen de reparto_gw_venta.
create or replace function public.fn_app_rep_lineas(p_token uuid, p_tienda text, p_numero integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_rep text := reparto_privado.sesion(p_token); r reparto;
begin
  r := reparto_privado.reparto(v_rep, p_tienda, p_numero);
  return jsonb_build_object(
    'reparto', jsonb_build_object('tienda', r.tienda_terminal_codigo, 'numero', r.numero, 'fecha', r.fecha, 'ruta', r.ruta_codigo,
                                  'ruta_nombre', coalesce((select descripcion from ruta_reparto where codigo = r.ruta_codigo), r.ruta_codigo)),
    'lineas', coalesce((
      select jsonb_agg(x.j order by x.prio desc, x.orden nulls last, x.memoria nulls last, x.poblacion, x.direccion)
        from (
          select l.reparto_anterior_numero is not null as prio, l.orden, l.poblacion, l.direccion,
                 (select avg(h.orden) from reparto_linea h join reparto hr on hr.tienda_terminal_codigo = h.tienda_terminal_codigo and hr.numero = h.numero
                   join venta hv on hv.tienda_terminal_codigo = h.venta_tienda_codigo and hv.numero = h.venta_numero
                   where hr.ruta_codigo = r.ruta_codigo and hr.fecha > r.fecha - 120 and hr.estado = 4 and h.orden is not null
                     and hv.cliente_codigo = v.cliente_codigo) as memoria,
                 jsonb_build_object(
                   'vt', l.venta_tienda_codigo, 'vn', l.venta_numero, 'estado', l.estado, 'orden', l.orden,
                   'prioritario', l.reparto_anterior_numero is not null, 'antes', l.estado_observaciones,
                   'cliente', coalesce(nullif(g.nombre_cliente, ''), nullif(v.nombre_cliente, ''), c.nombre, l.contacto, 'Sin nombre'),
                   'cliente_codigo', coalesce(g.cliente_codigo, v.cliente_codigo),
                   'contacto', l.contacto, 'direccion', l.direccion, 'poblacion', l.poblacion, 'cp', l.codigo_postal,
                   'telefono', coalesce(nullif(l.telefono_movil, ''), nullif(l.telefono_fijo, '')),
                   'total', coalesce(g.total, v.total), 'pagado', coalesce(g.total_pagado, v.total_pagado),
                   'factura', case when r.origen = 'geminiswin' then to_jsonb(g.factura_numero) else to_jsonb(v.factura_numero) end, 'bultos', l.bultos,
                   'contado', g.forma_pago = 1, 'forma_pago', g.forma_pago_texto,
                   'incidencia', l.incidencia, 'motivo', l.motivo_no_entrega, 'nota', l.nota_repartidor,
                   'intento1', l.intento1_en, 'intento2', l.intento2_en, 'entregado_en', l.entregado_en, 'comprobado', l.comprobado_en is not null) as j
            from reparto_linea l
            -- Reparto de GeminisWin: sus ventas no están en la tabla venta del ERP (y un número podría coincidir por casualidad).
            left join venta v on r.origen <> 'geminiswin' and v.tienda_terminal_codigo = l.venta_tienda_codigo and v.numero = l.venta_numero
            left join reparto_gw_venta g on r.origen = 'geminiswin' and g.venta_tienda_codigo = l.venta_tienda_codigo and g.venta_numero = l.venta_numero
            left join cliente c on c.codigo = v.cliente_codigo
           where l.tienda_terminal_codigo = p_tienda and l.numero = p_numero and l.estado <> 'anulado'
        ) x), '[]'::jsonb));
end $function$;

-- Clave del puente: en la base de datos solo se guarda su huella (sha-256), en un esquema que no
-- se publica. La clave en claro vive únicamente en un fichero del PC que ejecuta el puente.
create table if not exists reparto_privado.puente_gw (
  id boolean primary key default true check (id),
  clave_sha256 text not null,
  actualizado_en timestamptz not null default now()
);
revoke all on reparto_privado.puente_gw from public, anon, authenticated;

create or replace function public.fn_reparto_gw_clave_ok(p_clave text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select length(coalesce(p_clave, '')) >= 32
     and exists (select 1 from reparto_privado.puente_gw g where g.clave_sha256 = encode(sha256(convert_to(p_clave, 'UTF8')), 'hex'))
$$;
revoke execute on function public.fn_reparto_gw_clave_ok(text) from public, anon, authenticated;
grant execute on function public.fn_reparto_gw_clave_ok(text) to service_role;

-- ── Guardas y «parte» ────────────────────────────────────────────────────────────────────────────
-- Un reparto de GeminisWin se cierra y se reorganiza EN GeminisWin. Desde el ERP o la app solo se
-- marcan sus líneas (entregado / no entregado…). Lo único que puede cerrarlo, añadirle o quitarle
-- pedidos es la ingesta del puente, que se identifica con la variable de transacción puente_gw.ingesta.
create or replace function public.fn_reparto_gw_guarda() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('puente_gw.ingesta', true), '') = '1' then return new; end if;
  if tg_table_name = 'reparto' then
    if old.origen = 'geminiswin' and (new.estado is distinct from old.estado or new.origen is distinct from old.origen) then
      raise exception 'Este reparto viene de GeminisWin: se cierra en GeminisWin, no aquí.' using errcode = '42501';
    end if;
  elsif exists (select 1 from reparto r where r.tienda_terminal_codigo = new.tienda_terminal_codigo and r.numero = new.numero and r.origen = 'geminiswin') then
    if tg_op = 'INSERT' then
      raise exception 'Este reparto viene de GeminisWin: los pedidos se le añaden en GeminisWin.' using errcode = '42501';
    elsif new.estado = 'anulado' and old.estado <> 'anulado' then
      raise exception 'Este reparto viene de GeminisWin: los pedidos se cambian de ruta en GeminisWin (avisa en la oficina).' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create or replace trigger trg_reparto_gw_guarda before update on public.reparto for each row execute function public.fn_reparto_gw_guarda();
create or replace trigger trg_reparto_linea_gw_guarda before insert or update on public.reparto_linea for each row execute function public.fn_reparto_gw_guarda();

-- Lo que llama la función del servidor: marca la transacción como «ingesta» y entra.
create or replace function public.fn_reparto_gw_entrada(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform set_config('puente_gw.ingesta', '1', true);
  return fn_reparto_gw_ingesta(p);
end $$;
revoke execute on function public.fn_reparto_gw_entrada(jsonb) from public, anon, authenticated;
grant execute on function public.fn_reparto_gw_entrada(jsonb) to service_role;

-- El «parte»: lo que marcaron los repartidores en cada reparto abierto de GeminisWin, ya traducido al
-- estado que hay que poner en GeminisWin (4 entregado, 7 no entregado). Sin nombres ni direcciones:
-- quien lo aplique en GeminisWin localiza cada línea por el nº de venta.
create or replace function public.fn_reparto_gw_partes() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'oficina', r.tienda_terminal_codigo, 'numero', r.numero, 'ruta', r.ruta_codigo, 'fecha', r.fecha,
           'repartidor', r.repartidor_codigo,
           'pendientes', (select count(*) from reparto_linea l where l.tienda_terminal_codigo = r.tienda_terminal_codigo and l.numero = r.numero and l.estado in ('pendiente', 'viene_anterior')),
           'lineas', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'ofi_venta', l.venta_tienda_codigo, 'venta', l.venta_numero, 'factura', g.factura_numero,
                      'estado_app', l.estado,
                      'estado_gw', case l.estado when 'entregado' then 4 when 'no_entregado' then 7 end,
                      'motivo', l.motivo_no_entrega, 'incidencia', l.incidencia, 'nota', l.nota_repartidor,
                      'intento1', l.intento1_en, 'intento2', l.intento2_en, 'entregado_en', l.entregado_en,
                      'contado', g.forma_pago = 1, 'total', g.total, 'pagado', g.total_pagado)
                    order by l.orden nulls last, l.venta_numero)
               from reparto_linea l
               left join reparto_gw_venta g on g.venta_tienda_codigo = l.venta_tienda_codigo and g.venta_numero = l.venta_numero
              where l.tienda_terminal_codigo = r.tienda_terminal_codigo and l.numero = r.numero and l.estado <> 'anulado'), '[]'::jsonb))
           order by r.fecha, r.ruta_codigo, r.numero), '[]'::jsonb)
    from reparto r
   where r.origen = 'geminiswin' and r.estado = 2 and r.fecha > current_date - 10
$$;
revoke execute on function public.fn_reparto_gw_partes() from public, anon, authenticated;
grant execute on function public.fn_reparto_gw_partes() to service_role;
