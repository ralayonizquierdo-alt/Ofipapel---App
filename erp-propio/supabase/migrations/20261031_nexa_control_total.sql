-- NEXA con control total (31/10/2026, decisión de Rober): NEXA puede leer, escribir y razonar
-- sobre todos los datos y funciones del ERP, actuales y futuras, SIEMPRE con la identidad y los
-- permisos del usuario que le habla (su JWT: RLS, políticas de §7 de SEGURIDAD_BD.md, fn_puede).
--
-- Cómo escribe (nunca directamente):
--   1. proponer: fn_nexa_proponer(resumen, pasos) SIMULA los pasos con los permisos del usuario
--      dentro de un subbloque que se deshace siempre (nada queda escrito), recoge de la auditoría
--      TODO lo que cambiaría (también lo que hacen los triggers: stock, deuda…), calcula el nivel
--      1-5 y guarda la propuesta en nexa_propuesta (caduca a los 10 minutos).
--   2. confirmar: lo comprueba la Edge Function «nexa» con el último mensaje del usuario (sí,
--      palabra, motivo; nivel 5: contraseña verificada con Supabase Auth y solo administradores)
--      y firma la propuesta (HMAC con un secreto que solo conocen la función y la base).
--   3. ejecutar: fn_nexa_ejecutar(id, firma, motivo) solo ejecuta una propuesta del mismo usuario,
--      pendiente, sin caducar y con la firma buena; repite los mismos pasos (otra vez con sus
--      permisos), comprueba que el cambio real no es mayor que el propuesto y deja la marca
--      «NEXA · nivel N · propuesta P · motivo» en auditoria.origen de cada fila tocada.
--
-- Pasos (jsonb, array de 1 a 20, en una sola transacción):
--   {"tipo":"tabla","tabla":"cliente","accion":"modificar","filtro":{"codigo":"ZZ001"},"valores":{"observaciones":"…"}}
--   {"tipo":"tabla","tabla":"pedido_cliente","accion":"alta","valores":{…}}   (accion: alta | modificar | borrar)
--   {"tipo":"funcion","funcion":"fn_cobro_cliente_cobrar","argumentos":{"p":{…}}}
--   Filtro: igualdad por columna (AND); null = «es nulo»; una lista [a,b] = «en». Un valor "$pasoN" o
--   "$pasoN.columna" toma el resultado de un paso anterior (p. ej. el número de fn_siguiente_numero).
--
-- Nivel (fn_nexa_nivel): el del catálogo nexa_operacion si la operación está; si no, el prudente:
--   tabla de negocio (tiene políticas permiso_*): alta 3, modificar 2 (1 fila, ≤2 campos sin
--   importes) o 3; tablas de dinero/stock 4; configuración/seguridad/VeriFactu (sin políticas
--   permiso_*) 5; borrado físico 5. Función: de solo lectura 1, que cambia datos 4, de anular/
--   rectificar/VeriFactu/permisos/usuarios 5. Más de 20 filas afectadas: 4 como mínimo.
--
-- NORMA: al crear una función o tabla nueva del ERP, añadirla a nexa_operacion con su nivel (si
-- no, NEXA la trata con el nivel prudente de arriba).
--
-- El secreto de la firma NO está en este fichero: lo deriva la Edge Function de su clave de
-- servicio y lo registra en nexa_privado.secreto (esquema sin acceso para la API), ver el final.

-- ---------------------------------------------------------------- Catálogo de operaciones

create table if not exists public.nexa_operacion (
  codigo text primary key,
  descripcion text not null,
  tipo text not null check (tipo in ('tabla', 'funcion')),
  objeto text not null,
  accion text not null default '*' check (accion in ('*', 'alta', 'modificar', 'borrar')),
  nivel smallint not null check (nivel between 1 and 5),
  permiso text,
  bloqueada boolean not null default false,
  notas text,
  receta text,
  actualizado_en timestamptz not null default now()
);
comment on table public.nexa_operacion is 'Catálogo de operaciones de NEXA: nivel de confirmación (1-5), permiso requerido y bloqueos. objeto admite patrones LIKE (%). Al crear una función/tabla nueva, añadirla aquí.';
comment on column public.nexa_operacion.objeto is 'Tabla o función (public). Admite % como patrón (p. ej. fn_contab_%).';
comment on column public.nexa_operacion.permiso is 'Código de permiso (ruta) que además debe tener el usuario (fn_puede). Null: valen las políticas y comprobaciones propias de la tabla/función.';

alter table public.nexa_operacion enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'nexa_operacion' and policyname = 'nexa_operacion_lee') then
    create policy nexa_operacion_lee on public.nexa_operacion for select to authenticated using (true);
    create policy nexa_operacion_alta on public.nexa_operacion for insert to authenticated with check (public.fn_es_administrador());
    create policy nexa_operacion_modifica on public.nexa_operacion for update to authenticated using (public.fn_es_administrador()) with check (public.fn_es_administrador());
  end if;
end $$;

