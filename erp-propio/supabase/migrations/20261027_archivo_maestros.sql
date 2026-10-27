-- Menú Archivo (maestros calcados de GeminisWin): Tiendas, Datos de Empresa, Formas de Pago y
-- Empleados. Columnas que faltaban, grupo administrador, protección de grupos/permisos y de los
-- contadores de numeración (VeriFactu), lista ordenada (Ctrl+Intro) de estas fichas.

-- ── Tiendas (TIENDAS de GeminisWin) ────────────────────────────────────────────────────────
alter table public.tienda_terminal
  add column if not exists smtp_servidor text,
  add column if not exists smtp_usuario text,
  add column if not exists smtp_puerto integer,
  add column if not exists smtp_ssl boolean not null default false,
  -- Enlaces: cuentas contables
  add column if not exists cuenta_caja text,
  add column if not exists cuenta_compras text,
  add column if not exists cuenta_banco_compras text,
  add column if not exists cuenta_efectos_pagar text,
  add column if not exists cuenta_ventas text,
  add column if not exists cuenta_banco_ventas text,
  add column if not exists cuenta_efectos_cobrar text,
  add column if not exists cuenta_efectos_impagados text,
  -- Parámetros generales
  add column if not exists asignar_vendedor_cliente boolean not null default false,
  add column if not exists parametros_exclusivos boolean not null default false,
  add column if not exists generar_pagos_con_tienda boolean not null default false,
  add column if not exists generar_mov_caja_con_tienda boolean not null default false,
  add column if not exists igic_en_linea_defecto boolean not null default false,
  add column if not exists igic_modo smallint not null default 0,
  add column if not exists igic_defecto_pct numeric(6,2),
  add column if not exists fp_cierre_efectivo_codigo text references public.forma_pago(codigo),
  add column if not exists fp_cierre_tarjetas_codigo text references public.forma_pago(codigo),
  add column if not exists fp_cierre_talones_codigo text references public.forma_pago(codigo),
  add column if not exists fp_cierre_efectos_codigo text references public.forma_pago(codigo),
  -- Contadores externos para la facturación (Variable, Fijo 1, Fijo 2) y bloqueo
  add column if not exists contadores_externos jsonb not null default '{}'::jsonb,
  add column if not exists bloqueo_contadores smallint,
  -- Tarifas de PVP: grupo con acceso por nivel 1..6 ({"1": rol_id, …}; sin clave = a todos)
  add column if not exists tarifa_acceso jsonb not null default '{}'::jsonb,
  add column if not exists imagen_modo smallint not null default 1;

comment on column public.tienda_terminal.igic_modo is 'IGIC en ventas y facturas: 0 Predeterminado, 1 Siempre, 2 Nunca (opciones a confirmar con GeminisWin).';
comment on column public.tienda_terminal.contadores_externos is 'Contadores externos para la facturación: {"variable"|"fijo1"|"fijo2": {dc, incrementa_deuda, emitir_pagada, cambiar_numero, eliminar}, "dc_predet"}.';
comment on column public.tienda_terminal.bloqueo_contadores is 'Bloqueo de los contadores: 0 siempre que varíe su valor, 1 si lo introduce el usuario, 2 al grabar registros nuevos.';
comment on column public.tienda_terminal.tarifa_acceso is 'Permitir acceso a las tarifas 1..6 (MAYOR M-1…Tarifa Dcto -6): {"nivel": rol_id}. Sin clave: a todos.';

-- ── Datos de empresa ───────────────────────────────────────────────────────────────────────
alter table public.empresa
  add column if not exists sinli_id text,
  add column if not exists smtp_servidor text,
  add column if not exists smtp_usuario text,
  add column if not exists smtp_puerto integer,
  add column if not exists smtp_ssl boolean not null default false,
  add column if not exists logotipo_modo smallint not null default 1;
comment on column public.empresa.sinli_id is 'Sinli Id Fande (identificador SINLI de la empresa).';

-- ── Formas de pago ─────────────────────────────────────────────────────────────────────────
alter table public.forma_pago
  add column if not exists vencimientos_como_pagados boolean not null default false,
  add column if not exists imagen_modo smallint not null default 1;
comment on column public.forma_pago.vencimientos_como_pagados is 'Generador de pagos: «Al generar los vencimientos, ponerlos como pagados».';
comment on column public.forma_pago.cadencia_nivel1 is 'Generador de pagos: días de la primera cadencia (nivel1..6 = Primera..Sexta; nivel0 = Resto).';

