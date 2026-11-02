-- Acuerdos de Dirección y auditoría a prueba de todos (Luis, 02/11/2026):
--  · «¿Qué pasa con la auditoría el día que me jubile?» → los cambios de protocolo (quién es super
--    administrador, qué avisos recibe cada uno, quién es la gerencia, importe de la doble firma, control de
--    teletrabajo) solo se hacen con un Acuerdo de Dirección firmado. Ni la gerencia los cambia en la ficha.
--  · De momento los Acuerdos solo los ve y firma la gerencia (Luis), que decide cuándo abrirlos al resto
--    de super administradores (empresa_gobierno.acuerdos_abiertos). Abiertos, firman todos.
--  · Sucesión: si la gerencia no puede firmar, los demás super administradores pueden proponer un acuerdo de
--    sucesión con el documento legal adjunto; entra en vigor 7 días después de la última firma salvo que la
--    gerencia lo rechace (aviso urgente a todos).
--  · «Nadie, ni ahora ni después, puede librarse de la auditoría»: los acuerdos NO pueden tocar la auditoría
--    (lista cerrada de cambios permitidos). La auditoría se sella cada hora con una huella encadenada
--    (auditoria_sello) y se comprueba con fn_auditoria_comprobar_integridad (también que siguen activos los
--    registros de cada tabla). Cada noche, la huella va por correo a la gerencia (copia fuera del programa).
--  · Lo que hace la gerencia (avisos graves) les llega también a los demás super administradores.

-- 1. Gobierno: quién es la gerencia y si los Acuerdos están abiertos -----------------------------------
create table if not exists public.empresa_gobierno (
  id smallint primary key default 1 check (id = 1),
  gerente_codigo text not null references public.empleado (codigo),
  acuerdos_abiertos boolean not null default false,
  actualizado_en timestamptz not null default now()
);
comment on table public.empresa_gobierno is 'Gerencia y apertura de los Acuerdos de Dirección. Solo cambia por acuerdo o por la gerencia (abrir/cerrar).';
insert into public.empresa_gobierno (id, gerente_codigo) values (1, 'LUIS') on conflict (id) do nothing;
alter table public.empresa_gobierno enable row level security;
drop policy if exists empresa_gobierno_lee on public.empresa_gobierno;
create policy empresa_gobierno_lee on public.empresa_gobierno for select to authenticated using (true);
drop trigger if exists trg_auditoria_empresa_gobierno on public.empresa_gobierno;
create trigger trg_auditoria_empresa_gobierno after insert or update or delete on public.empresa_gobierno
  for each row execute function public.fn_auditoria_trigger();

create or replace function public.fn_es_gerente()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from empresa_gobierno where gerente_codigo = fn_empleado_actual())
$$;

create or replace function public.fn_acuerdos_acceso()
returns boolean language sql stable security definer set search_path = public as $$
  select fn_es_gerente() or (fn_es_super_administrador() and coalesce((select acuerdos_abiertos from empresa_gobierno), false))
$$;

-- 2. Acuerdos ------------------------------------------------------------------------------------------
create table if not exists public.acuerdo (
  id bigint generated always as identity primary key,
  titulo text not null,
  texto text not null default '',
  tipo text not null default 'protocolo' check (tipo in ('protocolo', 'gerencia', 'sucesion', 'otro')),
  cambios jsonb not null default '[]',
  estado text not null default 'borrador' check (estado in ('borrador', 'pendiente', 'en_vigor', 'rechazado', 'retirado')),
  creado_por text not null,
  creado_en timestamptz not null default now(),
  propuesto_en timestamptz,
  efecto_en timestamptz,
  en_vigor_en timestamptz,
  adjunto_nombre text,
  adjunto_huella text,
  motivo_rechazo text,
  huella text,
  huella_anterior text
);
comment on table public.acuerdo is 'Acuerdos de Dirección: cambios de protocolo firmados. Los que están en vigor no se modifican ni se borran.';
alter table public.acuerdo enable row level security;
drop policy if exists acuerdo_lee on public.acuerdo;
create policy acuerdo_lee on public.acuerdo for select to authenticated
  using (public.fn_acuerdos_acceso() or (tipo = 'sucesion' and public.fn_es_super_administrador()));
drop trigger if exists trg_auditoria_acuerdo on public.acuerdo;
create trigger trg_auditoria_acuerdo after insert or update or delete on public.acuerdo
  for each row execute function public.fn_auditoria_trigger();

create table if not exists public.acuerdo_adjunto (
  acuerdo_id bigint primary key references public.acuerdo (id),
  nombre text not null,
  base64 text not null,
  creado_en timestamptz not null default now()
);
alter table public.acuerdo_adjunto enable row level security;
drop policy if exists acuerdo_adjunto_lee on public.acuerdo_adjunto;
create policy acuerdo_adjunto_lee on public.acuerdo_adjunto for select to authenticated
  using (exists (select 1 from public.acuerdo a where a.id = acuerdo_id));

create table if not exists public.acuerdo_firma (
  acuerdo_id bigint not null references public.acuerdo (id),
  empleado_codigo text not null references public.empleado (codigo),
  decision text not null check (decision in ('firma', 'rechaza')),
  comentario text,
  firmado_en timestamptz not null default now(),
  primary key (acuerdo_id, empleado_codigo)
);
alter table public.acuerdo_firma enable row level security;
drop policy if exists acuerdo_firma_lee on public.acuerdo_firma;
create policy acuerdo_firma_lee on public.acuerdo_firma for select to authenticated
  using (exists (select 1 from public.acuerdo a where a.id = acuerdo_id));
drop trigger if exists trg_auditoria_acuerdo_firma on public.acuerdo_firma;
create trigger trg_auditoria_acuerdo_firma after insert or update or delete on public.acuerdo_firma
  for each row execute function public.fn_auditoria_trigger();

