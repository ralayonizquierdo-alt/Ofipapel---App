-- Condiciones de Programación (Luis, 03/11/2026: «deberíamos tener todas estas condiciones en algún lugar… en
-- Parámetros»). Las reglas que cumple todo el que programa (Rober, los Claude, Cowork), a la vista de la gerencia:
--  · condicion_programacion: apartado, regla y por qué. Solo cambia con un Acuerdo de Dirección (cambio
--    «condicion»: alta, cambio o baja), para que nadie, tampoco el programador, se rebaje sus propias reglas.
--  · fn_condiciones_cumplimiento: semáforo que se comprueba solo (integridad de la auditoría y de los asientos,
--    tablas sin auditoría o sin RLS, funciones abiertas sin sesión, sellos al día) + lo que se comprueba a mano.
-- Pantalla: Archivo → Parámetros → Condiciones de Programación (super administradores). Copia para los Claude:
-- erp-propio/docs/CONDICIONES_PROGRAMACION.md.

create table if not exists public.condicion_programacion (
  id bigint generated always as identity primary key,
  apartado text not null,
  regla text not null,
  porque text,
  orden integer not null default 100,
  activa boolean not null default true,
  creado_en timestamptz not null default now(),
  acuerdo_id bigint references public.acuerdo (id)
);
comment on table public.condicion_programacion is 'Condiciones de programación de Ofipapel. Solo cambian con un Acuerdo de Dirección.';
alter table public.condicion_programacion enable row level security;
drop policy if exists condicion_programacion_lee on public.condicion_programacion;
create policy condicion_programacion_lee on public.condicion_programacion for select to authenticated using (public.fn_es_super_administrador());
drop trigger if exists trg_auditoria_condicion_programacion on public.condicion_programacion;
create trigger trg_auditoria_condicion_programacion after insert or update or delete on public.condicion_programacion
  for each row execute function public.fn_auditoria_trigger();

create or replace function public.fn_condicion_por_acuerdo()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('erp.por_acuerdo', true), '') = '' then
    raise exception 'Las Condiciones de Programación solo cambian con un Acuerdo de Dirección. Cómo hacerlo bien: Archivo → Acuerdos de Dirección → Nuevo acuerdo → «Condición de programación».'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then raise exception 'Una condición no se borra: se da de baja (queda en el historial).'; end if;
  return new;
end $$;
drop trigger if exists trg_condicion_por_acuerdo on public.condicion_programacion;
create trigger trg_condicion_por_acuerdo before insert or update or delete on public.condicion_programacion
  for each row execute function public.fn_condicion_por_acuerdo();

-- Condiciones de partida (las que ya se aplican, ahora juntas).
do $$
begin
  if exists (select 1 from condicion_programacion) then return; end if;
  perform set_config('erp.por_acuerdo', 'migracion-inicial', true);
  insert into condicion_programacion (apartado, regla, porque, orden) values
  ('Seguridad', 'Ninguna clave, contraseña, token, IBAN, DNI ni dato de cliente o empleado en el repositorio, en notas ni en documentos.', 'El repositorio es público: lo que se sube ahí lo puede leer cualquiera.', 10),
  ('Seguridad', 'Las claves y secretos van solo en los secretos del servidor (Supabase, Netlify), nunca en el programa.', 'El programa que llega al navegador se puede leer entero.', 20),
  ('Seguridad', 'Toda tabla nueva lleva permisos en la base de datos (RLS) desde el primer día.', 'La protección real está en la base de datos, no en la pantalla: si no, se llega a los datos sin pasar por el programa.', 30),
  ('Seguridad', 'Ninguna función que cambie datos se puede usar sin haber entrado, salvo las imprescindibles (entrada, bloqueo de claves, «¿Has olvidado la clave?»).', 'Lo que se puede llamar sin sesión lo puede llamar cualquiera desde internet.', 40),
  ('Auditoría', 'Toda tabla con datos de negocio lleva su registro de auditoría.', 'Si una tabla no se audita, lo que pase en ella no deja rastro.', 10),
  ('Auditoría', 'Nadie, ni la gerencia ni el programador, se libra de la auditoría. Nada puede desactivarla, borrarla ni modificarla.', 'Es la garantía de que lo que pasa en el programa queda registrado tal cual.', 20),
  ('Auditoría', 'Las cargas masivas (por ejemplo desde GeminisWin) se hacen por el servidor y quedan identificadas como tales.', 'Para no llenar la auditoría de apuntes sin dueño y saber de dónde vino cada dato.', 30),
  ('Base de datos', 'Ningún cambio de estructura sin migración guardada en el repositorio.', 'Para saber qué cambió, cuándo y poder rehacerlo.', 10),
  ('Base de datos', 'Las pruebas se hacen con datos de prueba (tienda 01, almacén 98, códigos ZZTEST o PRUEBA) y se deshacen al terminar.', 'Para no mezclar pruebas con datos reales ni dejar basura.', 20),
  ('Base de datos', 'Los protocolos de control (super administradores, avisos, gerencia, doble firma, teletrabajo y estas condiciones) solo cambian con un Acuerdo de Dirección.', 'Para que nadie cambie las reglas que le controlan.', 30),
  ('Pantallas', 'Toda pantalla nueva o cambiada lleva su Operativa (cómo se usa, en pocas líneas).', 'Sirve de manual para quien la use.', 10),
  ('Pantallas', 'Todo mensaje que impide hacer algo dice también cómo hacerlo bien.', 'Para que el usuario sepa el camino correcto y no busque atajos.', 20),
  ('Pantallas', 'Textos en español sencillo, sin tecnicismos, y fechas e importes en formato español.', 'El programa lo usan personas de tienda, no programadores.', 30),
  ('Publicación', 'Se publica en el ERP solo cuando lo pide Luis, juntando cambios.', 'Cada publicación cuesta dinero en Netlify y puede afectar a quien está trabajando.', 10),
  ('Publicación', 'Antes de publicar: el programa compila y lo nuevo se ha probado.', 'Para no romper lo que funciona.', 20),
  ('Coordinación', 'Antes y después de cada trabajo, nota en el tablón de coordinación; lo pendiente de las personas, como tarea en el Registro de incidencias.', 'Para que Luis, Rober, los Claude y Cowork sepan qué ha hecho cada uno.', 10),
  ('Coordinación', 'No se tocan ficheros ni tablas de otro sin avisar, y los datos de CONTANET y GeminisWin nunca van al repositorio.', 'Para no pisar el trabajo de otro ni filtrar datos reales.', 20);
  perform set_config('erp.por_acuerdo', '', true);
