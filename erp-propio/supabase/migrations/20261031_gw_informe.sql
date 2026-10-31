-- Definiciones de los informes de GeminisWin (.FRX de Visual FoxPro), ya leídas a JSON:
-- bandas, campos con su expresión, textos, totales y variables. Material de referencia para
-- replicar los informes en el ERP; no lo usa ninguna pantalla. Se rellena con
-- scripts/geminiswin/leer_frx.py + cargar_informes.py (ver scripts/geminiswin/README.md).
create table if not exists public.gw_informe (
  fichero text primary key,              -- ruta relativa dentro de C:\geminisw\ (p. ej. LisartP1.FRX)
  nombre text not null,                  -- nombre sin extensión
  formato text not null,                 -- vfp (.frx) o foxpro2 (.f2x)
  impresora text,                        -- orientación y papel (ORIENTATION=1 = horizontal, PAPERSIZE=9 = A4)
  bandas jsonb not null default '[]',
  objetos jsonb not null default '[]',   -- {tipo, banda, texto|expr, formato, total, imprimir_si, fuente, vpos, hpos, ancho, alto}
  variables jsonb not null default '[]',
  datos jsonb not null default '[]',
  campos text[] not null default '{}',   -- expresiones de los campos del detalle, para buscar
  cargado_en timestamptz not null default now()
);
create index if not exists gw_informe_nombre on public.gw_informe (lower(nombre));
alter table public.gw_informe enable row level security;
create policy gw_informe_leer on public.gw_informe for select to authenticated using (true);
create policy gw_informe_escribir on public.gw_informe for all to authenticated
  using (public.fn_es_administrador()) with check (public.fn_es_administrador());
comment on table public.gw_informe is 'Informes de GeminisWin (.FRX) leídos a JSON, de referencia para replicarlos en el ERP (31/10/2026).';
