-- NEXA: memoria global y personal (02/11/2026).
--  · ambito 'global': lo que NEXA recuerda para TODO el equipo (reglas de listados, forma de trabajar, aclaraciones del
--    negocio). Lo ve cualquier usuario del ERP; solo lo escribe quien tenga el permiso «accion:nexa-memoria-global»
--    (administradores y GERENCIA). NO guardar aquí datos personales, claves ni nada confidencial.
--  · ambito 'personal': preferencias de una persona; solo ella las ve y las gestiona.
-- NEXA las lee en cada conversación (van en sus instrucciones) y solo las guarda cuando la persona lo pide.
-- Nunca se borran: «olvidar» las desactiva (activa = false) y queda el rastro en la auditoría.

create table if not exists public.nexa_memoria (
  id bigint generated always as identity primary key,
  ambito text not null check (ambito in ('global', 'personal')),
  texto text not null check (length(texto) between 3 and 600),
  usuario_id uuid not null default auth.uid(),
  activa boolean not null default true,
  creado_en timestamptz not null default now(),
  desactivada_en timestamptz
);
comment on table public.nexa_memoria is 'Memoria de NEXA: global (todo el equipo) o personal. Se desactiva, no se borra.';
create index if not exists nexa_memoria_activa_idx on public.nexa_memoria (ambito, id) where activa;

alter table public.nexa_memoria enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'nexa_memoria' and policyname = 'nexa_memoria_lee') then
    create policy nexa_memoria_lee on public.nexa_memoria for select to authenticated
      using (ambito = 'global' or usuario_id = auth.uid());
    create policy nexa_memoria_alta on public.nexa_memoria for insert to authenticated
      with check (usuario_id = auth.uid() and (ambito = 'personal' or public.fn_puede('accion:nexa-memoria-global')));
    create policy nexa_memoria_modifica on public.nexa_memoria for update to authenticated
      using (usuario_id = auth.uid() or (ambito = 'global' and public.fn_puede('accion:nexa-memoria-global')))
      with check (usuario_id = auth.uid() or (ambito = 'global' and public.fn_puede('accion:nexa-memoria-global')));
  end if;
end $$;
revoke all on public.nexa_memoria from anon;
grant select, insert, update on public.nexa_memoria to authenticated;

create or replace trigger trg_auditoria_nexa_memoria after insert or update or delete on public.nexa_memoria
  for each row execute function public.fn_auditoria_trigger();

insert into public.permiso (codigo, descripcion, modulo, orden)
values ('accion:nexa-memoria-global', 'NEXA: guardar memoria para todo el equipo', 'Utilidades', 1142)
on conflict (codigo) do nothing;
insert into public.rol_permiso (rol_id, permiso_codigo)
select r.id, 'accion:nexa-memoria-global' from public.rol r where r.codigo = 'GERENCIA'
on conflict do nothing;