-- ── Empleados ──────────────────────────────────────────────────────────────────────────────
alter table public.empleado
  add column if not exists imagen_modo smallint not null default 1,
  add column if not exists sugerencia_clave text;

-- ── Grupo administrador ────────────────────────────────────────────────────────────────────
alter table public.rol add column if not exists es_administrador boolean not null default false;
comment on column public.rol.es_administrador is 'Grupo administrador: crea usuarios de acceso, pone claves, cambia grupos y ajusta contadores de numeración.';

insert into public.rol (codigo, nombre, nivel_acceso, es_administrador)
select 'ADMINISTRADOR', 'Administrador', 'total', true
where not exists (select 1 from public.rol where codigo = 'ADMINISTRADOR');

insert into public.rol_permiso (rol_id, permiso_codigo)
select r.id, p.codigo from public.rol r cross join public.permiso p
where r.codigo = 'ADMINISTRADOR'
on conflict do nothing;

update public.empleado set rol_id = (select id from public.rol where codigo = 'ADMINISTRADOR') where codigo = 'ROBER';

create or replace function public.fn_es_administrador()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from empleado e join rol r on r.id = e.rol_id
    where e.auth_user_id = auth.uid() and e.activo and r.es_administrador
  );
$$;
revoke all on function public.fn_es_administrador() from public, anon;
grant execute on function public.fn_es_administrador() to authenticated;

-- Grupos y permisos: solo un administrador puede cambiarlos (políticas RESTRICTIVAS, se suman
-- a la de acceso total de autenticados).
create policy admin_escribe_rol on public.rol as restrictive for insert to authenticated with check (public.fn_es_administrador());
create policy admin_modifica_rol on public.rol as restrictive for update to authenticated using (public.fn_es_administrador());
create policy admin_borra_rol on public.rol as restrictive for delete to authenticated using (public.fn_es_administrador());
create policy admin_escribe_rol_permiso on public.rol_permiso as restrictive for insert to authenticated with check (public.fn_es_administrador());
create policy admin_modifica_rol_permiso on public.rol_permiso as restrictive for update to authenticated using (public.fn_es_administrador());
create policy admin_borra_rol_permiso on public.rol_permiso as restrictive for delete to authenticated using (public.fn_es_administrador());
create policy admin_escribe_permiso on public.permiso as restrictive for insert to authenticated with check (public.fn_es_administrador());
create policy admin_modifica_permiso on public.permiso as restrictive for update to authenticated using (public.fn_es_administrador());
create policy admin_borra_permiso on public.permiso as restrictive for delete to authenticated using (public.fn_es_administrador());

-- Empleado: el grupo (rol_id) y el usuario de acceso (auth_user_id) solo los cambia un
-- administrador (o el servidor: Edge Function con service role, funciones SECURITY DEFINER).
create or replace function public.fn_empleado_proteger_acceso()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    if (new.rol_id is not null or new.auth_user_id is not null) and not public.fn_es_administrador() then
      raise exception 'Solo un administrador puede asignar el grupo o el usuario de acceso de un empleado.' using errcode = '42501';
    end if;
  elsif tg_op = 'UPDATE' then
    if (new.rol_id is distinct from old.rol_id or new.auth_user_id is distinct from old.auth_user_id)
       and not public.fn_es_administrador() then
      raise exception 'Solo un administrador puede cambiar el grupo o el usuario de acceso de un empleado.' using errcode = '42501';
    end if;
  elsif tg_op = 'DELETE' then
    if old.auth_user_id is not null and not public.fn_es_administrador() then
      raise exception 'Solo un administrador puede borrar un empleado con usuario de acceso.' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
create trigger trg_empleado_proteger_acceso
  before insert or update or delete on public.empleado
  for each row execute function public.fn_empleado_proteger_acceso();

-- Usuario de acceso de cada empleado (nombre de usuario = parte del correo antes de @ofipapel.local).
create or replace function public.fn_empleado_usuarios_acceso()
returns table (empleado_codigo text, usuario text, ultimo_acceso timestamptz)
language sql stable security definer set search_path = public, auth
as $$
  select e.codigo, split_part(u.email, '@', 1), u.last_sign_in_at
  from public.empleado e join auth.users u on u.id = e.auth_user_id;
$$;
revoke all on function public.fn_empleado_usuarios_acceso() from public, anon;
grant execute on function public.fn_empleado_usuarios_acceso() to authenticated;

