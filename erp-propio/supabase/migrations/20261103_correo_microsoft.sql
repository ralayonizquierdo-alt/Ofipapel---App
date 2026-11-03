-- Correo del ERP por Microsoft 365 (Rober, 03/11/2026): la misma conexión (app de Azure con Mail.Send) que la app de
-- Devoluciones. Las claves son secretos de las funciones (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET).
-- Desde qué buzón sale y a dónde van las respuestas se elige en Archivo → Datos de Empresa. De momento el buzón
-- general; cuando se cree una dirección propia del ERP, se cambia ahí sin tocar el programa.
alter table public.empresa add column if not exists correo_remitente text;
alter table public.empresa add column if not exists correo_responder_a text;
update public.empresa set correo_remitente = 'ofipapelsl@ofipapelsl.com' where correo_remitente is null;
