-- 1) Decisión sobre cada recibo devuelto (Luis, 01/11/2026: «ante una devolución el programa debe como
--    mínimo avisar a la persona encargada y qué procedimiento seguir: cancelar el crédito o no…»).
--    Cada devolución queda «pendiente de decidir» hasta que alguien elige una o varias acciones:
--      reremesar          → volver a pasarlo al cobro (sale otra vez en «Nueva remesa»; se puede cambiar el vencimiento)
--      otra_via           → cobrarlo por otra vía (deja de ser domiciliado: no vuelve a las remesas)
--      repercutir_gastos  → cargar al cliente los gastos del banco (asiento 430 cliente / 759)
--      bloquear_credito   → solo contado: límite de deuda 0, cliente «peligroso» y aviso en cada venta
--      bloquear_cliente   → no se le puede vender (cliente bloqueado)
--      dudoso_cobro       → pasar la deuda a dudoso cobro (asiento 436 / 430), para la asesoría
--    A partir de la 2.ª devolución del mismo cliente la pantalla propone bloquear el crédito.
--    Avisos: fn_remesa_devoluciones_pendientes (la cabecera del ERP avisa a quien gestiona remesas).
-- 2) Registro de incidencias (Archivo → Registro de incidencias): fallos de programación, mejoras y
--    dudas, de los empleados o de los Claude, con estado y quién lo lleva.

-- 1. Devoluciones -------------------------------------------------------------------------------------
alter table public.remesa_recibo add column if not exists decision jsonb;
alter table public.remesa_recibo add column if not exists decision_por text;
alter table public.remesa_recibo add column if not exists decision_en timestamptz;
alter table public.remesa_recibo add column if not exists decision_nota text;

drop function if exists public.fn_remesa_devoluciones();
create or replace function public.fn_remesa_devoluciones()
returns table(id bigint, e2e text, cliente_codigo text, cliente_nombre text, telefono text, importe numeric, devuelto_en date, gasto numeric,
              referencia text, veces integer, decision jsonb, decision_por text, decision_en timestamptz, decision_nota text,
              cobro_tienda text, cobro_codigo bigint, bloqueado boolean, credito_bloqueado boolean)
language sql stable security definer set search_path = public as $$
  select x.id, x.e2e, x.cliente_codigo, coalesce(nullif(c.razon_social, ''), c.nombre), coalesce(c.telefono_movil, c.telefono_fijo),
         x.importe, x.devuelto_en, x.gasto_devolucion, re.referencia,
         (select count(*)::int from remesa_recibo y where y.cliente_codigo = x.cliente_codigo and y.estado = 'devuelto'),
         x.decision, fn_numero_operario(x.decision_por), x.decision_en, x.decision_nota,
         x.cobro_tienda_codigo, x.cobro_codigo, coalesce(c.bloqueado, false), coalesce(c.es_peligroso, false) and coalesce(c.limite_deuda, 1) = 0
    from remesa_recibo x join remesa re on re.id = x.remesa_id left join cliente c on c.codigo = x.cliente_codigo
   where x.estado = 'devuelto' order by x.decision is not null, x.devuelto_en desc
$$;

create or replace function public.fn_remesa_devoluciones_pendientes()
returns integer language sql stable security definer set search_path = public as $$
  select case when fn_puede('/contabilidad/remesas') then (select count(*)::int from remesa_recibo where estado = 'devuelto' and decision is null) else 0 end
$$;

create or replace function public.fn_remesa_devolucion_decidir(p_recibo bigint, p_acciones text[], p_nota text default null, p_vencimiento date default null)
returns void language plpgsql security definer set search_path = public as $$
declare r remesa_recibo; k cobro_cliente; a text; cta text; cfg configuracion_contable := fn_contab_cfg(); ap contab_apunte_t[];
  v_hoy date := (now() at time zone 'Atlantic/Canary')::date; v_436 text;
