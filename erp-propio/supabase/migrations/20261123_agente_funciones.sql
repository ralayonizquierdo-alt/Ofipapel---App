-- Funciones de los agentes en el ERP, no escritas en el hub (Rober, 23/11/2026: «en un futuro tendremos que ir quitándole
-- tareas a algunos a medida que vayamos utilizando más el ERP y no se necesiten tantos apaños»).
-- · agente.intro y agente_funcion: lo que dice la ficha de cada agente. El hub (inicio.html) lo lee con
--   fn_agente_funciones_publico (anon, solo textos y si está activa). Si no contesta, enseña lo que tiene escrito.
-- · Encender o apagar una función: fn_agente_funcion_activar (administradores; NEXA nivel 2). En Virgilio es el mismo
--   interruptor que usa en sus pasadas (fn_virgilio_activa, columna clave), así que la ficha y lo que hace van a la par.
-- · Quitar una función que ya no hace falta: fn_agente_funcion_quitar (deja de salir; queda en la tabla con quitada_en).
-- · Whacimara (el bot de WhatsApp, en otro servidor) se da de alta en agente solo para su ficha y para que NEXA la conozca.

alter table public.agente add column if not exists intro text;

insert into public.agente (codigo, nombre, que_hace, funcion, cada, permiso, ordenes, activo)
values ('whatsapp_bot', 'Whacimara', 'Atiende el WhatsApp de Ofipapel a cualquier hora (servidor del bot, sitio spontaneous-lebkuchen). '
        || 'Se maneja desde su panel, no desde el ERP.', null, 'siempre (servidor del bot)', null, array[]::text[], true)
on conflict (codigo) do update set nombre = excluded.nombre, que_hace = excluded.que_hace;

create table if not exists public.agente_funcion (
  agente text not null references public.agente(codigo),
  orden smallint not null,
  texto text not null,
  activa boolean not null default true,
  clave text,
  quitada_en timestamptz,
  actualizado_en timestamptz not null default now(),
  primary key (agente, orden)
);
comment on table public.agente_funcion is 'Funciones de cada agente tal como salen en su ficha del hub; activa = funciona hoy. clave: interruptor interno (Virgilio).';
alter table public.agente_funcion enable row level security;
do $$
begin
  if not exists (select 1 from pg_policy where polname = 'agente_funcion_lee') then
    create policy agente_funcion_lee on public.agente_funcion for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_auditoria_agente_funcion') then
    create trigger trg_auditoria_agente_funcion after insert or update on public.agente_funcion
      for each row execute function public.fn_auditoria_trigger();
  end if;
end $$;
revoke all on public.agente_funcion from anon;

update public.agente set intro = '¡Hola! Soy E-milio, el agente del correo de Ofipapel. Leo los e-mails de los proveedores para que nadie tenga que abrirlos uno a uno.' where codigo = 'correo_proveedores';
update public.agente set intro = '¡Hola! Soy Whacimara, quien atiende el WhatsApp de Ofipapel. Contesto a los clientes a cualquier hora, también en inglés.' where codigo = 'whatsapp_bot';
update public.agente set intro = '¡Hola! Soy Virgilio, el vigilante de Ofipapel. Vigilo lo que me pedís día y noche y aviso a quien le toca, sin que nadie tenga que estar mirando.' where codigo = 'vigilante';
update public.agente set intro = '¡Hola! Soy Geminio, el agente que trabaja dentro de GeminisWin desde el PC de Rober. Saco los listados y preparo los pedidos de informática para que nadie tenga que hacerlo a mano.' where codigo = 'geminis_pc';

