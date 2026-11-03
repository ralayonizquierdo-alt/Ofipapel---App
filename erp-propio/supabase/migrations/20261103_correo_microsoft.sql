-- Correo del ERP por Microsoft 365 (Rober, 03/11/2026): la misma conexión (app de Azure con Mail.Send) que la app de
-- Devoluciones. Las claves son secretos de las funciones (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET).
-- Desde qué buzón sale y a dónde van las respuestas se elige en Archivo → Datos de Empresa. De momento el buzón
-- general; cuando se cree una dirección propia del ERP, se cambia ahí sin tocar el programa.
alter table public.empresa add column if not exists correo_remitente text;
alter table public.empresa add column if not exists correo_responder_a text;
update public.empresa set correo_remitente = 'ofipapelsl@ofipapelsl.com' where correo_remitente is null;

-- Pedidos y reclamaciones a proveedores (Rober): se envían y se reciben en compras@ofipapelsl.com. Cada correo de la
-- cola dice de qué buzón sale (buzon = 'general' | 'compras'); el de compras sale de «Enviar desde (Compras)» y las
-- respuestas vuelven a ese mismo buzón.
alter table public.empresa add column if not exists correo_remitente_compras text;
update public.empresa set correo_remitente_compras = 'compras@ofipapelsl.com' where correo_remitente_compras is null;
alter table public.correo_pendiente add column if not exists buzon text not null default 'general';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'correo_pendiente_buzon_chk') then
    alter table public.correo_pendiente add constraint correo_pendiente_buzon_chk check (buzon in ('general', 'compras'));
  end if;
end $$;

-- Reclamaciones a clientes por cobros (recibos devueltos, recordatorios, deudas): desde administracion@ofipapelsl.com
-- (Rober). Buzón «administracion»; los correos de la cola que vienen de cobros/devoluciones lo toman solos.
alter table public.empresa add column if not exists correo_remitente_administracion text;
update public.empresa set correo_remitente_administracion = 'administracion@ofipapelsl.com' where correo_remitente_administracion is null;
alter table public.correo_pendiente drop constraint if exists correo_pendiente_buzon_chk;
alter table public.correo_pendiente add constraint correo_pendiente_buzon_chk check (buzon in ('general', 'compras', 'administracion'));
create or replace function public.fn_correo_pendiente_buzon_trg() returns trigger language plpgsql as $$
begin
  if new.buzon = 'general' and (new.origen like 'devolucion:%' or new.origen in ('recordatorio_devoluciones') or new.origen like 'cobro%' or new.origen like 'reclamacion_cobro%') then
    new.buzon := 'administracion';
  end if;
  return new;
end $$;
create or replace trigger trg_correo_pendiente_buzon before insert on public.correo_pendiente for each row execute function public.fn_correo_pendiente_buzon_trg();