insert into public.nexa_operacion (codigo, descripcion, tipo, objeto, accion, nivel, permiso, bloqueada, notas) values
  -- Bloqueadas: NEXA no las toca nunca
  ('tabla:auditoria%', 'Auditoría (inmutable)', 'tabla', 'auditoria%', '*', 5, null, true, 'Solo la escribe el trigger de auditoría.'),
  ('tabla:registro_facturacion', 'Registros VeriFactu (inmutables)', 'tabla', 'registro_facturacion', '*', 5, null, true, 'Nunca se borran ni modifican: solo anulación/rectificación por sus funciones.'),
  ('tabla:nexa_%', 'Tablas internas de NEXA', 'tabla', 'nexa_%', '*', 5, null, true, null),
  ('tabla:coordinacion_notas', 'Notas de coordinación entre sesiones', 'tabla', 'coordinacion_notas', '*', 5, null, true, null),
  ('tabla:carga_dbf', 'Carga de GeminisWin', 'tabla', 'carga_dbf', '*', 5, null, true, null),
  ('tabla:listado_uso', 'Usos de listados (los apunta el Generador)', 'tabla', 'listado_uso', '*', 5, null, true, null),
  ('tabla:asiento', 'Contabilidad (plan aparte)', 'tabla', 'asiento%', '*', 5, null, true, 'Contabilidad tiene plan de seguridad aparte: por ahora NEXA no escribe en ella.'),
  ('tabla:apunte', 'Contabilidad (plan aparte)', 'tabla', 'apunte', '*', 5, null, true, null),
  ('tabla:cuenta_contable', 'Contabilidad (plan aparte)', 'tabla', 'cuenta_contable', '*', 5, null, true, null),
  ('tabla:extracto_%', 'Contabilidad (plan aparte)', 'tabla', 'extracto_%', '*', 5, null, true, null),
  ('tabla:configuracion_contable%', 'Contabilidad (plan aparte)', 'tabla', 'configuracion_contable%', '*', 5, null, true, null),
  ('funcion:fn_contab_%', 'Contabilidad (plan aparte)', 'funcion', 'fn_contab_%', '*', 5, null, true, 'Contabilidad tiene plan de seguridad aparte.'),
  ('funcion:fn_nexa_%', 'Funciones internas de NEXA', 'funcion', 'fn_nexa_%', '*', 5, null, true, null),
  ('funcion:fn_auditoria_%', 'Auditoría (se consulta en su pantalla)', 'funcion', 'fn_auditoria_%', '*', 5, null, true, null),
  ('funcion:fn_carga_%', 'Cargas de GeminisWin (por SQL)', 'funcion', 'fn_carga_%', '*', 5, null, true, null),
  ('funcion:cargar_dbf_lote', 'Carga de GeminisWin', 'funcion', 'cargar_dbf_lote', '*', 5, null, true, null),
  ('funcion:fn_peticion_%', 'Datos internos de la petición', 'funcion', 'fn_peticion_%', '*', 5, null, true, null),
  ('funcion:fn_dar_conformidad', 'Conformidad legal: la da la persona en su pantalla', 'funcion', 'fn_dar_conformidad', '*', 5, null, true, 'Acto personal: no se hace por NEXA.'),
  ('funcion:fn_denegar_conformidad', 'Conformidad legal: la da la persona en su pantalla', 'funcion', 'fn_denegar_conformidad', '*', 5, null, true, null),
  ('funcion:fn_registrar_acceso', 'Registro de entradas al programa', 'funcion', 'fn_registrar_acceso', '*', 5, null, true, null),
  ('funcion:fn_listado_usado', 'Uso de un listado (lo apunta NEXA sola)', 'funcion', 'fn_listado_usado', '*', 5, null, true, null),
  -- Auxiliares
  ('funcion:fn_siguiente_numero', 'Reserva el siguiente número de un documento (va con su alta)', 'funcion', 'fn_siguiente_numero', '*', 2, null, false, null),
  -- Documentos y fichas
  ('tabla:listado_guardado', 'Listados guardados del Generador', 'tabla', 'listado_guardado', '*', 3, '/listados', false, null),
  ('tabla:presupuesto_contacto', 'Contactos de seguimiento de presupuestos', 'tabla', 'presupuesto_contacto', '*', 3, null, false, null),
  ('tabla:presupuesto_correo', 'Correos de presupuestos', 'tabla', 'presupuesto_correo', '*', 3, null, false, null),
  ('funcion:fn_presupuesto_a_pedido', 'Convertir un presupuesto en pedido', 'funcion', 'fn_presupuesto_a_pedido', '*', 3, null, false, null),
  ('funcion:fn_cobro_generar_vencimientos', 'Generar los vencimientos de una factura', 'funcion', 'fn_cobro_generar_vencimientos', '*', 3, null, false, null),
  ('funcion:fn_punto_restauracion_crear', 'Crear un punto de restauración de stock', 'funcion', 'fn_punto_restauracion_crear', '*', 3, null, false, null),
  ('funcion:fn_articulos_alta_rapida', 'Alta rápida de artículos', 'funcion', 'fn_articulos_alta_rapida', '*', 3, null, false, 'Con muchas filas sube a 4.'),
  ('funcion:fn_listados_vendedor', 'Listados de un vendedor', 'funcion', 'fn_listados_vendedor', '*', 3, null, false, null),
  -- Dinero, stock y en bloque (4)
  ('funcion:fn_cobro_%', 'Cobros de clientes', 'funcion', 'fn_cobro_%', '*', 4, null, false, null),
  ('funcion:fn_caja_abrir', 'Apertura de caja', 'funcion', 'fn_caja_abrir', '*', 4, null, false, null),
  ('funcion:fn_caja_cerrar', 'Cierre de caja', 'funcion', 'fn_caja_cerrar', '*', 4, null, false, null),
  ('funcion:fn_caja_entrada_salida', 'Entrada o salida de caja', 'funcion', 'fn_caja_entrada_salida', '*', 4, null, false, null),
  ('funcion:fn_facturar_albaranes', 'Facturar albaranes', 'funcion', 'fn_facturar_albaranes', '*', 4, null, false, null),
  ('funcion:fn_verifactu_emitir_venta', 'Emitir una venta en VeriFactu', 'funcion', 'fn_verifactu_emitir_venta', '*', 4, null, false, null),
  ('funcion:fn_articulos_bloque', 'Modificación de artículos en bloque', 'funcion', 'fn_articulos_bloque', '*', 4, null, false, null),
  ('funcion:fn_modificacion_articulos_aplicar', 'Aplicar una modificación de artículos (precios en bloque)', 'funcion', 'fn_modificacion_articulos_aplicar', '*', 4, null, false, null),
  ('funcion:fn_articulos_eliminacion_baja', 'Baja de artículos en bloque', 'funcion', 'fn_articulos_eliminacion_baja', '*', 4, null, false, null),
  ('funcion:fn_articulos_en_blanco_baja', 'Baja de artículos en blanco', 'funcion', 'fn_articulos_en_blanco_baja', '*', 4, null, false, null),
  ('funcion:fn_stock_cero_familia_aplicar', 'Poner a cero el stock de una familia', 'funcion', 'fn_stock_cero_familia_aplicar', '*', 4, null, false, null),
  ('funcion:fn_recalcular_stock_aplicar', 'Recalcular stock', 'funcion', 'fn_recalcular_stock_aplicar', '*', 4, null, false, null),
  ('funcion:fn_punto_restauracion_restaurar', 'Restaurar un punto de restauración de stock', 'funcion', 'fn_punto_restauracion_restaurar', '*', 4, null, false, null),
  ('funcion:fn_lote_movimiento', 'Movimiento de lote', 'funcion', 'fn_lote_movimiento', '*', 4, null, false, null),
  ('funcion:fn_liquidacion_comisiones_%', 'Liquidación de comisiones', 'funcion', 'fn_liquidacion_comisiones_%', '*', 4, null, false, null),
  ('funcion:fn_cliente_recalcular_deuda%', 'Recalcular la deuda de clientes', 'funcion', 'fn_cliente_recalcular_deuda%', '*', 4, null, false, null),
  ('tabla:regularizacion_stock', 'Regularización de stock', 'tabla', 'regularizacion_stock', '*', 4, null, false, null),
  ('tabla:movimiento_stock', 'Movimientos de stock', 'tabla', 'movimiento_stock', '*', 4, null, false, null),
  ('tabla:articulo_almacen_stock', 'Stock por almacén', 'tabla', 'articulo_almacen_stock', '*', 4, null, false, null),
  -- Críticas o legales (5)
  ('funcion:fn_anular_factura_cliente', 'Anular una factura de cliente (VeriFactu)', 'funcion', 'fn_anular_factura_cliente', '*', 5, null, false, null),
  ('funcion:fn_rectificar_factura_cliente', 'Rectificar una factura de cliente (VeriFactu)', 'funcion', 'fn_rectificar_factura_cliente', '*', 5, null, false, null),
  ('funcion:fn_verifactu_anular_factura', 'Anular una factura en VeriFactu', 'funcion', 'fn_verifactu_anular_factura', '*', 5, null, false, null),
  ('funcion:fn_verifactu_anular_venta', 'Anular una venta en VeriFactu', 'funcion', 'fn_verifactu_anular_venta', '*', 5, null, false, null),
  ('funcion:fn_ajustar_contador', 'Ajustar un contador de numeración', 'funcion', 'fn_ajustar_contador', '*', 5, null, false, null),
  ('funcion:fn_ejercicio_activar', 'Activar un ejercicio', 'funcion', 'fn_ejercicio_activar', '*', 5, null, false, null),
  ('funcion:fn_conformidad_obligatoria', 'Obligar a dar conformidad', 'funcion', 'fn_conformidad_obligatoria', '*', 5, null, false, null),
  ('tabla:rol', 'Grupos de acceso', 'tabla', 'rol', '*', 5, null, false, null),
  ('tabla:rol_permiso', 'Permisos de los grupos', 'tabla', 'rol_permiso', '*', 5, null, false, null),
  ('tabla:permiso', 'Catálogo de permisos', 'tabla', 'permiso', '*', 5, null, false, null),
  ('tabla:empleado', 'Empleados y usuarios', 'tabla', 'empleado%', '*', 5, null, false, null)
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------- Propuestas