insert into public.agente_funcion (agente, orden, texto, activa, clave) values
  ('correo_proveedores', 1, 'Vigilo el buzón de compras día y noche, cada 10 minutos. Solo leo: no borro, no muevo y no contesto a nadie.', true, null),
  ('correo_proveedores', 2, 'Cojo los PDF de los proveedores y digo qué son: propuesta o confirmación de pedido, factura o albarán.', true, null),
  ('correo_proveedores', 3, 'Reconozco al proveedor y busco su pedido, se hiciera en el ERP o en GeminisWin.', true, null),
  ('correo_proveedores', 4, 'Cruzo cada documento con su pedido, línea a línea, con IA: aviso de lo que falta, viene sin stock, de menos o de más, o cambia de precio por encima del margen.', true, null),
  ('correo_proveedores', 5, 'Preparo las facturas finales con su nombre ordenado y las copio a la carpeta de facturas de proveedores.', false, null),
  ('correo_proveedores', 6, 'Lo dejo todo en el Gestor de Pedidos 2.0 → «Correo de proveedores». Yo preparo; decidís vosotros. Me manda NEXA.', true, null),
  ('whatsapp_bot', 1, 'Contesto al momento los WhatsApp de los clientes, de día y de noche: horarios, tiendas, teléfonos, cómo registrarse en la web…', true, null),
  ('whatsapp_bot', 2, 'Miro en la web de Ofipapel el precio y si hay stock del artículo que me preguntan.', true, null),
  ('whatsapp_bot', 3, 'Digo qué cartucho o tóner lleva cada impresora y si lo tenemos.', true, null),
  ('whatsapp_bot', 4, 'Cuento cómo va un pedido de la web, comprobando antes que quien pregunta es su dueño.', true, null),
  ('whatsapp_bot', 5, 'Leo las fotos que me mandan (una lista de material, una etiqueta…) y busco lo que piden.', true, null),
  ('whatsapp_bot', 6, 'Si alguien prefiere hablar con una persona, o veo que no puedo ayudarle, le paso con el equipo y me aparto.', true, null),
  ('whatsapp_bot', 7, 'Aprendo lo que me enseñáis en «Aprendizaje del bot»: lo que me apuntáis allí manda sobre lo que yo creía saber.', true, null),
  ('vigilante', 1, '1. Peticiones de clientes que ya han llegado (resueltas) y están sin imprimir, para que el almacén las prepare y las ponga en reparto.', true, 'resueltas'),
  ('vigilante', 2, '2. Presupuestos sin seguimiento en 7 días, a su comercial.', false, 'presupuestos'),
  ('vigilante', 3, '3. Que el sistema funcione: el espejo de GeminisWin, las tareas automáticas y E-milio. Si algo se para, aviso.', true, 'sistema'),
  ('vigilante', 4, '4. Pedidos a proveedor retrasados.', false, 'retrasados'),
  ('vigilante', 5, '5. Facturas de proveedor con diferencias y documentos de E-milio sin revisar.', false, 'correo'),
  ('vigilante', 6, '6. Clientes que pasan su límite de riesgo.', false, 'riesgo'),
  ('vigilante', 7, '7. Recibos vencidos sin cobrar.', false, 'recibos'),
  ('vigilante', 8, '8. Cuadre de ventas y cobros entre el ERP y GeminisWin, día a día (cuenta en cuanto el ERP empiece a vender).', true, 'cuadre'),
  ('vigilante', 9, '9. Lo que cada uno me pida a través de NEXA: «avísame cuando llegue el pedido de…», «cuando haya stock de…», «cuando este cliente compre».', true, 'personales'),
  ('vigilante', 10, 'Aviso con un globo rojo en la pantalla y con una tarea en «Mis tareas pendientes» del ERP, que se cierra sola cuando está hecho. Nada de correos. Solo miro y aviso: nunca cambio nada. Me manda NEXA.', true, null),
  ('geminis_pc', 1, '1. Cada día laborable a las 9:50 subo a Finanzas las ventas por caja y los pedidos sin actualizar del día.', true, null),
  ('geminis_pc', 2, '2. El día 10 saco el Excel completo de GeminisWin del mes anterior: lo guardo en LISTADOS AUTOMATIZADOS, lo envío por correo y lo subo a Finanzas.', true, null),
  ('geminis_pc', 3, '3. El día 20 saco las ventas por vendedor.', true, null),
  ('geminis_pc', 4, '4. El último día laborable del mes saco los pedidos a proveedor sin actualizar.', true, null),
  ('geminis_pc', 5, '5. Los lunes saco los tres inventarios semanales (04, Aliz-1 y Aliz-2). En pausa hasta el 01/12.', false, null),
  ('geminis_pc', 6, '6. Guardo una copia de cada listado en un archivo cifrado. Falla desde el 09/11: pendiente de arreglar.', false, null),
  ('geminis_pc', 7, '7. Cuando Rober me lo pide, genero el pedido semanal de informática con las ventas de domingo a domingo.', true, null),
  ('geminis_pc', 8, '8. Cuando Rober me lo pide, importo en GeminisWin los pedidos de informática de UFP, EXADI e INFORPOR, imprimo las hojas de control y archivo los ficheros.', true, null),
  ('geminis_pc', 9, '9. Si alguien necesita un dato de GeminisWin que no está en el ERP, se lo pide a NEXA y yo lo saco de GeminisWin y se lo dejo. Lo que ya está en el ERP, NEXA lo ve sin pedírmelo.', false, null),
  ('geminis_pc', 10, 'Trabajo en el PC de Rober: si está apagado, ese día no puedo hacer nada, y Virgilio avisa. Me manda NEXA.', true, null)