-- ── Contadores de numeración (secuencia_numeracion) ────────────────────────────────────────
-- Desde el navegador no se pueden tocar: solo fn_siguiente_numero (+1, SECURITY DEFINER) y
-- fn_ajustar_contador (administrador, nunca por debajo del último número usado).
create or replace function public.fn_secuencia_proteger()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    raise exception 'Los contadores de numeración solo se cambian desde Tiendas · Contadores (administrador).' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger trg_secuencia_proteger
  before insert or update or delete on public.secuencia_numeracion
  for each row execute function public.fn_secuencia_proteger();

-- Último número realmente usado en cada tipo de documento de una tienda (null si no se sabe).
create or replace function public.fn_ultimo_numero_usado(p_tienda text, p_tipo text, p_serie text)
returns bigint
language plpgsql stable security definer set search_path = public
as $$
declare v bigint;
begin
  case p_tipo
    when 'venta' then select max(numero) into v from venta where tienda_terminal_codigo = p_tienda;
    when 'pedido_cliente' then select max(numero) into v from pedido_cliente where tienda_terminal_codigo = p_tienda;
    when 'pedido_proveedor' then select max(numero) into v from pedido_proveedor where tienda_terminal_codigo = p_tienda;
    when 'reparto' then select max(numero) into v from reparto where tienda_terminal_codigo = p_tienda;
    when 'traspaso_almacen' then select max(numero) into v from traspaso_almacen where tienda_terminal_codigo = p_tienda;
    when 'regularizacion_stock' then select max(numero) into v from regularizacion_stock where tienda_terminal_codigo = p_tienda;
    when 'inventario' then select max(numero) into v from inventario where tienda_terminal_codigo = p_tienda;
    when 'punto_restauracion_stock' then select max(numero) into v from punto_restauracion_stock where tienda_terminal_codigo = p_tienda;
    when 'pago' then select max(codigo_pago) into v from cobro_cliente where tienda_terminal_codigo = p_tienda;
    when 'pago_proveedor' then select max(codigo_pago) into v from pago_proveedor where tienda_terminal_codigo = p_tienda;
    when 'factura_proveedor' then select max(id) into v from factura_proveedor where tienda_terminal_codigo = p_tienda;
    when 'caja' then select max(numero) into v from movimiento_caja where tienda_terminal_codigo = p_tienda;
    when 'factura' then
      if coalesce(p_serie, '') = '' then
        select max(numero) into v from factura where tienda_terminal_codigo = p_tienda;
      elsif p_serie = '__GLOBAL__' then
        v := null;
      else
        select max(n_factura) into v from factura where tienda_terminal_codigo = p_tienda and serie = p_serie;
      end if;
    else
      v := null;
  end case;
  return v;
end;
$$;
revoke all on function public.fn_ultimo_numero_usado(text, text, text) from public, anon;
grant execute on function public.fn_ultimo_numero_usado(text, text, text) to authenticated;

-- Ajusta el contador para que el siguiente documento salga con p_ultimo + 1. Solo administrador.
-- Nunca deja el contador por debajo del último número usado: ni del que hay en los documentos,
-- ni (si el tipo no se sabe comprobar) del que ya marcaba el contador.
create or replace function public.fn_ajustar_contador(p_tienda text, p_tipo text, p_serie text, p_ultimo bigint)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  v_actual bigint;
  v_usado bigint;
  v_minimo bigint;
begin
  if not public.fn_es_administrador() then
    raise exception 'Solo un administrador puede cambiar los contadores de numeración.' using errcode = '42501';
  end if;
  if p_ultimo is null or p_ultimo < 0 then
    raise exception 'Número no válido.';
  end if;
  select siguiente_numero - 1 into v_actual from secuencia_numeracion
   where tienda_terminal_codigo = p_tienda and tipo_documento_codigo = p_tipo and serie = coalesce(p_serie, '')
   for update;
  v_usado := public.fn_ultimo_numero_usado(p_tienda, p_tipo, coalesce(p_serie, ''));
  -- Tipo sin comprobación en documentos: no se baja nunca del valor que ya tenía.
  v_minimo := coalesce(v_usado, v_actual, 0);
  if p_ultimo < v_minimo then
    raise exception 'No se puede poner % : el último número usado es %.', p_ultimo, v_minimo using errcode = '22023';
  end if;
  insert into secuencia_numeracion (tienda_terminal_codigo, tipo_documento_codigo, serie, siguiente_numero)
  values (p_tienda, p_tipo, coalesce(p_serie, ''), p_ultimo + 1)
  on conflict (tienda_terminal_codigo, tipo_documento_codigo, serie)
  do update set siguiente_numero = excluded.siguiente_numero, actualizado_en = now();
  return p_ultimo;
