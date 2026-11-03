-- Catálogo de productos para Guanxe (tarea 21; Luis, 04/11/2026). Guanxe pide un CSV en una dirección fija que
-- ellos descargan: 1 vez al día para altas de productos y 3 veces al día para stock y precios.
--
-- Cómo funciona:
--  · La función del servidor «guanxe-catalogo» lee la tienda WooCommerce de ofipapel.net (SOLO LECTURA, mismas claves que
--    «woocommerce-erp»), arma products.csv y lo guarda en el almacén privado «guanxe».
--  · pg_cron lo regenera 4 veces al día (05:40, 10:40, 14:40 y 18:40 UTC), antes de las descargas de Guanxe.
--  · Guanxe descarga con: https://sufxvpiwcncnyltrvoun.supabase.co/functions/v1/guanxe-catalogo/products.csv?clave=…
--    La clave vive SOLO en la base de datos (tabla integracion_externa, sin acceso desde el navegador); nunca en el
--    repositorio. Para cambiarla: update integracion_externa set clave = … where nombre = 'guanxe'.
--  · Ajustes (columna ajustes): recargo_pct (precio Guanxe = precio web × (1 + recargo/100)), excluir_categorias
--    (ids de categorías WooCommerce que no se envían) y stock_sin_control (cantidad que se manda cuando el producto
--    está «en stock» en la web pero sin control de existencias).

create table if not exists public.integracion_externa (
  nombre text primary key,
  clave text not null,
  activa boolean not null default true,
  ajustes jsonb not null default '{}'::jsonb,
  ultima_generacion timestamptz,
  ultimo_resultado text,
  ultima_descarga timestamptz,
  descargas integer not null default 0
);
alter table public.integracion_externa enable row level security;
-- Sin políticas: solo el servidor (service_role) la lee. La pantalla la consulta con fn_integracion_estado.
revoke all on public.integracion_externa from anon, authenticated;

create trigger trg_auditoria_integracion_externa after insert or delete or update of clave, activa, ajustes
  on public.integracion_externa for each row execute function fn_auditoria_trigger();
insert into public.auditoria_vigilada (tabla, desde) values ('integracion_externa', now()) on conflict do nothing;

insert into public.integracion_externa (nombre, clave, ajustes)
values ('guanxe', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
        '{"recargo_pct": 0, "excluir_categorias": [], "stock_sin_control": 0}'::jsonb)
on conflict (nombre) do nothing;

-- Estado para el ERP (sin la clave salvo para la gerencia).
create or replace function public.fn_integracion_estado(p_nombre text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('activa', activa, 'ajustes', ajustes, 'ultima_generacion', ultima_generacion,
           'ultimo_resultado', ultimo_resultado, 'ultima_descarga', ultima_descarga, 'descargas', descargas)
  from integracion_externa where nombre = p_nombre and auth.uid() is not null
$$;
revoke execute on function public.fn_integracion_estado(text) from public, anon;
grant execute on function public.fn_integracion_estado(text) to authenticated;

insert into storage.buckets (id, name, public) values ('guanxe', 'guanxe', false) on conflict (id) do nothing;

-- Regenerar el CSV 4 veces al día (la función comprueba la clave en la cabecera x-clave).
select cron.schedule('erp_guanxe_catalogo', '40 5,10,14,18 * * *', $cron$
  select net.http_post(url := 'https://sufxvpiwcncnyltrvoun.supabase.co/functions/v1/guanxe-catalogo/generar',
         body := '{}'::jsonb, timeout_milliseconds := 300000,
         headers := jsonb_build_object('Content-Type', 'application/json',
                    'x-clave', (select clave from public.integracion_externa where nombre = 'guanxe')))
  where exists (select 1 from public.integracion_externa where nombre = 'guanxe' and activa)
$cron$);