on conflict (agente, orden) do nothing;

-- Para el hub (sin sesión): intro y funciones vivas de un agente. Solo textos descriptivos.
create or replace function public.fn_agente_funciones_publico(p_agente text)
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select case when a.codigo is null then null else jsonb_build_object(
    'intro', a.intro,
    'funciones', coalesce((select jsonb_agg(jsonb_build_object('t', f.texto, 'activa', f.activa) order by f.orden)
                             from agente_funcion f where f.agente = a.codigo and f.quitada_en is null), '[]'::jsonb)) end
  from (select 1) x left join agente a on a.codigo = p_agente
$$;
revoke all on function public.fn_agente_funciones_publico(text) from public;
grant execute on function public.fn_agente_funciones_publico(text) to anon, authenticated;

-- Encender / apagar una función (por su número en la ficha).
create or replace function public.fn_agente_funcion_activar(p_agente text, p_orden integer, p_activa boolean)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare f agente_funcion;
begin
  if not fn_es_administrador() then raise exception 'Solo un administrador puede encender o apagar funciones de los agentes.' using errcode = '42501'; end if;
  update agente_funcion set activa = p_activa, actualizado_en = now()
   where agente = p_agente and orden = p_orden and quitada_en is null returning * into f;
  if not found then raise exception 'El agente % no tiene la función %.', p_agente, p_orden; end if;
  return jsonb_build_object('ok', true, 'aviso', format('Función %s de %s %s. La ficha del hub ya lo enseña.', p_orden,
         (select nombre from agente where codigo = p_agente), case when p_activa then 'activada' else 'desactivada' end));
end $$;
revoke all on function public.fn_agente_funcion_activar(text, integer, boolean) from public, anon;
grant execute on function public.fn_agente_funcion_activar(text, integer, boolean) to authenticated;

-- Quitar una función que ya no hace falta (el ERP ya lo hace solo). Deja de salir en la ficha.
create or replace function public.fn_agente_funcion_quitar(p_agente text, p_orden integer)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  if not fn_es_administrador() then raise exception 'Solo un administrador puede quitar funciones de los agentes.' using errcode = '42501'; end if;
  update agente_funcion set quitada_en = now(), activa = false, actualizado_en = now()
   where agente = p_agente and orden = p_orden and quitada_en is null;
  if not found then raise exception 'El agente % no tiene la función %.', p_agente, p_orden; end if;
  return jsonb_build_object('ok', true, 'aviso', 'Función quitada: ya no sale en su ficha.');
end $$;
revoke all on function public.fn_agente_funcion_quitar(text, integer) from public, anon;
grant execute on function public.fn_agente_funcion_quitar(text, integer) to authenticated;

-- Virgilio: su interruptor pasa a ser la ficha (agente_funcion.activa por clave). El parámetro vigilante.desactivadas
-- queda sin uso.
create or replace function public.fn_virgilio_activa(p_vigilancia text)
returns boolean language sql stable set search_path to 'public', 'pg_temp' as $$
  select coalesce((select f.activa and f.quitada_en is null from agente_funcion f where f.agente = 'vigilante' and f.clave = p_vigilancia), true)
$$;
update public.parametro set descripcion = 'SIN USO desde el 23/11/2026: las funciones de Virgilio se encienden y apagan en agente_funcion (fn_agente_funcion_activar).'
 where clave = 'vigilante.desactivadas';

insert into public.nexa_operacion (codigo, descripcion, tipo, objeto, accion, nivel, permiso, bloqueada, notas)
values ('funcion:fn_agente_funcion_activar', 'Encender o apagar una función de un agente (sale así en su ficha del hub)', 'funcion', 'fn_agente_funcion_activar', '*', 2, null, false,
        'p_agente: correo_proveedores (E-milio), whatsapp_bot (Whacimara), vigilante (Virgilio), geminis_pc (Geminio); p_orden: el número de la función en la ficha.'),
       ('funcion:fn_agente_funcion_quitar', 'Quitar una función de un agente que ya no hace falta', 'funcion', 'fn_agente_funcion_quitar', '*', 2, null, false, null),
       ('funcion:fn_agente_funciones_publico', 'Funciones de un agente (las de su ficha)', 'funcion', 'fn_agente_funciones_publico', '*', 1, null, false, null)
on conflict (codigo) do update set descripcion = excluded.descripcion, nivel = excluded.nivel, bloqueada = false, notas = excluded.notas;