end $$;

-- Acuerdos: nuevo cambio permitido «condicion» (alta, cambio o baja de una Condición de Programación).
create or replace function public.fn_acuerdo_validar(p_tipo text, p_cambios jsonb)
returns void language plpgsql stable security definer set search_path = public as $$
declare c jsonb; v_acc text; v_emp text;
begin
  if jsonb_typeof(coalesce(p_cambios, '[]')) <> 'array' then raise exception 'Cambios no válidos.'; end if;
  for c in select * from jsonb_array_elements(coalesce(p_cambios, '[]')) loop
    v_acc := c ->> 'accion';
    v_emp := c ->> 'empleado';
    if v_acc not in ('super_administrador', 'avisos_grupos', 'gerencia', 'parametro', 'acuerdos_abiertos', 'condicion') then
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
    if v_acc = 'condicion' then
      if c ->> 'operacion' not in ('alta', 'cambio', 'baja') then raise exception 'Condición: elige alta, cambio o baja.'; end if;
      if c ->> 'operacion' in ('cambio', 'baja') and not exists (select 1 from condicion_programacion where id = (c ->> 'id')::bigint) then
        raise exception 'Condición: no existe la condición que quieres cambiar o dar de baja.';
      end if;
      if c ->> 'operacion' in ('alta', 'cambio') and (length(btrim(coalesce(c ->> 'regla', ''))) < 10 or length(btrim(coalesce(c ->> 'apartado', ''))) < 3) then
        raise exception 'Condición: escribe el apartado y la regla.';
      end if;
      if c ->> 'operacion' = 'baja' and exists (select 1 from condicion_programacion where id = (c ->> 'id')::bigint and apartado ilike 'auditor%') then
        raise exception 'Las condiciones de la auditoría no se dan de baja: nadie se libra de la auditoría.';
      end if;
    end if;
  end loop;
end $$;

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
      when 'condicion' then
        if c ->> 'operacion' = 'alta' then
          insert into condicion_programacion (apartado, regla, porque, orden, acuerdo_id)
          values (btrim(c ->> 'apartado'), btrim(c ->> 'regla'), nullif(btrim(coalesce(c ->> 'porque', '')), ''), coalesce((c ->> 'orden')::int, 100), p_id);
        elsif c ->> 'operacion' = 'cambio' then
          update condicion_programacion set apartado = btrim(c ->> 'apartado'), regla = btrim(c ->> 'regla'),
                 porque = nullif(btrim(coalesce(c ->> 'porque', '')), ''), acuerdo_id = p_id where id = (c ->> 'id')::bigint;
        else
          update condicion_programacion set activa = false, acuerdo_id = p_id where id = (c ->> 'id')::bigint;
        end if;
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
revoke execute on function public.fn_acuerdo_aplicar(bigint), public.fn_acuerdo_validar(text, jsonb) from public, anon, authenticated;