-- Inmutables: un acuerdo cerrado no cambia; firmas y adjuntos no se tocan; nada se borra.
create or replace function public.fn_acuerdo_inmutable()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Los Acuerdos de Dirección no se borran. Cómo hacerlo bien: si ya no vale, haz un acuerdo nuevo que lo sustituya.'; end if;
  if tg_table_name = 'acuerdo' and old.estado in ('en_vigor', 'rechazado', 'retirado') then
    raise exception 'Este acuerdo ya está cerrado y no se puede cambiar. Cómo hacerlo bien: haz un acuerdo nuevo que lo sustituya.';
  end if;
  if tg_table_name <> 'acuerdo' then raise exception 'Las firmas y los documentos de un acuerdo no se pueden cambiar.'; end if;
  return new;
end $$;
drop trigger if exists trg_acuerdo_inmutable on public.acuerdo;
create trigger trg_acuerdo_inmutable before update or delete on public.acuerdo for each row execute function public.fn_acuerdo_inmutable();
drop trigger if exists trg_acuerdo_firma_inmutable on public.acuerdo_firma;
create trigger trg_acuerdo_firma_inmutable before update or delete on public.acuerdo_firma for each row execute function public.fn_acuerdo_inmutable();
drop trigger if exists trg_acuerdo_adjunto_inmutable on public.acuerdo_adjunto;
create trigger trg_acuerdo_adjunto_inmutable before update or delete on public.acuerdo_adjunto for each row execute function public.fn_acuerdo_inmutable();

-- 3. Blindaje: estos cambios solo por acuerdo -------------------------------------------------------------
create or replace function public.fn_protocolo_por_acuerdo()
returns trigger language plpgsql as $$
declare v_msg text := 'Este cambio es un protocolo de la empresa y solo se hace con un Acuerdo de Dirección firmado. Cómo hacerlo bien: Archivo → Acuerdos de Dirección → Nuevo acuerdo (lo propone la gerencia y lo firman los super administradores).';
begin
  if coalesce(current_setting('erp.por_acuerdo', true), '') <> '' then return coalesce(new, old); end if;
  if tg_table_name = 'empleado' then
    if tg_op = 'INSERT' and (new.super_administrador or new.avisos_grupos <> '{}') then raise exception '%', v_msg using errcode = '42501'; end if;
    if tg_op = 'UPDATE' and (new.super_administrador is distinct from old.super_administrador or new.avisos_grupos is distinct from old.avisos_grupos) then
      raise exception '%', v_msg using errcode = '42501';
    end if;
  elsif tg_table_name = 'parametro' then
    if tg_op = 'DELETE' then
      if old.clave in ('contab.importe_doble_firma', 'acceso.control_remoto') then raise exception '%', v_msg using errcode = '42501'; end if;
    elsif new.clave in ('contab.importe_doble_firma', 'acceso.control_remoto') then
      if tg_op = 'INSERT' then raise exception '%', v_msg using errcode = '42501'; end if;
      if new.valor is distinct from old.valor then raise exception '%', v_msg using errcode = '42501'; end if;
    end if;
  elsif tg_table_name = 'empresa_gobierno' then
    if tg_op = 'DELETE' then raise exception '%', v_msg using errcode = '42501'; end if;
    if new.gerente_codigo is distinct from old.gerente_codigo
       or (new.acuerdos_abiertos is distinct from old.acuerdos_abiertos and coalesce(current_setting('erp.gobierno', true), '') <> 'on') then
      raise exception '%', v_msg using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists trg_protocolo_empleado on public.empleado;
create trigger trg_protocolo_empleado before insert or update on public.empleado for each row execute function public.fn_protocolo_por_acuerdo();
drop trigger if exists trg_protocolo_parametro on public.parametro;
create trigger trg_protocolo_parametro before insert or update or delete on public.parametro for each row execute function public.fn_protocolo_por_acuerdo();
drop trigger if exists trg_protocolo_gobierno on public.empresa_gobierno;
create trigger trg_protocolo_gobierno before update or delete on public.empresa_gobierno for each row execute function public.fn_protocolo_por_acuerdo();