begin
  perform fn_remesa_permiso();
  select * into r from remesa_recibo where id = p_recibo for update;
  if not found or r.estado <> 'devuelto' then raise exception 'El recibo no está devuelto.'; end if;
  if coalesce(cardinality(p_acciones), 0) = 0 then raise exception 'Elige al menos una acción.'; end if;
  if 'reremesar' = any (p_acciones) and 'otra_via' = any (p_acciones) then raise exception 'O se vuelve a remesar o se cobra por otra vía, no las dos.'; end if;
  -- El cobro pendiente que dejó la devolución (el mismo vencimiento).
  select * into k from cobro_cliente where tienda_terminal_codigo = r.cobro_tienda_codigo and codigo_pago = r.cobro_codigo;
  foreach a in array p_acciones loop
    case a
      when 'reremesar' then
        if k.estado_cobro = 'pendiente' then
          update cobro_cliente set es_domiciliado = true, fecha_vencimiento = coalesce(p_vencimiento, fecha_vencimiento), actualizado_en = now()
           where tienda_terminal_codigo = k.tienda_terminal_codigo and codigo_pago = k.codigo_pago;
        end if;
      when 'otra_via' then
        if k.estado_cobro = 'pendiente' then
          update cobro_cliente set es_domiciliado = false, actualizado_en = now()
           where tienda_terminal_codigo = k.tienda_terminal_codigo and codigo_pago = k.codigo_pago;
        end if;
      when 'repercutir_gastos' then
        if coalesce(r.gasto_devolucion, 0) <= 0 then raise exception 'Esta devolución no tuvo gastos que repercutir.'; end if;
        cta := fn_contab_cuenta_cliente(r.cliente_codigo);
        ap := array[fn_contab_ap(cta, r.gasto_devolucion, 'Gastos devolución recibo ' || r.e2e || ' a cargo del cliente', r.e2e),
                    fn_contab_ap(coalesce(cfg.cuenta_ingresos_caja, '75900000'), -r.gasto_devolucion, 'Gastos devolución recibo ' || r.e2e || ' a cargo del cliente', r.e2e)];
        perform fn_contab_crear_asiento(v_hoy, 'Repercusión gastos devolución ' || r.e2e, 'manual', null, null, 'devolucion:' || r.id, ap, '[]', null, false, null, null);
      when 'bloquear_credito' then
        update cliente set es_peligroso = true, limite_deuda = 0,
               mensaje_aviso_venta = left(concat_ws(' · ', '⚠ Recibos devueltos: SOLO CONTADO (desde ' || to_char(v_hoy, 'DD/MM/YYYY') || ')',
                                                    nullif(mensaje_aviso_venta, '')), 500)
         where codigo = r.cliente_codigo;
      when 'bloquear_cliente' then
        update cliente set bloqueado = true where codigo = r.cliente_codigo;
      when 'dudoso_cobro' then
        v_436 := rpad('436', greatest(coalesce(cfg.longitud_subcuenta, 8), 3), '0');
        insert into cuenta_contable (empresa_id, codigo, descripcion, tipo) values (fn_contab_empresa_principal(), v_436, 'Clientes de dudoso cobro', 'Activo')
        on conflict do nothing;
        cta := fn_contab_cuenta_cliente(r.cliente_codigo);
        ap := array[fn_contab_ap(v_436, r.importe, 'Dudoso cobro recibo ' || r.e2e, r.e2e),
                    fn_contab_ap(cta, -r.importe, 'Dudoso cobro recibo ' || r.e2e, r.e2e)];
        perform fn_contab_crear_asiento(v_hoy, 'Paso a dudoso cobro ' || r.e2e, 'manual', null, null, 'devolucion:' || r.id, ap, '[]', null, false, null, null);
      else
        raise exception 'Acción no válida: %', a;
    end case;
  end loop;
  update remesa_recibo set decision = to_jsonb(p_acciones), decision_por = fn_empleado_actual(), decision_en = now(),
         decision_nota = nullif(btrim(coalesce(p_nota, '')), '') where id = r.id;
end $$;

grant execute on function public.fn_remesa_devoluciones(), public.fn_remesa_devoluciones_pendientes(),
  public.fn_remesa_devolucion_decidir(bigint, text[], text, date) to authenticated;