-- Semáforo de cumplimiento (solo super administradores).
create or replace function public.fn_condiciones_cumplimiento()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb := '[]'; r jsonb; v_sin_aud text[]; v_sin_rls text[]; v_anon int; v_anon_lista text[]; v_sello timestamptz; v_asientos jsonb;
begin
  if not fn_es_super_administrador() then raise exception 'Solo para super administradores.'; end if;

  r := fn_auditoria_comprobar_integridad();
  v := v || jsonb_build_object('punto', 'Integridad de la auditoría', 'estado', case when (r ->> 'correcto')::boolean then 'verde' else 'rojo' end,
         'detalle', case when (r ->> 'correcto')::boolean then 'Nadie la ha tocado por fuera del programa.' else 'La auditoría se ha tocado por fuera: ver Archivo → Auditoría → Comprobar integridad.' end);

  select max(creado_en) into v_sello from auditoria_sello;
  v := v || jsonb_build_object('punto', 'Sellos de la auditoría al día', 'estado', case when v_sello > now() - interval '2 hours' then 'verde' when v_sello > now() - interval '1 day' then 'ambar' else 'rojo' end,
         'detalle', 'Último sello: ' || coalesce(to_char(v_sello at time zone 'Atlantic/Canary', 'DD/MM/YYYY HH24:MI'), 'ninguno') || ' (se sella cada hora).');

  v_asientos := fn_contab_comprobar_integridad();
  v := v || jsonb_build_object('punto', 'Integridad de los asientos', 'estado', case when (v_asientos ->> 'correcto')::boolean then 'verde' else 'rojo' end,
         'detalle', (v_asientos ->> 'revisados') || ' asientos revisados' || case when (v_asientos ->> 'correcto')::boolean then ', ninguno tocado.' else ': hay problemas (Contabilidad → Control y Firmas → Integridad).' end);

  select coalesce(array_agg(c.relname order by c.relname), '{}') into v_sin_aud
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relname not like 'carga%' and c.relname not like 'auditoria%'
     and c.relname not in ('asiento_huella', 'acuerdo_adjunto', 'clave_codigo', 'correo_pendiente', 'uso_actividad')
     and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname like 'trg_auditoria%' and t.tgenabled <> 'D');
  v := v || jsonb_build_object('punto', 'Tablas con registro de auditoría', 'estado', case when cardinality(v_sin_aud) = 0 then 'verde' when cardinality(v_sin_aud) <= 5 then 'ambar' else 'rojo' end,
         'detalle', case when cardinality(v_sin_aud) = 0 then 'Todas las tablas de negocio se auditan.' else cardinality(v_sin_aud) || ' sin auditoría: ' || array_to_string(v_sin_aud[1:15], ', ') || case when cardinality(v_sin_aud) > 15 then '…' else '' end end);

  select coalesce(array_agg(c.relname order by c.relname), '{}') into v_sin_rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  v := v || jsonb_build_object('punto', 'Tablas protegidas en la base de datos (RLS)', 'estado', case when cardinality(v_sin_rls) = 0 then 'verde' else 'rojo' end,
         'detalle', case when cardinality(v_sin_rls) = 0 then 'Todas las tablas tienen permisos en la base de datos.' else cardinality(v_sin_rls) || ' sin protección: ' || array_to_string(v_sin_rls[1:15], ', ') end);

  select count(*), coalesce(array_agg(p.proname order by p.proname), '{}') into v_anon, v_anon_lista
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'execute');
  v := v || jsonb_build_object('punto', 'Funciones que se pueden usar sin haber entrado', 'estado', case when v_anon <= 5 then 'verde' when v_anon <= 15 then 'ambar' else 'rojo' end,
         'detalle', v_anon || ' funciones. Deben quedar solo las imprescindibles (entrada, bloqueo de claves, «¿Has olvidado la clave?»). Tarea 26.');

  v := v || jsonb_build_object('punto', 'Copias de seguridad automáticas', 'estado', 'gris', 'detalle', 'Se comprueba a mano en Supabase (plan contratado y copias diarias). Tarea 24.');
  v := v || jsonb_build_object('punto', 'Protección de contraseñas filtradas', 'estado', 'gris', 'detalle', 'Se comprueba a mano en Supabase → Authentication. Tarea 25.');
  v := v || jsonb_build_object('punto', 'Aplicaciones fuera del ERP (Finanzas, Alquileres, Vacaciones, Fichaje)', 'estado', 'gris', 'detalle', 'Según la auditoría de agosto, sus datos se podían leer sin clave. Tarea 23.');

  return jsonb_build_object('comprobado_en', now(), 'puntos', v);
end $$;
revoke execute on function public.fn_condiciones_cumplimiento() from public, anon;
grant execute on function public.fn_condiciones_cumplimiento() to authenticated;