-- Abrir o cerrar los Acuerdos al resto de super administradores (solo la gerencia).
create or replace function public.fn_acuerdos_abrir(p_abrir boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not fn_es_gerente() then raise exception 'Solo la gerencia decide cuándo se abren los Acuerdos de Dirección.'; end if;
  perform set_config('erp.gobierno', 'on', true);
  update empresa_gobierno set acuerdos_abiertos = p_abrir, actualizado_en = now() where id = 1;
  perform set_config('erp.gobierno', '', true);
end $$;

-- 4. Funcionamiento de los acuerdos -------------------------------------------------------------------
-- Quién tiene que firmar: cerrado → la gerencia; abierto → todos los super administradores; sucesión → todos menos la gerencia.
create or replace function public.fn_acuerdo_firmantes(p_id bigint)
returns text[] language sql stable security definer set search_path = public as $$
  select case
    when a.tipo = 'sucesion' then array(select e.codigo from empleado e where e.activo and e.super_administrador and e.auth_user_id is not null
                                          and e.codigo <> g.gerente_codigo order by e.codigo)
    when not g.acuerdos_abiertos then array[g.gerente_codigo]
    else array(select e.codigo from empleado e where e.activo and e.super_administrador and e.auth_user_id is not null order by e.codigo)
  end
  from acuerdo a, empresa_gobierno g where a.id = p_id and g.id = 1
$$;

-- Cambios permitidos (lista cerrada: la auditoría NO está ni puede estar aquí).
create or replace function public.fn_acuerdo_validar(p_tipo text, p_cambios jsonb)
returns void language plpgsql stable security definer set search_path = public as $$
declare c jsonb; v_acc text; v_emp text;
begin
  if jsonb_typeof(coalesce(p_cambios, '[]')) <> 'array' then raise exception 'Cambios no válidos.'; end if;
  for c in select * from jsonb_array_elements(coalesce(p_cambios, '[]')) loop
    v_acc := c ->> 'accion';
    v_emp := c ->> 'empleado';
    if v_acc not in ('super_administrador', 'avisos_grupos', 'gerencia', 'parametro', 'acuerdos_abiertos') then
      raise exception 'Cambio no permitido en un acuerdo: %. Los acuerdos no pueden tocar la auditoría ni nada fuera de la lista.', coalesce(v_acc, '(vacío)');
    end if;
    if p_tipo = 'sucesion' and v_acc not in ('gerencia', 'super_administrador', 'avisos_grupos') then
      raise exception 'Un acuerdo de sucesión solo puede cambiar la gerencia, los super administradores y sus avisos.';
    end if;
    if v_acc in ('super_administrador', 'avisos_grupos', 'gerencia') and not exists (select 1 from empleado where codigo = v_emp and activo) then
      raise exception 'No existe el empleado % o está de baja.', coalesce(v_emp, '(vacío)');
    end if;
    if v_acc = 'avisos_grupos' and exists (select 1 from jsonb_array_elements_text(coalesce(c -> 'grupos', '[]')) g
                                           where g not in ('todo', 'ventas', 'compras', 'contabilidad', 'seguridad')) then
      raise exception 'Grupo de avisos no válido.';
    end if;
    if v_acc = 'parametro' and c ->> 'clave' not in ('contab.importe_doble_firma', 'acceso.control_remoto') then
      raise exception 'Ese parámetro no se cambia por acuerdo.';
    end if;
  end loop;
end $$;

create or replace function public.fn_acuerdo_guardar(p_id bigint, p_titulo text, p_texto text, p_tipo text, p_cambios jsonb,
                                                    p_adjunto_nombre text default null, p_adjunto_base64 text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint := p_id; a acuerdo;
begin
  if not (fn_acuerdos_acceso() or (p_tipo = 'sucesion' and fn_es_super_administrador())) then
    raise exception 'Los Acuerdos de Dirección solo los lleva la gerencia por ahora.';
  end if;
  if length(btrim(coalesce(p_titulo, ''))) < 3 then raise exception 'Ponle un título al acuerdo.'; end if;
  perform fn_acuerdo_validar(p_tipo, p_cambios);
  if v_id is null then
    insert into acuerdo (titulo, texto, tipo, cambios, creado_por) values (btrim(p_titulo), coalesce(p_texto, ''), p_tipo, coalesce(p_cambios, '[]'), fn_empleado_actual())
    returning id into v_id;
  else
    select * into a from acuerdo where id = v_id;
    if not found or a.estado <> 'borrador' or a.creado_por <> fn_empleado_actual() then raise exception 'Solo se puede cambiar un borrador tuyo.'; end if;
    update acuerdo set titulo = btrim(p_titulo), texto = coalesce(p_texto, ''), tipo = p_tipo, cambios = coalesce(p_cambios, '[]') where id = v_id;
  end if;
  if nullif(p_adjunto_base64, '') is not null then
    if exists (select 1 from acuerdo_adjunto where acuerdo_id = v_id) then raise exception 'El documento ya está adjunto y no se cambia.'; end if;
    insert into acuerdo_adjunto (acuerdo_id, nombre, base64) values (v_id, coalesce(nullif(p_adjunto_nombre, ''), 'documento.pdf'), p_adjunto_base64);
    update acuerdo set adjunto_nombre = coalesce(nullif(p_adjunto_nombre, ''), 'documento.pdf'), adjunto_huella = md5(p_adjunto_base64) where id = v_id;
  end if;
  return v_id;
end $$;

-- Aplica los cambios y lo deja en vigor con su huella encadenada.
create or replace function public.fn_acuerdo_aplicar(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare a acuerdo; c jsonb; v_ant text; v_firmas text;
begin
  select * into a from acuerdo where id = p_id for update;
  if a.estado <> 'pendiente' then return; end if;
  perform set_config('erp.por_acuerdo', p_id::text, true);
  for c in select * from jsonb_array_elements(a.cambios) loop
    case c ->> 'accion'
      when 'super_administrador' then update empleado set super_administrador = (c ->> 'valor')::boolean where codigo = c ->> 'empleado';
      when 'avisos_grupos' then update empleado set avisos_grupos = array(select jsonb_array_elements_text(coalesce(c -> 'grupos', '[]'))) where codigo = c ->> 'empleado';
      when 'gerencia' then
        update empleado set super_administrador = true where codigo = c ->> 'empleado' and not super_administrador;
        update empresa_gobierno set gerente_codigo = c ->> 'empleado', actualizado_en = now() where id = 1;
      when 'parametro' then
        insert into parametro (clave, valor) values (c ->> 'clave', c -> 'valor') on conflict (clave) do update set valor = excluded.valor;
      when 'acuerdos_abiertos' then update empresa_gobierno set acuerdos_abiertos = (c ->> 'valor')::boolean, actualizado_en = now() where id = 1;
    end case;
  end loop;
  perform set_config('erp.por_acuerdo', '', true);
  select huella into v_ant from acuerdo where estado = 'en_vigor' and huella is not null order by en_vigor_en desc, id desc limit 1;
  select string_agg(empleado_codigo || ':' || decision || ':' || to_char(firmado_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS'), ',' order by empleado_codigo)
    into v_firmas from acuerdo_firma where acuerdo_id = p_id;
  update acuerdo set estado = 'en_vigor', en_vigor_en = now(), huella_anterior = v_ant,
         huella = encode(sha256(convert_to(concat_ws('|', v_ant, a.id, a.titulo, a.texto, a.tipo, a.cambios::text, a.adjunto_huella, v_firmas), 'UTF8')), 'hex')
   where id = p_id;
end $$;

create or replace function public.fn_acuerdo_proponer(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare a acuerdo;
begin
  select * into a from acuerdo where id = p_id;
  if not found or a.estado <> 'borrador' or a.creado_por <> fn_empleado_actual() then raise exception 'Solo se propone un borrador tuyo.'; end if;
  if a.tipo = 'sucesion' and a.adjunto_huella is null then
    raise exception 'Un acuerdo de sucesión necesita el documento legal adjunto (acta, escritura o certificado). Cómo hacerlo bien: adjúntalo y vuelve a proponerlo.';
  end if;
  if jsonb_array_length(a.cambios) = 0 and a.tipo <> 'otro' then raise exception 'El acuerdo no cambia nada: añade los cambios o márcalo como «otro».'; end if;
  perform fn_acuerdo_validar(a.tipo, a.cambios);
  update acuerdo set estado = 'pendiente', propuesto_en = now() where id = p_id;
  -- Quien lo propone lo firma, si le toca firmar.
  if fn_empleado_actual() = any (fn_acuerdo_firmantes(p_id)) then
    perform fn_acuerdo_firmar(p_id, true, 'Propuesto por mí');
  end if;
end $$;

create or replace function public.fn_acuerdo_firmar(p_id bigint, p_firma boolean, p_comentario text default null)
returns text language plpgsql security definer set search_path = public as $$
declare a acuerdo; v_yo text := fn_empleado_actual(); v_firmantes text[]; v_faltan int; v_gerente text := (select gerente_codigo from empresa_gobierno);
begin
  select * into a from acuerdo where id = p_id for update;
  if not found or a.estado <> 'pendiente' then raise exception 'Ese acuerdo no está pendiente de firma.'; end if;
  -- En una sucesión, la gerencia puede rechazarla mientras no haya entrado en vigor.
  if a.tipo = 'sucesion' and v_yo = v_gerente and not p_firma then
    insert into acuerdo_firma (acuerdo_id, empleado_codigo, decision, comentario) values (p_id, v_yo, 'rechaza', p_comentario)
    on conflict (acuerdo_id, empleado_codigo) do nothing;
    update acuerdo set estado = 'rechazado', motivo_rechazo = coalesce(nullif(btrim(p_comentario), ''), 'Rechazado por la gerencia') where id = p_id;
    return 'rechazado';
  end if;
  v_firmantes := fn_acuerdo_firmantes(p_id);
  if not (v_yo = any (v_firmantes)) then raise exception 'No te toca firmar este acuerdo.'; end if;
  if exists (select 1 from acuerdo_firma where acuerdo_id = p_id and empleado_codigo = v_yo) then raise exception 'Ya lo has firmado.'; end if;
  if not p_firma and length(btrim(coalesce(p_comentario, ''))) < 3 then raise exception 'Escribe por qué lo rechazas.'; end if;
  insert into acuerdo_firma (acuerdo_id, empleado_codigo, decision, comentario) values (p_id, v_yo, case when p_firma then 'firma' else 'rechaza' end, p_comentario);
  if not p_firma then
    update acuerdo set estado = 'rechazado', motivo_rechazo = btrim(p_comentario) where id = p_id;
    return 'rechazado';
  end if;
  select count(*) into v_faltan from unnest(v_firmantes) f
   where not exists (select 1 from acuerdo_firma x where x.acuerdo_id = p_id and x.empleado_codigo = f and x.decision = 'firma');
  if v_faltan > 0 then return 'pendiente'; end if;
  if a.tipo = 'sucesion' then
    update acuerdo set efecto_en = now() + interval '7 days' where id = p_id;
    return 'en_espera';
  end if;
  perform fn_acuerdo_aplicar(p_id);
  return 'en_vigor';
end $$;

create or replace function public.fn_acuerdo_retirar(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  update acuerdo set estado = 'retirado' where id = p_id and estado in ('borrador', 'pendiente') and creado_por = fn_empleado_actual();
  if not found then raise exception 'Solo quien lo hizo puede retirarlo, mientras no esté en vigor.'; end if;
end $$;

-- Sucesiones que ya han cumplido los 7 días (pg_cron, cada hora).
create or replace function public.fn_acuerdos_aplicar_pendientes()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id from acuerdo where estado = 'pendiente' and efecto_en is not null and efecto_en <= now() loop
    perform fn_acuerdo_aplicar(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.fn_acuerdos_lista()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'id', a.id, 'titulo', a.titulo, 'texto', a.texto, 'tipo', a.tipo, 'cambios', a.cambios, 'estado', a.estado,
           'creado_por', a.creado_por, 'creado_nombre', ec.nombre, 'creado_en', a.creado_en, 'propuesto_en', a.propuesto_en,
           'efecto_en', a.efecto_en, 'en_vigor_en', a.en_vigor_en, 'adjunto_nombre', a.adjunto_nombre, 'motivo_rechazo', a.motivo_rechazo,
           'huella', a.huella, 'mio', a.creado_por = fn_empleado_actual(),
           'firmantes', case when a.estado = 'pendiente' then to_jsonb(fn_acuerdo_firmantes(a.id)) end,
           'firmas', (select jsonb_agg(jsonb_build_object('empleado', f.empleado_codigo, 'nombre', e.nombre, 'decision', f.decision,
                                                          'comentario', f.comentario, 'firmado_en', f.firmado_en) order by f.firmado_en)
                        from acuerdo_firma f left join empleado e on e.codigo = f.empleado_codigo where f.acuerdo_id = a.id),
           'me_toca', a.estado = 'pendiente' and fn_empleado_actual() = any (fn_acuerdo_firmantes(a.id))
                      and not exists (select 1 from acuerdo_firma f where f.acuerdo_id = a.id and f.empleado_codigo = fn_empleado_actual())))
         order by a.estado = 'pendiente' desc, a.id desc), '[]')
    from acuerdo a left join empleado ec on ec.codigo = a.creado_por
   where fn_acuerdos_acceso() or (a.tipo = 'sucesion' and fn_es_super_administrador())
$$;

-- Foto de las reglas de hoy.
create or replace function public.fn_protocolos_vigentes()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not fn_es_super_administrador() then raise exception 'Solo para super administradores.'; end if;
  return jsonb_build_object(
    'gerente', (select jsonb_build_object('codigo', e.codigo, 'nombre', e.nombre) from empresa_gobierno g join empleado e on e.codigo = g.gerente_codigo),
    'acuerdos_abiertos', (select acuerdos_abiertos from empresa_gobierno),
    'soy_gerente', fn_es_gerente(),
    'acceso', fn_acuerdos_acceso(),
    'super_administradores', (select jsonb_agg(jsonb_build_object('codigo', codigo, 'nombre', nombre, 'grupos', coalesce(nullif(avisos_grupos, '{}'), '{todo}'),
                                                                 'horas', avisos_horas, 'correo', avisos_correo) order by nombre)
                                from empleado where activo and super_administrador),
    'empleados', (select jsonb_agg(jsonb_build_object('codigo', codigo, 'nombre', nombre, 'super', super_administrador) order by nombre)
                    from empleado where activo and auth_user_id is not null),
    'doble_firma', coalesce(nullif(fn_parametro_texto('contab.importe_doble_firma'), '')::numeric, 3000),
    'control_remoto', coalesce(fn_parametro_texto('acceso.control_remoto'), 'false') = 'true',
    'redes', (select count(*) from red_tienda),
    'teletrabajo', (select jsonb_agg(e.nombre order by e.nombre) from empleado_acceso ea join empleado e on e.codigo = ea.empleado_codigo
                     where ea.remoto_permitido and e.activo),
    'ultimo_acuerdo', (select jsonb_build_object('id', id, 'titulo', titulo, 'en_vigor_en', en_vigor_en) from acuerdo
                        where estado = 'en_vigor' order by en_vigor_en desc limit 1));
end $$;

-- 5. Auditoría sellada: huella encadenada por tramos y vigilancia de los registros ------------------------
create table if not exists public.auditoria_sello (
  id bigint generated always as identity primary key,
  desde_id bigint not null,
  hasta_id bigint not null,
  filas integer not null,
  huella text not null,
  anterior text,
  creado_en timestamptz not null default now()
);
comment on table public.auditoria_sello is 'Sellos de la auditoría: huella (sha-256) de cada tramo de apuntes encadenada con la del anterior. Inmutable.';
alter table public.auditoria_sello enable row level security;
drop policy if exists auditoria_sello_lee on public.auditoria_sello;
create policy auditoria_sello_lee on public.auditoria_sello for select to authenticated using (public.fn_es_super_administrador());

create table if not exists public.auditoria_vigilada (
  tabla text primary key,
  desde timestamptz not null default now()
);
comment on table public.auditoria_vigilada is 'Tablas cuyo registro en la auditoría tiene que seguir activo (lo comprueba fn_auditoria_comprobar_integridad).';
alter table public.auditoria_vigilada enable row level security;
drop policy if exists auditoria_vigilada_lee on public.auditoria_vigilada;
create policy auditoria_vigilada_lee on public.auditoria_vigilada for select to authenticated using (public.fn_es_super_administrador());
insert into public.auditoria_vigilada (tabla)
select distinct c.relname from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and t.tgname like 'trg_auditoria%' and not t.tgisinternal and c.relname <> 'auditoria'
on conflict (tabla) do nothing;

create or replace function public.fn_auditoria_inmutable_sello()
returns trigger language plpgsql as $$
begin
  raise exception 'Los sellos y la lista de tablas vigiladas de la auditoría no se pueden modificar ni borrar.';
end $$;
drop trigger if exists trg_auditoria_sello_inmutable on public.auditoria_sello;
create trigger trg_auditoria_sello_inmutable before update or delete on public.auditoria_sello for each row execute function public.fn_auditoria_inmutable_sello();
drop trigger if exists trg_auditoria_vigilada_inmutable on public.auditoria_vigilada;
create trigger trg_auditoria_vigilada_inmutable before update or delete on public.auditoria_vigilada for each row execute function public.fn_auditoria_inmutable_sello();

create or replace function public.fn_auditoria_huella_tramo(p_desde bigint, p_hasta bigint, p_anterior text)
returns text language sql stable security definer set search_path = public as $$
  select encode(sha256(convert_to(coalesce(p_anterior, '') || '|' || coalesce(string_agg(a.id::text || ':' || md5(concat_ws('|', a.tabla, a.operacion, a.registro_pk, a.empleado_codigo, a.datos_antes::text,
                   a.datos_despues::text, to_char(a.ocurrido_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), a.campos::text, a.usuario_id::text, a.ip)),
                   ',' order by a.id), ''), 'UTF8')), 'hex')
    from auditoria a where a.id > p_desde and a.id <= p_hasta
$$;

-- Sella lo nuevo (lo de hace más de 10 minutos) y, a las 23 h de Canarias, manda la huella del día a la gerencia.
create or replace function public.fn_auditoria_sellar()
returns integer language plpgsql security definer set search_path = public as $$
declare v_desde bigint; v_ant text; v_hasta bigint; v_filas int; v_huella text; v_hoy date := (now() at time zone 'Atlantic/Canary')::date;
        v_correo text; v_origen text;
begin
  perform pg_advisory_xact_lock(hashtext('auditoria_sello'));
  select hasta_id, huella into v_desde, v_ant from auditoria_sello order by id desc limit 1;
  v_desde := coalesce(v_desde, 0);
  select max(id) into v_hasta from auditoria where ocurrido_en < now() - interval '10 minutes';
  if v_hasta is not null and v_hasta > v_desde then
    select count(*) into v_filas from auditoria where id > v_desde and id <= v_hasta;
    v_huella := fn_auditoria_huella_tramo(v_desde, v_hasta, v_ant);
    insert into auditoria_sello (desde_id, hasta_id, filas, huella, anterior) values (v_desde, v_hasta, v_filas, v_huella, v_ant);
  end if;
  if extract(hour from now() at time zone 'Atlantic/Canary') = 23 then
    select nullif(btrim(e.email), '') into v_correo from empresa_gobierno g join empleado e on e.codigo = g.gerente_codigo;
    v_origen := 'auditoria-sello-' || v_hoy;
    if v_correo is not null and not exists (select 1 from correo_pendiente where origen = v_origen) then
      select huella, hasta_id into v_huella, v_hasta from auditoria_sello order by id desc limit 1;
      perform fn_correo_encolar(v_correo, 'Avatar · Huella de la auditoría del ' || to_char(v_hoy, 'DD/MM/YYYY'),
        '<p>Huella de la auditoría a las ' || to_char(now() at time zone 'Atlantic/Canary', 'HH24:MI') || ' del ' || to_char(v_hoy, 'DD/MM/YYYY') ||
        ' (apuntes hasta el nº ' || v_hasta || '):</p><p style="font-family:monospace;font-size:14px">' || v_huella || '</p>' ||
        '<p>Guarda este correo y no lo reenvíes. Si alguien tocara la auditoría por fuera del programa, la huella dejaría de coincidir ' ||
        '(Archivo → Auditoría → Comprobar integridad).</p>', v_origen);
    end if;
  end if;
  return coalesce(v_filas, 0);
end $$;

create or replace function public.fn_auditoria_comprobar_integridad()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r record; v_prev text; v_calc text; v_filas int; v_fallos jsonb := '[]'; v_n int := 0; v_sin jsonb; v_pol jsonb; v_ultimo auditoria_sello;
begin
  if not fn_es_super_administrador() then raise exception 'Solo los super administradores pueden comprobar la integridad.'; end if;
  for r in select * from auditoria_sello order by id loop
    v_n := v_n + 1;
    if r.anterior is distinct from v_prev then
      v_fallos := v_fallos || jsonb_build_object('tramo', r.id, 'desde', r.desde_id, 'hasta', r.hasta_id, 'motivo', 'La cadena de sellos está rota (falta o sobra un sello)');
    end if;
    select count(*) into v_filas from auditoria where id > r.desde_id and id <= r.hasta_id;
    v_calc := fn_auditoria_huella_tramo(r.desde_id, r.hasta_id, r.anterior);
    if v_calc <> r.huella then
      v_fallos := v_fallos || jsonb_build_object('tramo', r.id, 'desde', r.desde_id, 'hasta', r.hasta_id, 'sellado', r.creado_en,
        'motivo', case when v_filas < r.filas then 'Faltan apuntes (se han borrado ' || (r.filas - v_filas) || ')'
                       when v_filas > r.filas then 'Hay apuntes metidos después (' || (v_filas - r.filas) || ')'
                       else 'Se ha cambiado el contenido de algún apunte' end);
    end if;
    v_prev := r.huella;
    v_ultimo := r;
  end loop;
  -- Que sigan activos los registros de todas las tablas vigiladas.
  select coalesce(jsonb_agg(v.tabla order by v.tabla), '[]') into v_sin
    from auditoria_vigilada v
   where not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
                      where n.nspname = 'public' and c.relname = v.tabla and t.tgname like 'trg_auditoria%' and t.tgenabled <> 'D');
  -- Que nadie haya abierto la escritura de la auditoría.
  select coalesce(jsonb_agg(policyname), '[]') into v_pol from pg_policies
   where schemaname = 'public' and tablename = 'auditoria' and (cmd in ('INSERT', 'ALL') or (cmd in ('UPDATE', 'DELETE') and coalesce(qual, '') <> 'false'));
  return jsonb_build_object('sellos', v_n, 'hasta_id', v_ultimo.hasta_id, 'ultimo_sello', v_ultimo.creado_en, 'ultima_huella', v_ultimo.huella,
    'fallos', v_fallos, 'tablas_sin_registro', v_sin, 'permisos_abiertos', v_pol,
    'correcto', jsonb_array_length(v_fallos) = 0 and jsonb_array_length(v_sin) = 0 and jsonb_array_length(v_pol) = 0);
end $$;

select public.fn_auditoria_sellar();

-- 6. Avisos: acuerdos, sucesión y lo que hace la gerencia ---------------------------------------------
create or replace function public.fn_auditoria_motivo(a public.auditoria)
returns text language sql stable security definer set search_path = public as $$
  select case
    when a.tabla = 'permiso' then null
    when a.tabla = 'movimiento_stock' and a.operacion = 'DELETE' then null
    when a.tabla = 'acuerdo' and coalesce(a.datos_despues, a.datos_antes) ->> 'tipo' = 'sucesion'
         and a.operacion = 'UPDATE' and a.datos_despues ->> 'estado' = 'pendiente' and 'estado' = any (a.campos) then 'Propuesta de sucesión en la gerencia'
    when a.tabla in ('acuerdo', 'acuerdo_firma', 'empresa_gobierno') then 'Acuerdo de Dirección'
    when a.operacion = 'FALLO_CLAVE' then
      case when (select count(*) from auditoria b where b.operacion = 'FALLO_CLAVE' and b.registro_pk = a.registro_pk
                   and b.ocurrido_en > a.ocurrido_en - interval '15 minutes' and b.ocurrido_en <= a.ocurrido_en) >= 5
           then 'Usuario bloqueado por claves incorrectas' else 'Contraseña incorrecta' end
    when a.operacion = 'FUERA_HORARIO' then 'Intento fuera de horario'
    when a.operacion = 'REMOTO_DENEGADO' then 'Entrada remota sin permiso'
    when a.operacion = 'USO_RARO' then 'Uso fuera de lo normal'
    when a.operacion in ('EXPORTA', 'IMPRIME') and (a.area = 'contabilidad' or a.registro_pk like '/contabilidad%') then 'Datos de Contabilidad sacados fuera'
    when a.operacion in ('EXPORTA', 'IMPRIME', 'PANTALLA') then null
    when a.tabla = 'ejercicio_contable' and a.operacion = 'UPDATE' and 'cerrado' = any (a.campos) then
      case when a.datos_despues ->> 'cerrado' = 'true' then 'Cierre de ejercicio' else 'Reapertura de ejercicio' end
    when a.tabla = 'contab_mes_cerrado' then
      case when a.datos_despues ->> 'cerrado' = 'true' then 'Cierre de mes' else 'Reapertura de mes' end
    when a.tabla = 'asiento' and a.operacion = 'UPDATE' and a.datos_despues ->> 'estado' = 'anulado' and 'estado' = any (a.campos) then 'Asiento anulado o modificado'
    when a.tabla = 'asiento' and a.operacion = 'INSERT' and a.datos_despues ->> 'origen_tipo' = 'manual'
         and (a.datos_despues ->> 'fecha')::date < date_trunc('month', a.ocurrido_en at time zone 'Atlantic/Canary')::date then 'Asiento con fecha atrasada'
    when a.tabla = 'apunte' and a.operacion = 'INSERT' and (a.datos_despues ->> 'cuenta') ~ '^(570|572|430)'
         and exists (select 1 from asiento s where s.id = (a.datos_despues ->> 'asiento_id')::bigint and s.origen_tipo = 'manual') then 'Asiento manual en caja, bancos o clientes'
    when a.tabla = 'cuenta_contable' then 'Cambio en el plan de cuentas'
    when a.tabla = 'asiento_propuesta' and a.operacion = 'INSERT' then 'Asiento pendiente de segunda firma'
    when a.tabla = 'parametro' and (a.registro_pk like 'contab.%' or a.registro_pk like 'acceso.%') then 'Cambio de parámetros de control'
    when a.tabla = 'red_tienda' then 'Cambio en las redes de las tiendas'
    when a.tabla = 'cuenta_bancaria' or (a.tabla = 'cliente_mandato' and (a.operacion <> 'UPDATE' or a.campos && array['iban', 'bic'])) then 'Cambio de cuenta bancaria'
    when a.tabla = 'regularizacion_stock' and a.operacion = 'INSERT' then 'Regularización de stock'
    when a.operacion = 'DELETE' and a.tabla not like '%\_linea' and a.tabla not in ('articulo_favorito', 'listado_guardado', 'auditoria_aviso_visto')
      then 'Borrado'
    when a.tabla in ('rol', 'rol_permiso', 'empleado_acceso', 'empleado_permiso', 'ejercicio') then 'Cambio de permisos / periodos'
    when a.tabla = 'empleado' and (a.operacion <> 'UPDATE'
           or a.campos && array['super_administrador', 'rol_id', 'auth_user_id', 'activo', 'conformidad_obligatoria', 'avisos_grupos'])
      then 'Cambio de empleado / acceso'
    when a.tabla = 'articulo' and a.operacion = 'UPDATE' and 'pvp' = any (a.campos)
         and exists (select 1 from articulo x where x.codigo_interno = a.registro_pk
                       and coalesce(nullif(x.coste_neto, 0), nullif(x.precio_medio_compra, 0)) > 0
                       and (a.datos_despues ->> 'pvp')::numeric / (1 + coalesce(x.igic_pct, 0) / 100)
                           < coalesce(nullif(x.coste_neto, 0), x.precio_medio_compra))
      then 'Precio por debajo del coste'
  end
$$;

create or replace function public.fn_auditoria_grupo(a public.auditoria, p_motivo text)
returns text language sql stable security definer set search_path = public as $$
  select case
    when p_motivo = 'Propuesta de sucesión en la gerencia' then 'todos'
    when p_motivo in ('Acuerdo de Dirección', 'Contraseña incorrecta', 'Usuario bloqueado por claves incorrectas', 'Intento fuera de horario',
                      'Entrada remota sin permiso', 'Uso fuera de lo normal', 'Cambio de permisos / periodos', 'Cambio de empleado / acceso',
                      'Cambio de parámetros de control', 'Cambio en las redes de las tiendas') then 'seguridad'
    when p_motivo in ('Datos de Contabilidad sacados fuera', 'Cierre de ejercicio', 'Reapertura de ejercicio', 'Cierre de mes', 'Reapertura de mes',
                      'Asiento anulado o modificado', 'Asiento con fecha atrasada', 'Asiento manual en caja, bancos o clientes',
                      'Cambio en el plan de cuentas', 'Asiento pendiente de segunda firma') then 'contabilidad'
    when p_motivo = 'Precio por debajo del coste' then 'ventas'
    when p_motivo = 'Regularización de stock' then 'compras'
    when p_motivo = 'Cambio de cuenta bancaria' then
      case when a.tabla = 'cliente_mandato' or coalesce(a.datos_despues, a.datos_antes) ->> 'tipo_entidad' ilike 'cli%' then 'ventas'
           when coalesce(a.datos_despues, a.datos_antes) ->> 'tipo_entidad' ilike 'prov%' then 'compras'
           else 'general' end
    when a.tabla ~ '(proveedor|compra|regularizacion)' then 'compras'
    when a.tabla ~ '^(venta|factura|cobro|pedido_cliente|presupuesto|albaran|cliente|movimiento_caja|caja|devolucion|remesa)' then 'ventas'
    else 'general'
  end
$$;

create or replace function public.fn_auditoria_nivel(p_motivo text)
returns text language sql immutable as $$
  select case when p_motivo in ('Cambio de permisos / periodos', 'Cambio en el plan de cuentas', 'Cambio en las redes de las tiendas', 'Cierre de mes',
                                 'Cierre de ejercicio') then 'leve'
              when p_motivo in ('Usuario bloqueado por claves incorrectas', 'Entrada remota sin permiso', 'Propuesta de sucesión en la gerencia') then 'urgente'
              else 'grave' end
$$;

-- Por grupos; además, la sucesión a todos y lo grave que hace la gerencia, también a los demás.
create or replace function public.fn_auditoria_avisos_de(p_emp text, p_dias integer default 30)
returns table (a public.auditoria, motivo text, grupo text, nivel text)
language sql stable security definer set search_path = public as $$
  with g as (select coalesce(nullif(e.avisos_grupos, '{}'), '{todo}') gs from empleado e where e.codigo = p_emp),
  ger as (select gerente_codigo from empresa_gobierno where id = 1)
  select y.a, y.motivo, y.grupo, fn_auditoria_nivel(y.motivo)
    from (select x.a, x.motivo, fn_auditoria_grupo(x.a, x.motivo) grupo
            from (select a, fn_auditoria_motivo(a) motivo
                    from auditoria a
                   where a.ocurrido_en > now() - make_interval(days => greatest(1, coalesce(p_dias, 30)))
                     and a.operacion not in ('PANTALLA', 'ENTRADA', 'SALIDA', 'CONSULTA')) x
           where x.motivo is not null) y, g, ger
   where 'todo' = any (g.gs) or y.grupo = any (g.gs) or y.grupo = 'todos'
      or ((y.a).empleado_codigo = ger.gerente_codigo and (y.a).empleado_codigo <> p_emp and fn_auditoria_nivel(y.motivo) <> 'leve')
$$;

create or replace function public.fn_auditoria_avisos(p_dias integer default 30)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_visto timestamptz; v_emp text := fn_empleado_actual(); e empleado;
begin
  if not fn_es_super_administrador() then
    return jsonb_build_object('pendientes', 0, 'urgentes', 0, 'lista', '[]'::jsonb, 'resumen', '[]'::jsonb, 'por_firmar', 0, 'acuerdos_por_firmar', 0);
  end if;
  select * into e from empleado where codigo = v_emp;
  select visto_hasta into v_visto from auditoria_aviso_visto where empleado_codigo = v_emp;
  return (
    with m as (select * from fn_auditoria_avisos_de(v_emp, p_dias)),
    nuevos as (select * from m where (m.a).ocurrido_en > coalesce(v_visto, '-infinity') and m.nivel <> 'leve')
    select jsonb_build_object(
      'pendientes', (select count(*) from nuevos),
      'urgentes', (select count(*) from nuevos where nivel = 'urgente'),
      'visto_hasta', v_visto,
      'grupos', coalesce(nullif(e.avisos_grupos, '{}'), '{todo}'),
      'horas', e.avisos_horas,
      'por_firmar', (select count(*) from asiento_propuesta p where p.estado = 'pendiente' and p.creado_por is distinct from v_emp),
      'acuerdos_por_firmar', (select count(*) from acuerdo ac where ac.estado = 'pendiente' and ac.efecto_en is null
                                and v_emp = any (fn_acuerdo_firmantes(ac.id))
                                and not exists (select 1 from acuerdo_firma f where f.acuerdo_id = ac.id and f.empleado_codigo = v_emp)),
      'resumen', coalesce((select jsonb_agg(jsonb_build_object('motivo', motivo, 'nuevos', n, 'urgente', urg) order by urg desc, n desc)
                             from (select motivo, count(*) n, bool_or(nivel = 'urgente') urg from nuevos group by motivo) r), '[]'::jsonb),
      'lista', coalesce((select jsonb_agg(fn_auditoria_fila(x.a, x.motivo) || jsonb_build_object('nivel', x.nivel, 'departamento', x.grupo)
                                          order by (x.a).ocurrido_en desc)
                           from (select * from m order by (m.a).ocurrido_en desc limit 300) x), '[]'::jsonb)));
end;
$function$;

-- 7. Permisos y programación ---------------------------------------------------------------------------
revoke execute on function public.fn_acuerdo_aplicar(bigint), public.fn_acuerdos_aplicar_pendientes(), public.fn_auditoria_sellar(),
  public.fn_auditoria_huella_tramo(bigint, bigint, text), public.fn_acuerdo_validar(text, jsonb), public.fn_acuerdo_firmantes(bigint)
  from public, anon, authenticated;
revoke execute on function public.fn_es_gerente(), public.fn_acuerdos_acceso(), public.fn_acuerdos_abrir(boolean),
  public.fn_acuerdo_guardar(bigint, text, text, text, jsonb, text, text), public.fn_acuerdo_proponer(bigint), public.fn_acuerdo_firmar(bigint, boolean, text),
  public.fn_acuerdo_retirar(bigint), public.fn_acuerdos_lista(), public.fn_protocolos_vigentes(), public.fn_auditoria_comprobar_integridad() from public, anon;
grant execute on function public.fn_es_gerente(), public.fn_acuerdos_acceso(), public.fn_acuerdos_abrir(boolean),
  public.fn_acuerdo_guardar(bigint, text, text, text, jsonb, text, text), public.fn_acuerdo_proponer(bigint), public.fn_acuerdo_firmar(bigint, boolean, text),
  public.fn_acuerdo_retirar(bigint), public.fn_acuerdos_lista(), public.fn_protocolos_vigentes(), public.fn_auditoria_comprobar_integridad() to authenticated;

do $$
begin
  perform cron.unschedule('erp_sellar_auditoria') where exists (select 1 from cron.job where jobname = 'erp_sellar_auditoria');
  perform cron.schedule('erp_sellar_auditoria', '7 * * * *', 'select public.fn_auditoria_sellar(); select public.fn_acuerdos_aplicar_pendientes();');
end $$;
