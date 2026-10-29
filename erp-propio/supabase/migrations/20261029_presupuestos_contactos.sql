-- Seguimiento de presupuestos, formulario «SEGUIMIENTO» (Luis, 29/10/2026):
--  · presupuesto_contacto: hasta 3 contactos por presupuesto (1.º, 2.º, 3.º): día, con quién se
--    habló, qué contestó, próximo contacto y por qué medio (teléfono o correo). Al guardar uno,
--    el presupuesto pasa a «en seguimiento» y su próximo contacto es el de ese contacto.
--  · presupuesto_correo: los correos de seguimiento enviados (para, asunto, texto, quién y cuándo).
--  · Cierre: cerrado_en / cerrado_por en pedido_cliente (al pasar a aceptado o perdido).
--  · v_busca_presupuestos: búsqueda «Ver Presup.» por nº, cliente o vendedor.

create table if not exists public.presupuesto_contacto (
  id bigint generated always as identity primary key,
  tienda_terminal_codigo text not null,
  numero bigint not null,
  orden smallint not null check (orden between 1 and 3),
  fecha date not null default ((now() at time zone 'Atlantic/Canary')::date),
  contacto_con text,
  respuesta text,
  proximo_contacto date,
  medio text not null default 'telefono' check (medio in ('telefono', 'email')),
  empleado_codigo text references public.empleado(codigo) default public.fn_empleado_actual(),
  creado_en timestamptz not null default now(),
  unique (tienda_terminal_codigo, numero, orden),
  foreign key (tienda_terminal_codigo, numero) references public.pedido_cliente (tienda_terminal_codigo, numero) on delete cascade
);
comment on table public.presupuesto_contacto is 'Contactos de seguimiento de un presupuesto (hasta 3): fecha, con quién, respuesta, próximo contacto y medio.';
alter table public.presupuesto_contacto enable row level security;
do $$ begin
  create policy presupuesto_contacto_todo on public.presupuesto_contacto for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
grant select, insert, update, delete on public.presupuesto_contacto to authenticated;

create table if not exists public.presupuesto_correo (
  id bigint generated always as identity primary key,
  tienda_terminal_codigo text not null,
  numero bigint not null,
  contacto_orden smallint,
  para text,
  asunto text,
  cuerpo text,
  enviado_por text references public.empleado(codigo) default public.fn_empleado_actual(),
  enviado_en timestamptz not null default now(),
  foreign key (tienda_terminal_codigo, numero) references public.pedido_cliente (tienda_terminal_codigo, numero) on delete cascade
);
comment on table public.presupuesto_correo is 'Correos de seguimiento de presupuestos enviados desde el formulario SEGUIMIENTO.';
alter table public.presupuesto_correo enable row level security;
do $$ begin
  create policy presupuesto_correo_todo on public.presupuesto_correo for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
grant select, insert, update, delete on public.presupuesto_correo to authenticated;

-- Al guardar un contacto: el presupuesto pasa a «en seguimiento» con ese próximo contacto.
create or replace function public.fn_presupuesto_contacto_aplica()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  update pedido_cliente
     set presupuesto_estado = case when presupuesto_estado in ('aceptado', 'perdido') then presupuesto_estado else 'seguimiento' end,
         proximo_contacto = case when presupuesto_estado in ('aceptado', 'perdido') then null else coalesce(new.proximo_contacto, proximo_contacto) end
   where tienda_terminal_codigo = new.tienda_terminal_codigo and numero = new.numero;
  return new;
end;
$$;
drop trigger if exists trg_presupuesto_contacto_aplica on public.presupuesto_contacto;
create trigger trg_presupuesto_contacto_aplica after insert or update on public.presupuesto_contacto
  for each row execute function public.fn_presupuesto_contacto_aplica();

-- Cierre del presupuesto: fecha y vendedor. (El disparador se llama «zcierre» para que corra
-- después de trg_presupuesto_estado, que es el que decide el estado.)
alter table public.pedido_cliente
  add column if not exists cerrado_en timestamptz,
  add column if not exists cerrado_por text references public.empleado(codigo);

create or replace function public.fn_presupuesto_cierre()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if coalesce(new.es_presupuesto, false) then
    if new.presupuesto_estado in ('aceptado', 'perdido')
       and (tg_op = 'INSERT' or old.presupuesto_estado is distinct from new.presupuesto_estado) then
      new.cerrado_en := coalesce(new.cerrado_en, now());
      new.cerrado_por := coalesce(new.cerrado_por, public.fn_empleado_actual());
    elsif new.presupuesto_estado not in ('aceptado', 'perdido') then
      new.cerrado_en := null;
      new.cerrado_por := null;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_presupuesto_zcierre on public.pedido_cliente;
create trigger trg_presupuesto_zcierre before insert or update on public.pedido_cliente
  for each row execute function public.fn_presupuesto_cierre();

-- Búsqueda de presupuestos (y pedidos) por nº, cliente o vendedor, en texto.
create or replace view public.v_busca_presupuestos with (security_invoker = true) as
select p.tienda_terminal_codigo, p.numero, p.numero::text as numero_txt, p.fecha, p.es_presupuesto,
       p.cliente_codigo, coalesce(c.nombre, p.nombre_cliente) as cliente_nombre,
       p.vendedor_codigo, v.nombre as vendedor_nombre, p.presupuesto_estado, p.total
  from pedido_cliente p
  left join cliente c on c.codigo = p.cliente_codigo
  left join vendedor v on v.codigo = p.vendedor_codigo
 where not coalesce(p.es_reparacion, false);
grant select on public.v_busca_presupuestos to authenticated;
revoke all on public.v_busca_presupuestos from anon;