-- 2. Registro de incidencias -------------------------------------------------------------------------
create table if not exists public.incidencia (
  id bigint generated always as identity primary key,
  tipo text not null default 'fallo' check (tipo in ('fallo', 'mejora', 'duda')),
  titulo text not null,
  descripcion text,
  pantalla text,
  prioridad text not null default 'normal' check (prioridad in ('alta', 'normal', 'baja')),
  estado text not null default 'abierta' check (estado in ('abierta', 'en_curso', 'resuelta', 'comprobada', 'descartada')),
  reportado_por text not null default coalesce(public.fn_empleado_actual(), 'Claude'),
  reportado_en timestamptz not null default now(),
  asignado text,
  solucion text,
  commit_ref text,
  resuelta_en timestamptz,
  comprobada_por text,
  comprobada_en timestamptz,
  adjunto_nombre text,
  adjunto_base64 text,
  actualizado_en timestamptz not null default now()
);
create index if not exists incidencia_estado_idx on public.incidencia (estado, reportado_en desc);
comment on table public.incidencia is 'Registro de incidencias: fallos de programación, mejoras y dudas (empleados y Claude).';

create table if not exists public.incidencia_comentario (
  id bigint generated always as identity primary key,
  incidencia_id bigint not null references public.incidencia (id) on delete cascade,
  autor text not null default coalesce(public.fn_empleado_actual(), 'Claude'),
  texto text not null,
  creado_en timestamptz not null default now()
);

alter table public.incidencia enable row level security;
alter table public.incidencia_comentario enable row level security;
drop policy if exists incidencia_lee on public.incidencia;
create policy incidencia_lee on public.incidencia for select to authenticated using (true);
drop policy if exists incidencia_alta on public.incidencia;
create policy incidencia_alta on public.incidencia for insert to authenticated with check (true);
drop policy if exists incidencia_cambia on public.incidencia;
create policy incidencia_cambia on public.incidencia for update to authenticated
  using (reportado_por = public.fn_empleado_actual() or public.fn_es_administrador() or public.fn_es_super_administrador())
  with check (true);
drop policy if exists incidencia_comentario_lee on public.incidencia_comentario;
create policy incidencia_comentario_lee on public.incidencia_comentario for select to authenticated using (true);
drop policy if exists incidencia_comentario_alta on public.incidencia_comentario;
create policy incidencia_comentario_alta on public.incidencia_comentario for insert to authenticated with check (true);
drop trigger if exists trg_auditoria_incidencia on public.incidencia;
create trigger trg_auditoria_incidencia after insert or delete or update on public.incidencia for each row execute function public.fn_auditoria_trigger();

-- Opción de menú Archivo → Registro de incidencias: todos los grupos.
insert into public.permiso (codigo, descripcion, modulo, tipo, orden)
values ('/archivo/incidencias', 'Registro de incidencias', 'Archivo', 'menu', 0)
on conflict (codigo) do nothing;
insert into public.rol_permiso (rol_id, permiso_codigo)
select r.id, '/archivo/incidencias' from public.rol r on conflict do nothing;

-- Primeras incidencias (las que ha encontrado Claude-Luis hasta hoy).
insert into public.incidencia (tipo, titulo, descripcion, pantalla, prioridad, estado, reportado_por, asignado, solucion, resuelta_en)
select * from (values
  ('fallo', 'Anular un cobro dejaba su asiento vigente',
   'Al anular un cobro a mano (o al devolverse un recibo) el asiento del cobro seguía vigente y, si después se volvía a cobrar, el nuevo cobro no se contabilizaba.',
   '/cobros-clientes', 'alta', 'resuelta', 'Claude-Luis', 'Claude-Luis',
   'Disparador en cobro_cliente: al dejar de estar cobrado se hace el contraasiento de su asiento (con la fecha del cargo si es una devolución) y el cobro queda listo para volver a contabilizarse. Migración 20261101_cobro_anulado_contraasiento.', now()),
  ('fallo', 'Asiento sin apuntes daba «malformed array literal»',
   'fn_contab_crear_asiento fallaba con un error interno cuando un asiento se quedaba sin apuntes (importe cero), en vez de grabarlo con su motivo de error.',
   '/contabilidad/generar', 'normal', 'resuelta', 'Claude-Luis', 'Claude-Luis',
   'Corregido al reescribir fn_contab_crear_asiento para la contabilidad multiempresa (migración 20261031_contabilidad_multiempresa).', now())
) v(tipo, titulo, descripcion, pantalla, prioridad, estado, reportado_por, asignado, solucion, resuelta_en)
where not exists (select 1 from public.incidencia);