create table if not exists public.nexa_propuesta (
  id bigint generated always as identity primary key,
  usuario_id uuid not null default auth.uid(),
  empleado_codigo text,
  creado_en timestamptz not null default now(),
  caduca_en timestamptz not null default now() + interval '10 minutes',
  resumen text not null,
  pasos jsonb not null,
  nivel smallint not null check (nivel between 1 and 5),
  palabra text,
  filas integer,
  vista_previa jsonb,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'ejecutando', 'ejecutada', 'cancelada')),
  ejecutada_en timestamptz,
  motivo text,
  confirmacion jsonb,
  resultado jsonb
);
comment on table public.nexa_propuesta is 'Cambios que NEXA ha preparado (simulados) y espera que el usuario confirme. Cada usuario solo ve las suyas; solo cambian de estado por fn_nexa_ejecutar (firmada) o fn_nexa_propuesta_cancelar.';
create index if not exists nexa_propuesta_usuario on public.nexa_propuesta (usuario_id, creado_en desc);

alter table public.nexa_propuesta enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'nexa_propuesta' and policyname = 'nexa_propuesta_lee_suyas') then
    create policy nexa_propuesta_lee_suyas on public.nexa_propuesta for select to authenticated using (usuario_id = auth.uid());
    create policy nexa_propuesta_alta_suyas on public.nexa_propuesta for insert to authenticated with check (usuario_id = auth.uid() and estado = 'pendiente');
  end if;
end $$;
revoke update, delete, truncate on public.nexa_propuesta from anon, authenticated;

-- Secreto de la firma: esquema sin acceso para la API.
create schema if not exists nexa_privado;
revoke all on schema nexa_privado from public, anon, authenticated;
create table if not exists nexa_privado.secreto (id smallint primary key default 1 check (id = 1), clave text not null);
revoke all on nexa_privado.secreto from public, anon, authenticated;

-- ---------------------------------------------------------------- Auxiliares

-- Origen de la auditoría: si el cambio lo hace NEXA, «NEXA · nivel N · propuesta P · motivo».
create or replace function public.fn_peticion_origen()
returns text
language sql
stable
as $$ select coalesce(nullif(current_setting('erp.nexa_origen', true), ''),
                      case when auth.uid() is null then coalesce(nullif(current_setting('erp.origen', true), ''), 'Sistema') end) $$;

/** Quita de lo que se enseña claves, hashes y tokens. */
create or replace function public.fn_nexa_ocultar(p jsonb)
returns jsonb
language plpgsql
immutable
as $$
begin
  return case jsonb_typeof(p)
    when 'object' then (select coalesce(jsonb_object_agg(k, case when k ~* '(contrasena|password|hash|token|secret|clave_api|firma_electronica)' then to_jsonb('***'::text) else public.fn_nexa_ocultar(v) end), '{}'::jsonb) from jsonb_each(p) e(k, v))
    when 'array' then (select coalesce(jsonb_agg(public.fn_nexa_ocultar(v) order by o), '[]'::jsonb) from jsonb_array_elements(p) with ordinality e(v, o))
    else p end;
end;
$$;