end;
$$;
revoke all on function public.fn_ajustar_contador(text, text, text, bigint) from public, anon;
grant execute on function public.fn_ajustar_contador(text, text, text, bigint) to authenticated;

-- ── Ctrl+Intro (lista ordenada) de las fichas del menú Archivo ─────────────────────────────
create or replace function public.gw_lista_ordenada_maestros(
  p_fuente text, p_campo text, p_modo text, p_sk text, p_k text, p_ancla text, p_limite integer, p_omitir_vacios boolean)
returns jsonb
language plpgsql stable set search_path = public
as $$
declare
  v_from text; v_key text; v_cols text; v_campos text[];
  v_expr text; v_k text; v_where text; v_ord text; v_sql text; v_res jsonb;
  v_lim int := least(greatest(coalesce(p_limite, 60), 1), 300);
begin
  case p_fuente
    when 'tienda_terminal' then
      v_from := 'tienda_terminal t'; v_key := 't.codigo'; v_campos := array['codigo', 'descripcion'];
      v_cols := 'jsonb_build_object(''codigo'', t.codigo, ''descripcion'', t.descripcion, ''poblacion'', t.poblacion)';
    when 'forma_pago' then
      v_from := 'forma_pago t'; v_key := 't.codigo'; v_campos := array['codigo', 'descripcion'];
      v_cols := 'jsonb_build_object(''codigo'', t.codigo, ''descripcion'', t.descripcion, ''descripcion_corta'', t.descripcion_corta)';
    when 'empleado' then
      v_from := 'empleado t'; v_key := 't.codigo'; v_campos := array['codigo', 'nombre', 'nombre_corto'];
      v_cols := 'jsonb_build_object(''codigo'', t.codigo, ''nombre'', t.nombre, ''nombre_corto'', t.nombre_corto)';
    else
      raise exception 'Lista ordenada: fuente no permitida (%)', p_fuente;
  end case;
  if not (p_campo = any (v_campos)) then
    raise exception 'Lista ordenada: campo no permitido (%.%)', p_fuente, p_campo;
  end if;
  v_expr := format('(upper(coalesce(t.%I, '''')) collate "C")', p_campo);
  v_k := format('(%s collate "C")', v_key);
  if p_ancla is not null then
    execute format('select %s from %s where %s = $1 limit 1', v_expr, v_from, v_key) into p_sk using p_ancla;
    if p_sk is null then p_sk := ''; p_k := ''; else p_k := p_ancla; end if;
  end if;
  p_sk := coalesce(p_sk, ''); p_k := coalesce(p_k, '');
  if p_modo = 'lt' then
    v_where := format('%1$s <= $1 and (%1$s < $1 or %2$s < $2)', v_expr, v_k);
    v_ord := format('%s desc, %s desc', v_expr, v_k);
  elsif p_modo = 'gt' then
    v_where := format('%1$s >= $1 and (%1$s > $1 or %2$s > $2)', v_expr, v_k);
    v_ord := format('%s, %s', v_expr, v_k);
  else
    v_where := format('%1$s >= $1 and (%1$s > $1 or %2$s >= $2)', v_expr, v_k);
    v_ord := format('%s, %s', v_expr, v_k);
  end if;
  if p_omitir_vacios then
    v_where := v_where || format(' and coalesce(t.%I, '''') <> ''''', p_campo);
  end if;
  v_sql := format(
    'select coalesce(jsonb_agg(r.j || jsonb_build_object(''_sk'', r.sk, ''_k'', r.k) order by r.sk, r.k), ''[]''::jsonb) '
    || 'from (select %s as j, %s as sk, %s as k from %s where %s order by %s limit $3) r',
    v_cols, v_expr, v_k, v_from, v_where, v_ord);
  execute v_sql into v_res using p_sk, p_k, v_lim;
  return v_res;
end;
$$;
grant execute on function public.gw_lista_ordenada_maestros(text, text, text, text, text, text, integer, boolean) to authenticated;

-- ── Datos de empresa: datos legales de las facturas (NIF, VeriFactu): solo los cambia un
-- administrador (migración aparte «empresa_solo_admin_escribe»).
create policy admin_escribe_empresa on public.empresa as restrictive for insert to authenticated with check (public.fn_es_administrador());
create policy admin_modifica_empresa on public.empresa as restrictive for update to authenticated using (public.fn_es_administrador());
create policy admin_borra_empresa on public.empresa as restrictive for delete to authenticated using (public.fn_es_administrador());