/** Sustituye "$pasoN" / "$pasoN.columna" por el resultado principal del paso N. */
create or replace function public.fn_nexa_resolver(v jsonb, r jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  m text[];
  x jsonb;
begin
  case jsonb_typeof(v)
    when 'object' then
      return (select coalesce(jsonb_object_agg(k, public.fn_nexa_resolver(val, r)), '{}'::jsonb) from jsonb_each(v) e(k, val));
    when 'array' then
      return (select coalesce(jsonb_agg(public.fn_nexa_resolver(val, r) order by o), '[]'::jsonb) from jsonb_array_elements(v) with ordinality e(val, o));
    when 'string' then
      m := regexp_match(v #>> '{}', '^\$paso([0-9]+)(?:\.([a-z_0-9]+))?$');
      if m is null then return v; end if;
      if m[1]::int < 1 or m[1]::int > jsonb_array_length(r) then
        raise exception 'La referencia % apunta a un paso que no existe o que va después.', v #>> '{}';
      end if;
      x := r -> (m[1]::int - 1);
      if jsonb_typeof(x) = 'array' then x := x -> 0; end if;
      if m[2] is not null then x := x -> m[2]; end if;
      if x is null then raise exception 'La referencia % no tiene valor.', v #>> '{}'; end if;
      return x;
    else
      return v;
  end case;
end;
$$;

/** Clase de una tabla para el nivel: dinero (dinero o stock), negocio (políticas permiso_* de §7) o config. */
create or replace function public.fn_nexa_tabla_clase(p_tabla text)
returns text
language sql
stable
as $$
  select case
    when p_tabla = any (array['venta', 'venta_linea', 'factura', 'factura_impuesto_tramo', 'cobro_cliente', 'movimiento_caja',
                              'caja_apertura_cierre', 'caja_apertura_cierre_categoria', 'pago_proveedor', 'factura_proveedor',
                              'movimiento_stock', 'articulo_almacen_stock', 'regularizacion_stock', 'traspaso_almacen',
                              'traspaso_almacen_linea', 'inventario', 'inventario_linea', 'liquidacion_comision',
                              'liquidacion_comision_documento', 'apertura_cajon', 'articulo_lote', 'articulo_lote_movimiento']) then 'dinero'
    when exists (select 1 from pg_policies where schemaname = 'public' and tablename = p_tabla and policyname like 'permiso\_%') then 'negocio'
    else 'config'
  end
$$;

/** Entrada del catálogo que mejor encaja (la exacta antes que el patrón). */
create or replace function public.fn_nexa_catalogo(p_tipo text, p_objeto text, p_accion text)
returns public.nexa_operacion
language sql
stable
as $$
  select o.* from public.nexa_operacion o
   where o.tipo = p_tipo and p_objeto like o.objeto and (o.accion = '*' or o.accion = p_accion)
   order by (o.objeto = p_objeto) desc, (o.accion <> '*') desc, length(o.objeto) desc
   limit 1
$$;

/** Nivel de UN paso. p_filas: filas afectadas (null = aún no se sabe). Error si está bloqueado. */
create or replace function public.fn_nexa_nivel_paso(p jsonb, p_filas integer default null)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_tipo text := p ->> 'tipo';
  v_obj text;
  v_acc text := coalesce(p ->> 'accion', '*');
  c public.nexa_operacion;
  v_nivel int;
  v_por text;
  v_clase text;
  v_campos text[];
  v_sensible boolean;
  v_vol "char";
begin
  if v_tipo = 'tabla' then
    v_obj := p ->> 'tabla';
    if v_acc not in ('alta', 'modificar', 'borrar') then raise exception 'Acción no válida «%» (alta, modificar o borrar).', v_acc; end if;
  elsif v_tipo = 'funcion' then
    v_obj := p ->> 'funcion';
    v_acc := '*';
  else
    raise exception 'Cada paso debe ser de tipo «tabla» o «funcion».';
  end if;
  if v_obj is null or v_obj !~ '^[a-z_][a-z0-9_]{0,62}$' then raise exception 'Nombre de % no válido: %', v_tipo, coalesce(v_obj, '(vacío)'); end if;

  c := public.fn_nexa_catalogo(v_tipo, v_obj, v_acc);
  if c.codigo is not null and c.bloqueada then
    raise exception 'NEXA no puede hacer eso: % (%).', c.descripcion, coalesce(c.notas, 'operación bloqueada en el catálogo') using errcode = '42501';
  end if;
  if c.codigo is not null and c.permiso is not null and not public.fn_puede(c.permiso) then
    raise exception 'No tienes permiso para «%» (hace falta la opción %).', c.descripcion, c.permiso using errcode = '42501';
  end if;

  if v_tipo = 'tabla' then
    if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = v_obj) then
      raise exception 'No existe la tabla %.', v_obj;
    end if;
    v_clase := public.fn_nexa_tabla_clase(v_obj);
    select array_agg(k) into v_campos from jsonb_object_keys(coalesce(p -> 'valores', '{}'::jsonb)) k;
    v_sensible := exists (select 1 from unnest(coalesce(v_campos, '{}')) k
                           where k ~ '(pvp|precio|coste|costo|tarifa|descuento|dto|importe|total|base|cuota|igic|cantidad|stock|baja|activo|anulad|codigo|cliente_codigo|proveedor_codigo|forma_pago|credito|riesgo|deuda|saldo)');
    if c.codigo is not null then
      v_nivel := c.nivel; v_por := 'catálogo: ' || c.descripcion;
    elsif v_acc = 'borrar' then
      v_nivel := 5; v_por := 'borrado físico';
    elsif v_clase = 'config' then
      v_nivel := 5; v_por := 'tabla de configuración, seguridad o VeriFactu';
    elsif v_clase = 'dinero' then
      v_nivel := 4; v_por := 'tabla de dinero o stock';
    elsif v_acc = 'alta' then
      v_nivel := 3; v_por := 'alta en tabla de negocio';
    elsif coalesce(p_filas, 1) = 1 and coalesce(array_length(v_campos, 1), 0) <= 2 and not v_sensible then
      v_nivel := 2; v_por := 'cambio leve de una ficha';
    else
      v_nivel := 3; v_por := 'modificación en tabla de negocio';
    end if;
    if v_sensible and coalesce(p_filas, 1) > 1 and v_nivel < 4 then v_nivel := 4; v_por := v_por || '; importes/estado en varias filas'; end if;
  else
    select p2.provolatile into v_vol from pg_proc p2 join pg_namespace n on n.oid = p2.pronamespace
     where n.nspname = 'public' and p2.proname = v_obj and p2.prokind = 'f' order by p2.oid limit 1;
    if not found then raise exception 'No existe la función %. Usa describir_funciones.', v_obj; end if;
    if c.codigo is not null then
      v_nivel := c.nivel; v_por := 'catálogo: ' || c.descripcion;
    elsif v_vol in ('s', 'i') then
      v_nivel := 1; v_por := 'función de solo lectura';
    elsif v_obj ~ '(anular|rectific|verifactu|permiso|grupo|_rol|empleado|usuario|borra|elimin|contador|ejercicio|conformidad|periodo)' then
      v_nivel := 5; v_por := 'función crítica o legal (sin catalogar)';
    else
      v_nivel := 4; v_por := 'función que cambia datos (sin catalogar)';
    end if;
  end if;
  if coalesce(p_filas, 0) > 20 and v_nivel < 4 then v_nivel := 4; v_por := v_por || '; masivo (más de 20 filas)'; end if;
  return jsonb_strip_nulls(jsonb_build_object('nivel', v_nivel, 'por', v_por, 'objeto', v_obj, 'catalogada', c.codigo is not null, 'receta', c.receta));
end;
$$;

/** Nivel de una propuesta: el mayor de sus pasos y de lo que cambia de verdad (cambios de la auditoría). */
create or replace function public.fn_nexa_nivel(p_pasos jsonb, p_resultados jsonb default null, p_cambios jsonb default null)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_nivel int := 1;
  v_motivos jsonb := '[]'::jsonb;
  r jsonb;
  i int := 0;
  p jsonb;
  v_total int := coalesce((p_cambios ->> 'total')::int, 0);
begin
  if jsonb_typeof(p_pasos) <> 'array' or jsonb_array_length(p_pasos) = 0 then raise exception 'Faltan los pasos del cambio.'; end if;
  if jsonb_array_length(p_pasos) > 20 then raise exception 'Como mucho 20 pasos por cambio.'; end if;
  for p in select e from jsonb_array_elements(p_pasos) e loop
    r := public.fn_nexa_nivel_paso(p, nullif((p_resultados -> i ->> 'filas'), '')::int);
    v_nivel := greatest(v_nivel, (r ->> 'nivel')::int);
    v_motivos := v_motivos || jsonb_build_array(r);
    i := i + 1;
  end loop;
  if v_total > 0 and v_nivel < 2 then v_nivel := 2; v_motivos := v_motivos || jsonb_build_array(jsonb_build_object('nivel', 2, 'por', 'cambia datos')); end if;
  if v_total > 20 and v_nivel < 4 then v_nivel := 4; v_motivos := v_motivos || jsonb_build_array(jsonb_build_object('nivel', 4, 'por', format('masivo: %s registros', v_total))); end if;
  if v_nivel < 4 and exists (select 1 from jsonb_array_elements(coalesce(p_cambios -> 'por_tabla', '[]'::jsonb)) t
                              where public.fn_nexa_tabla_clase(t ->> 'tabla') = 'dinero') then
    v_nivel := 4; v_motivos := v_motivos || jsonb_build_array(jsonb_build_object('nivel', 4, 'por', 'mueve dinero o stock'));
  end if;
  return jsonb_build_object('nivel', v_nivel, 'motivos', v_motivos);
end;
$$;

/** Último id de la auditoría (para recoger después lo que ha cambiado esta transacción). */
create or replace function public.fn_nexa_auditoria_ultimo()
returns bigint
language sql
stable
security definer
set search_path = public
as $$ select coalesce(max(id), 0) from auditoria $$;

/** Lo que ESTA transacción del usuario ha cambiado (filas de auditoría propias, de este instante). */
create or replace function public.fn_nexa_cambios(p_desde bigint)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with a as (
    select id, tabla, operacion, registro_pk, registro_nombre, campos, datos_antes, datos_despues
      from auditoria
     where id > p_desde and usuario_id = auth.uid() and ocurrido_en = now()
  )
  select jsonb_build_object(
    'total', (select count(*) from a),
    'por_tabla', (select coalesce(jsonb_agg(jsonb_build_object('tabla', tabla, 'operacion', operacion, 'filas', n) order by tabla, operacion), '[]'::jsonb)
                    from (select tabla, operacion, count(*) n from a group by 1, 2) t),
    'detalle', (select coalesce(jsonb_agg(public.fn_nexa_ocultar(jsonb_build_object(
                    'tabla', tabla, 'operacion', operacion, 'pk', registro_pk, 'nombre', registro_nombre, 'campos', campos,
                    'antes', datos_antes, 'despues', datos_despues)) order by id), '[]'::jsonb)
                  from (select * from a order by id limit 200) d))
$$;

-- ---------------------------------------------------------------- Ejecutar pasos (con los permisos del usuario)

create or replace function public.fn_nexa_paso_tabla(p jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  t text := p ->> 'tabla';
  acc text := p ->> 'accion';
  f jsonb := coalesce(p -> 'filtro', '{}'::jsonb);
  v jsonb := coalesce(p -> 'valores', '{}'::jsonb);
  fs jsonb;
  cols text[];
  pk text[];
  k text;
  cond text := '';
  ic text;
  sc text;
  sets text;
  pkexpr text;
  n int;
  regs jsonb;
begin
  if jsonb_typeof(f) <> 'object' or jsonb_typeof(v) <> 'object' then raise exception 'filtro y valores deben ser objetos {columna: valor}.'; end if;
  select array_agg(attname::text) into cols from pg_attribute
   where attrelid = format('public.%I', t)::regclass and attnum > 0 and not attisdropped;
  for k in select jsonb_object_keys(f) union select jsonb_object_keys(v) loop
    if not k = any (cols) then raise exception 'La tabla % no tiene la columna «%». Usa describir_tablas.', t, k; end if;
  end loop;
  select array_agg(a.attname::text order by array_position(i.indkey::int2[], a.attnum)) into pk
    from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
   where i.indrelid = format('public.%I', t)::regclass and i.indisprimary;
  pkexpr := coalesce((select string_agg(format('coalesce(t.%I::text, '''')', c), ' || ''-'' || ') from unnest(pk) c), 'null::text');

  fs := (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(f) where jsonb_typeof(value) <> 'array');
  for k in select jsonb_object_keys(f) loop
    cond := cond || case when cond = '' then '' else ' and ' end ||
      case jsonb_typeof(f -> k)
        when 'null' then format('t.%I is null', k)
        when 'array' then format('t.%I in (select (jsonb_populate_record(null::public.%I, jsonb_build_object(%L, e))).%I from jsonb_array_elements($3 -> %L) e)', k, t, k, k, k)
        else format('t.%I = fl.%I', k, k)
      end;
  end loop;

  if acc = 'alta' then
    if v = '{}'::jsonb then raise exception 'Para dar de alta hacen falta valores.'; end if;
    select string_agg(format('%I', key), ', '), string_agg(format('r.%I', key), ', ') into ic, sc from jsonb_each(v);
    execute format('with x as (insert into public.%I as t (%s) select %s from jsonb_populate_record(null::public.%I, $1) r returning to_jsonb(t.*) d)
                    select count(*)::int, coalesce(jsonb_agg(jsonb_build_object(''antes'', null, ''despues'', d)), ''[]'') from x', t, ic, sc, t)
      using v into n, regs;
  elsif acc = 'modificar' then
    if f = '{}'::jsonb then raise exception 'Para modificar hace falta un filtro (qué registros).'; end if;
    if v = '{}'::jsonb then raise exception 'Para modificar hacen falta los valores nuevos.'; end if;
    select string_agg(format('%I = r.%I', key, key), ', ') into sets from jsonb_each(v);
    execute format('with a as (select %1$s as pk, to_jsonb(t.*) d from public.%2$I t, jsonb_populate_record(null::public.%2$I, $2) fl where %3$s),
                         u as (update public.%2$I t set %4$s from jsonb_populate_record(null::public.%2$I, $1) r, jsonb_populate_record(null::public.%2$I, $2) fl
                                where %3$s returning %1$s as pk, to_jsonb(t.*) d)
                    select count(*)::int, coalesce(jsonb_agg(jsonb_build_object(''antes'', a.d, ''despues'', u.d)), ''[]'') from u left join a on a.pk = u.pk',
                   pkexpr, t, cond, sets)
      using v, fs, f into n, regs;
  elsif acc = 'borrar' then
    if f = '{}'::jsonb then raise exception 'Para borrar hace falta un filtro (qué registros).'; end if;
    execute format('with u as (delete from public.%1$I t using jsonb_populate_record(null::public.%1$I, $2) fl where %2$s returning to_jsonb(t.*) d)
                    select count(*)::int, coalesce(jsonb_agg(jsonb_build_object(''antes'', d, ''despues'', null)), ''[]'') from u', t, cond)
      using v, fs, f into n, regs;
  else
    raise exception 'Acción no válida «%».', acc;
  end if;

  if acc <> 'alta' and n = 0 then
    raise exception 'Ningún registro de % cumple el filtro %: no existe, o tu grupo de acceso no tiene permiso para cambiarlo.', t, f::text using errcode = '42501';
  end if;
  regs := public.fn_nexa_ocultar(regs);
  return jsonb_build_object('tipo', 'tabla', 'tabla', t, 'accion', acc, 'filas', n,
    -- Para enseñar: en una modificación solo la clave y lo que cambia; en un alta, sin los nulos.
    'registros', (select coalesce(jsonb_agg(
        case acc
          when 'modificar' then jsonb_build_object(
            'antes', (select jsonb_object_agg(c, e -> 'antes' -> c) from jsonb_object_keys(e -> 'despues') c
                       where c = any (coalesce(pk, '{}')) or (c <> 'actualizado_en' and (e -> 'antes' -> c) is distinct from (e -> 'despues' -> c))),
            'despues', (select jsonb_object_agg(c, e -> 'despues' -> c) from jsonb_object_keys(e -> 'despues') c
                       where c = any (coalesce(pk, '{}')) or (c <> 'actualizado_en' and (e -> 'antes' -> c) is distinct from (e -> 'despues' -> c))))
          when 'alta' then jsonb_build_object('antes', null, 'despues', jsonb_strip_nulls(e -> 'despues'))
          else jsonb_build_object('antes', jsonb_strip_nulls(e -> 'antes'), 'despues', null)
        end order by o), '[]'::jsonb)
      from jsonb_array_elements(regs) with ordinality x(e, o) where o <= 50),
    'principal', case when acc = 'borrar' then regs -> 0 -> 'antes' else regs -> 0 -> 'despues' end);
end;
$$;

create or replace function public.fn_nexa_paso_funcion(p jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  fname text := p ->> 'funcion';
  args jsonb := coalesce(p -> 'argumentos', '{}'::jsonb);
  pr record;
  elegido record;
  hay boolean := false;
  nombres text[];
  tipos oid[];
  obligatorios int;
  lista text;
  i int;
  ty record;
  expr text;
  res jsonb;
begin
  if jsonb_typeof(args) <> 'object' then raise exception 'argumentos debe ser un objeto {p_nombre: valor}.'; end if;
  for pr in
    select p2.oid, p2.proargnames, p2.proargmodes, p2.proargtypes, p2.pronargs, p2.pronargdefaults, p2.prorettype, p2.proretset
      from pg_proc p2 join pg_namespace n on n.oid = p2.pronamespace
     where n.nspname = 'public' and p2.proname = fname and p2.prokind = 'f' and p2.prorettype <> 'trigger'::regtype
  loop
    -- nombres de los argumentos de entrada, en orden
    nombres := (select array_agg(pr.proargnames[o] order by o) from generate_subscripts(coalesce(pr.proargnames, '{}'::text[]), 1) o
                 where pr.proargmodes is null or pr.proargmodes[o] in ('i', 'b', 'v'));
    obligatorios := pr.pronargs - pr.pronargdefaults;
    if exists (select 1 from jsonb_object_keys(args) k where not k = any (coalesce(nombres, '{}'))) then continue; end if;
    if exists (select 1 from generate_series(1, obligatorios) o where not args ? nombres[o]) then continue; end if;
    elegido := pr;
    hay := true;
    exit;
  end loop;
  if not hay then
    raise exception 'No existe la función % con esos argumentos (%). Usa describir_funciones.', fname, (select string_agg(k, ', ') from jsonb_object_keys(args) k);
  end if;
  if not has_function_privilege(elegido.oid, 'execute') then
    raise exception 'No tienes permiso para ejecutar %.', fname using errcode = '42501';
  end if;

  nombres := (select array_agg(elegido.proargnames[o] order by o) from generate_subscripts(coalesce(elegido.proargnames, '{}'::text[]), 1) o
               where elegido.proargmodes is null or elegido.proargmodes[o] in ('i', 'b', 'v'));
  -- (oidvector empieza en 0: se pasa a un array normal, desde 1)
  tipos := (select array_agg(x order by o) from unnest(elegido.proargtypes::oid[]) with ordinality u(x, o));
  lista := '';
  for i in 1 .. elegido.pronargs loop
    if not args ? nombres[i] then continue; end if;
    select t.oid, t.typtype, t.typcategory, format_type(t.oid, null) as nombre into ty from pg_type t where t.oid = tipos[i];
    expr := case
      when ty.oid in ('jsonb'::regtype, 'json'::regtype) then format('($1 -> %L)::%s', nombres[i], ty.nombre)
      when ty.typcategory = 'A' then format('(select array_agg(e) from jsonb_array_elements_text($1 -> %L) e)::%s', nombres[i], ty.nombre)
      when ty.typtype = 'c' then format('jsonb_populate_record(null::%s, $1 -> %L)', ty.nombre, nombres[i])
      else format('($1 ->> %L)::%s', nombres[i], ty.nombre)
    end;
    lista := lista || case when lista = '' then '' else ', ' end || format('%I => %s', nombres[i], expr);
  end loop;

  if elegido.proretset then
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from (select * from public.%I(%s) limit 500) x', fname, lista) using args into res;
  elsif elegido.prorettype = 'void'::regtype then
    execute format('select public.%I(%s)', fname, lista) using args;
    res := to_jsonb('hecho'::text);
  else
    execute format('select to_jsonb(public.%I(%s))', fname, lista) using args into res;
  end if;
  res := public.fn_nexa_ocultar(res);
  return jsonb_build_object('tipo', 'funcion', 'funcion', fname, 'resultado', res, 'principal', res);
end;
$$;

/** Ejecuta los pasos en orden (con los permisos del usuario). Devuelve el resultado de cada uno. */
create or replace function public.fn_nexa_aplicar(p_pasos jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  p jsonb;
  r jsonb;
  res jsonb := '[]'::jsonb;
  principales jsonb := '[]'::jsonb;
begin
  for p in select e from jsonb_array_elements(p_pasos) e loop
    p := public.fn_nexa_resolver(p, principales);
    if p ->> 'tipo' = 'tabla' then r := public.fn_nexa_paso_tabla(p);
    elsif p ->> 'tipo' = 'funcion' then r := public.fn_nexa_paso_funcion(p);
    else raise exception 'Paso de tipo desconocido.';
    end if;
    principales := principales || jsonb_build_array(r -> 'principal');
    res := res || jsonb_build_array(r - 'principal');
  end loop;
  return res;
end;
$$;

-- ---------------------------------------------------------------- Proponer (simulación)

create or replace function public.fn_nexa_propuesta_antes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_min int;
begin
  -- Lo fija la base, no quien inserta: dueño, estado, plazos y un nivel nunca menor que el de sus pasos.
  new.usuario_id := auth.uid();
  new.empleado_codigo := public.fn_empleado_actual();
  new.creado_en := now();
  new.caduca_en := clock_timestamp() + interval '10 minutes';
  new.estado := 'pendiente';
  new.ejecutada_en := null;
  new.motivo := null;
  new.confirmacion := null;
  new.resultado := null;
  v_min := (public.fn_nexa_nivel(new.pasos) ->> 'nivel')::int;
  new.nivel := greatest(coalesce(new.nivel, 1), v_min, 2);
  new.palabra := case when new.nivel >= 4
    then (array['CONFIRMO', 'APRUEBO', 'ADELANTE', 'EJECUTA'])[1 + floor(random() * 4)::int] || '-' || lpad((floor(random() * 900) + 100)::int::text, 3, '0')
  end;
  return new;
end;
$$;
create or replace trigger nexa_propuesta_antes before insert on public.nexa_propuesta for each row execute function public.fn_nexa_propuesta_antes();

create or replace function public.fn_nexa_proponer(p_resumen text, p_pasos jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_desde bigint;
  v_res jsonb;
  v_camb jsonb;
  v_niv jsonb;
  v_nivel int;
  v_filas int;
  v_prop public.nexa_propuesta;
begin
  if auth.uid() is null then raise exception 'Hace falta una sesión del ERP.'; end if;
  if coalesce(btrim(p_resumen), '') = '' then raise exception 'Falta el resumen del cambio.'; end if;
  perform public.fn_nexa_nivel(p_pasos);  -- valida pasos, bloqueos y permisos del catálogo

  -- Simulación: se hace de verdad (con los permisos del usuario) y se deshace siempre.
  v_desde := public.fn_nexa_auditoria_ultimo();
  begin
    perform set_config('erp.nexa_origen', 'NEXA · simulación', true);
    v_res := public.fn_nexa_aplicar(p_pasos);
    v_camb := public.fn_nexa_cambios(v_desde);
    raise exception using errcode = 'NX001', message = 'simulación terminada';
  exception when sqlstate 'NX001' then
    null;
  end;

  v_niv := public.fn_nexa_nivel(p_pasos, v_res, v_camb);
  v_nivel := (v_niv ->> 'nivel')::int;
  v_filas := greatest(coalesce((v_camb ->> 'total')::int, 0), coalesce((select sum((e ->> 'filas')::int) from jsonb_array_elements(v_res) e), 0)::int);

  if v_nivel = 1 then
    return jsonb_build_object('nivel', 1, 'consulta', true, 'resultado', v_res,
                              'nota', 'Es una consulta: no cambia nada. Ya tienes el resultado; no hace falta confirmar.');
  end if;
  if v_nivel = 5 and not public.fn_es_administrador() then
    raise exception 'Es un cambio de nivel 5 (crítico o legal): solo lo puede hacer un administrador.' using errcode = '42501';
  end if;

  insert into public.nexa_propuesta (resumen, pasos, nivel, filas, vista_previa)
  values (left(btrim(p_resumen), 500), p_pasos, v_nivel, v_filas,
          jsonb_build_object('pasos', v_res, 'cambios', v_camb, 'motivos', v_niv -> 'motivos'))
  returning * into v_prop;

  return jsonb_build_object('id', v_prop.id, 'nivel', v_prop.nivel, 'palabra', v_prop.palabra, 'caduca_en', v_prop.caduca_en,
                            'filas', v_filas, 'resumen', v_prop.resumen, 'vista_previa', v_prop.vista_previa);
end;
$$;

-- ---------------------------------------------------------------- Firma, toma y cierre (SECURITY DEFINER)

create or replace function public.fn_nexa_firma(p_id bigint, p_usuario uuid, p_nivel int)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_clave text := (select clave from nexa_privado.secreto where id = 1);
begin
  if v_clave is null then raise exception 'Falta el secreto de firma de NEXA (nexa_privado.secreto).'; end if;
  return encode(extensions.hmac(p_id::text || ':' || p_usuario::text || ':' || p_nivel::text, v_clave, 'sha256'), 'hex');
end;
$$;
revoke execute on function public.fn_nexa_firma(bigint, uuid, int) from public, anon, authenticated;

create or replace function public.fn_nexa_propuesta_tomar(p_id bigint, p_firma text, p_motivo text, p_confirmacion jsonb)
returns public.nexa_propuesta
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.nexa_propuesta;
begin
  select * into p from nexa_propuesta where id = p_id for update;
  if not found or p.usuario_id is distinct from auth.uid() then
    raise exception 'No existe la propuesta % (o es de otro usuario).', p_id using errcode = '42501';
  end if;
  if p.estado <> 'pendiente' then raise exception 'La propuesta % ya está %.', p_id, p.estado; end if;
  if p.caduca_en < clock_timestamp() then
    raise exception 'La propuesta % ha caducado: pide a NEXA que la prepare otra vez.', p_id;
  end if;
  if p_firma is null or p_firma <> public.fn_nexa_firma(p.id, p.usuario_id, p.nivel) then
    raise exception 'Confirmación no válida: los cambios solo los ejecuta NEXA después de que confirmes en la conversación.' using errcode = '42501';
  end if;
  if p.nivel >= 4 and length(btrim(coalesce(p_motivo, ''))) < 4 then raise exception 'Falta el motivo del cambio.'; end if;
  if p.nivel = 5 and not public.fn_es_administrador() then
    raise exception 'Los cambios de nivel 5 solo los puede hacer un administrador.' using errcode = '42501';
  end if;
  update nexa_propuesta set estado = 'ejecutando', motivo = nullif(left(btrim(coalesce(p_motivo, '')), 300), ''), confirmacion = p_confirmacion
   where id = p_id returning * into p;
  return p;
end;
$$;

create or replace function public.fn_nexa_propuesta_cerrar(p_id bigint, p_firma text, p_resultado jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.nexa_propuesta;
begin
  select * into p from nexa_propuesta where id = p_id for update;
  if not found or p.usuario_id is distinct from auth.uid() or p.estado <> 'ejecutando'
     or p_firma is distinct from public.fn_nexa_firma(p.id, p.usuario_id, p.nivel) then
    raise exception 'No se puede cerrar la propuesta %.', p_id using errcode = '42501';
  end if;
  update nexa_propuesta set estado = 'ejecutada', ejecutada_en = now(), resultado = p_resultado where id = p_id;
end;
$$;

create or replace function public.fn_nexa_propuesta_cancelar(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update nexa_propuesta set estado = 'cancelada' where id = p_id and usuario_id = auth.uid() and estado = 'pendiente';
end;
$$;

-- ---------------------------------------------------------------- Ejecutar

create or replace function public.fn_nexa_ejecutar(p_id bigint, p_firma text, p_motivo text default null, p_confirmacion jsonb default null)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  p public.nexa_propuesta;
  v_desde bigint;
  v_res jsonb;
  v_camb jsonb;
  v_niv jsonb;
begin
  p := public.fn_nexa_propuesta_tomar(p_id, p_firma, p_motivo, p_confirmacion);
  perform set_config('erp.nexa_origen',
    left(format('NEXA · nivel %s · propuesta %s%s', p.nivel, p.id, case when p.motivo is not null then ' · motivo: ' || p.motivo else '' end), 300), true);
  v_desde := public.fn_nexa_auditoria_ultimo();
  v_res := public.fn_nexa_aplicar(p.pasos);
  v_camb := public.fn_nexa_cambios(v_desde);
  v_niv := public.fn_nexa_nivel(p.pasos, v_res, v_camb);
  if (v_niv ->> 'nivel')::int > p.nivel then
    raise exception 'El cambio real (nivel %) es mayor que el propuesto (nivel %): no se ha hecho nada. Pide a NEXA que lo prepare otra vez.',
      v_niv ->> 'nivel', p.nivel;
  end if;
  perform public.fn_nexa_propuesta_cerrar(p.id, p_firma, jsonb_build_object('pasos', v_res, 'cambios', v_camb));
  perform set_config('erp.nexa_origen', '', true);
  return jsonb_build_object('id', p.id, 'nivel', p.nivel, 'hecho', true, 'motivo', p.motivo,
                            'filas', coalesce((v_camb ->> 'total')::int, 0), 'pasos', v_res, 'cambios', v_camb);
end;
$$;

-- ---------------------------------------------------------------- Describir funciones (presentes y futuras)

create or replace function public.fn_nexa_funciones(p_texto text default null)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_palabras text[] := (select array_agg(lower(w)) from regexp_split_to_table(btrim(coalesce(p_texto, '')), '\s+') w where length(w) > 1);
  v jsonb;
begin
  with f as (
    select p.proname::text as nombre, pg_get_function_identity_arguments(p.oid) as argumentos,
           pg_get_function_result(p.oid) as devuelve, p.provolatile, obj_description(p.oid, 'pg_proc') as comentario,
           public.fn_nexa_catalogo('funcion', p.proname, '*') as c
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype
       and has_function_privilege(p.oid, 'execute')
       and p.proname !~ '^(lst_|gw_lista|fn_inf_|fn_verifactu_(texto|sha|url|fecha|importe|qr|num_serie|nif|prueba))'
  ), g as (
    select nombre, argumentos, devuelve,
           case when (c).bloqueada then null
                when (c).codigo is not null then (c).nivel
                when provolatile in ('s', 'i') then 1
                when nombre ~ '(anular|rectific|verifactu|permiso|grupo|_rol|empleado|usuario|borra|elimin|contador|ejercicio|conformidad|periodo)' then 5
                else 4 end as nivel,
           coalesce((c).bloqueada, false) as bloqueada,
           coalesce((c).descripcion, comentario) as descripcion,
           (c).permiso as permiso, provolatile in ('s', 'i') as solo_lectura, (c).receta as receta
      from f
  )
  select coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(g)) order by nombre), '[]'::jsonb) into v
    from g
   where v_palabras is null or not exists (
     select 1 from unnest(v_palabras) w where position(w in lower(concat_ws(' ', nombre, argumentos, descripcion))) = 0);
  return jsonb_build_object('funciones', v,
    'catalogo_tablas', (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('tabla', objeto, 'accion', accion, 'nivel', nivel, 'bloqueada', bloqueada, 'descripcion', descripcion, 'receta', receta)) order by objeto), '[]'::jsonb)
                          from nexa_operacion where tipo = 'tabla'
                           and (v_palabras is null or not exists (select 1 from unnest(v_palabras) w where position(w in lower(objeto || ' ' || descripcion || ' ' || coalesce(receta, ''))) = 0))));
end;
$$;

-- ---------------------------------------------------------------- Sugerencias de NEXA (listados del empleado)

create or replace function public.fn_nexa_sugerencias()
returns jsonb
language sql
stable
set search_path = public
as $$
  with yo as (select e.codigo, e.rol_id from empleado e where e.auth_user_id = auth.uid() limit 1),
  vis as (
    select g.id, g.codigo, g.nombre, g.fuente, g.creado_en
      from listado_guardado g
     where not g.archivado and g.codigo is not null and public.fn_listado_fuente_permitida(g.fuente)
  ),
  mios as (select u.listado_id, count(*) n from listado_uso u where u.empleado_codigo = (select codigo from yo) group by 1),
  grupo as (select u.listado_id, count(*) n from listado_uso u join empleado e on e.codigo = u.empleado_codigo
             where e.rol_id = (select rol_id from yo) group by 1),
  candidatos as (
    select v.*, 1 as prioridad, m.n as usos, 'tuyo' as origen from vis v join mios m on m.listado_id = v.id
    union all
    select v.*, 2, g.n, 'grupo' from vis v join grupo g on g.listado_id = v.id
    union all
    select v.*, 3, 0, 'reciente' from vis v
  ),
  uno as (
    select distinct on (id) id, codigo, nombre, fuente, creado_en, prioridad, usos, origen
      from candidatos order by id, prioridad
  )
  select jsonb_build_object('listados', coalesce((
    select jsonb_agg(jsonb_build_object('codigo', codigo, 'nombre', nombre, 'fuente', fuente, 'origen', origen, 'usos', usos) order by prioridad, usos desc, creado_en desc)
      from (select * from uno order by prioridad, usos desc, creado_en desc limit 3) t), '[]'::jsonb))
$$;

grant execute on function public.fn_nexa_proponer(text, jsonb), public.fn_nexa_ejecutar(bigint, text, text, jsonb),
  public.fn_nexa_propuesta_cancelar(bigint), public.fn_nexa_funciones(text), public.fn_nexa_sugerencias(),
  public.fn_nexa_nivel(jsonb, jsonb, jsonb), public.fn_nexa_nivel_paso(jsonb, integer) to authenticated;
revoke execute on function public.fn_nexa_proponer(text, jsonb), public.fn_nexa_ejecutar(bigint, text, text, jsonb),
  public.fn_nexa_propuesta_cancelar(bigint), public.fn_nexa_funciones(text), public.fn_nexa_sugerencias(),
  public.fn_nexa_propuesta_tomar(bigint, text, text, jsonb), public.fn_nexa_propuesta_cerrar(bigint, text, jsonb),
  public.fn_nexa_cambios(bigint), public.fn_nexa_auditoria_ultimo() from anon;

-- ---------------------------------------------------------------- Secreto de la firma
-- La Edge Function «nexa» deriva la clave de firma de su clave de servicio (SHA-256 de
-- SUPABASE_SERVICE_ROLE_KEY + ':nexa-firma', que la base no conoce) y la registra aquí la primera
-- vez, con la clave de servicio (único uso de la service role en NEXA). Solo service_role la llama.
create or replace function public.fn_nexa_secreto_registrar(p_clave text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_clave is null or length(p_clave) < 32 then raise exception 'Clave de firma no válida.'; end if;
  insert into nexa_privado.secreto (id, clave) values (1, p_clave) on conflict (id) do nothing;
  return (select clave = p_clave from nexa_privado.secreto where id = 1);
end;
$$;
revoke execute on function public.fn_nexa_secreto_registrar(text) from public, anon, authenticated;
grant execute on function public.fn_nexa_secreto_registrar(text) to service_role;

-- ---------------------------------------------------------------- Recetas (cómo lo hace la pantalla)
-- Lo que hace una pantalla sin función SQL detrás (varias tablas a la vez) no se adivina mirando
-- las tablas: el catálogo lleva la «receta» y NEXA la lee con describir_funciones (y le vuelve en
-- la propuesta). Probado el 31/10: sin receta, NEXA regularizaba el stock solo con
-- regularizacion_stock y sin el movimiento de stock (el stock no habría cambiado).
alter table public.nexa_operacion add column if not exists receta text;
comment on column public.nexa_operacion.receta is 'Cómo hace la operación la pantalla del ERP (tablas, orden, campos) cuando no hay una función SQL que lo haga todo.';

insert into public.nexa_operacion (codigo, descripcion, tipo, objeto, accion, nivel, receta) values
  ('tabla:pedido_cliente', 'Pedidos, presupuestos y reparaciones de cliente', 'tabla', 'pedido_cliente', '*', 3,
   'Alta (como Ventas → Presupuestos / Pedidos): 1) funcion fn_siguiente_numero {p_tienda, p_tipo_documento:"pedido_cliente", p_serie:""}; 2) alta en pedido_cliente con numero "$paso1" (es_presupuesto true y presupuesto_estado "borrador" para presupuestos; es_reparacion para reparaciones), cliente, almacén, vendedor, forma de pago y los totales (subtotal, total_igic_pie, total); 3) una alta por línea en pedido_cliente_linea (tienda_terminal_codigo, numero "$paso1", numero_linea 1..n, articulo_codigo, descripcion, cantidad, precio, igic_pct, subtotal, total_base, total_igic). Copia los demás campos de un documento parecido. Un presupuesto no mueve stock; para convertirlo en pedido usa fn_presupuesto_a_pedido.')
on conflict (codigo) do update set receta = excluded.receta;
update public.nexa_operacion set receta =
  'Regularizar el stock de un artículo (como Almacén → Regularización de stock): 1) funcion fn_siguiente_numero {p_tienda, p_tipo_documento:"regularizacion_stock", p_serie:""}; 2) alta en regularizacion_stock {tienda_terminal_codigo, numero:"$paso1", articulo_codigo, almacen_codigo, fecha, documento_externo:"USR_STK", cantidad: el stock NUEVO, precio: articulo.coste_bruto, stock_anterior: cantidad_actual de articulo_almacen_stock en ese almacén, activo:true}; 3) si nuevo − anterior ≠ 0, alta en movimiento_stock {tipo_movimiento:"regularizacion", sentido: 1 si sube / -1 si baja, almacen_codigo, articulo_codigo, cantidad: |nuevo − anterior|, costo_unitario: el precio, documento_origen_tipo:"regularizacion_stock", documento_origen_tienda_codigo: la tienda, documento_origen_numero:"$paso1", tienda_terminal_codigo}. El saldo (articulo_almacen_stock) lo actualiza solo el trigger de movimiento_stock: no lo toques a mano.'
 where codigo = 'tabla:regularizacion_stock';
update public.nexa_operacion set receta =
  'No se escribe a mano: el saldo lo lleva el trigger de movimiento_stock. Para cambiar el stock, regulariza (receta de regularizacion_stock) o usa fn_recalcular_stock_aplicar / fn_stock_cero_familia_aplicar.'
 where codigo = 'tabla:articulo_almacen_stock';
