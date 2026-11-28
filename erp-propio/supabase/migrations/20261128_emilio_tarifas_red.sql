-- Tarifas de E-milio: solo la carpeta de RED y con el nombre como lo pone Rober (28/11/2026: «el nombre del archivo
-- debe empezar por el nombre del proveedor. Por ejemplo, FAIBO TARIFA 2027 CANARIAS»; «mejor utilizar solamente la
-- carpeta que tenemos en red… para no tener duplicado»).
--
-- Nombre: PROVEEDOR + el nombre que traía el fichero, en mayúsculas.
--   · El proveedor sin «S.L.», «S.A.» ni lo que va entre paréntesis («SAM MANIPULADOS (Pacsa)» → «SAM MANIPULADOS»).
--   · Si el fichero ya empieza por el proveedor, no se repite.
--   · Si no dice «TARIFA», se le pone delante; si no lleva año, se le pone la fecha detrás.
--   «Tarifa 2027 Canarias.xlsx» de Faibo → «FAIBO TARIFA 2027 CANARIAS.xlsx»; «precios.csv» → «FAIBO TARIFA PRECIOS 2026-11-28.csv».

create or replace function public.fn_correo_nombre_tarifa()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_prov text;
  v_resto text;
  v_ext text;
begin
  if new.tipo <> 'tarifa' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.nombre_ordenado is not null and old.tipo = 'tarifa'
     and new.proveedor_codigo is not distinct from old.proveedor_codigo then
    return new;
  end if;
  select p.nombre into v_prov from proveedor p where p.codigo = new.proveedor_codigo;
  v_prov := coalesce(v_prov, new.lectura->>'proveedor_nombre', new.remitente_nombre, 'PROVEEDOR');
  v_prov := regexp_replace(v_prov, '\(.*$', '');
  v_prov := regexp_replace(v_prov, '[,\s]+(S\.?\s?L\.?\s?U?|S\.?\s?A\.?\s?U?|S\.?\s?C\.?|S\.?\s?L\.?\s?L\.?)\.?\s*$', '', 'i');
  v_prov := upper(trim(regexp_replace(regexp_replace(v_prov, '[\\/:*?"<>|]+', ' ', 'g'), '\s+', ' ', 'g')));
  v_prov := left(coalesce(nullif(v_prov, ''), 'PROVEEDOR'), 50);

  v_ext := lower(coalesce(substring(new.adjunto_nombre from '\.([A-Za-z0-9]{2,5})$'), 'pdf'));
  v_resto := regexp_replace(coalesce(new.adjunto_nombre, ''), '\.[A-Za-z0-9]{2,5}$', '');
  v_resto := upper(trim(regexp_replace(regexp_replace(v_resto, '[\\/:*?"<>|_]+', ' ', 'g'), '\s+', ' ', 'g')));
  if v_resto like v_prov || '%' then
    v_resto := trim(substr(v_resto, length(v_prov) + 1));
  end if;
  if v_resto !~ 'TARIF' then
    v_resto := trim('TARIFA ' || v_resto);
  end if;
  if v_resto !~ '(19|20)\d\d' then
    v_resto := v_resto || ' '
      || to_char(coalesce(new.documento_fecha, (coalesce(new.recibido_en, now()) at time zone 'Atlantic/Canary')::date), 'YYYY-MM-DD');
  end if;
  new.nombre_ordenado := left(v_prov || ' ' || v_resto, 150) || '.' || v_ext;
  if tg_op = 'UPDATE' and new.nombre_ordenado is distinct from old.nombre_ordenado then
    new.copiado_en := null;
    new.copia_ruta := null;
  end if;
  return new;
end $$;

update public.agente set que_hace = replace(que_hace,
  'el programa del PC las copia a la carpeta de tarifas de Rober y a la de red',
  'el programa del PC las copia a la carpeta de red «Tarifas proveedores», con el nombre del proveedor delante')
where codigo = 'correo_proveedores';

update public.agente_funcion set texto =
  'Reconozco las tarifas de precios que mandan los proveedores y las guardo en el ERP con su proveedor y su fecha, para que el Gestor de compras pida cada artículo al más barato. Además las copio a la carpeta de red «Tarifas proveedores», para que las consulte todo el mundo, siempre con el nombre del proveedor delante (por ejemplo, «FAIBO TARIFA 2027 CANARIAS»).',
  actualizado_en = now()
where agente = 'correo_proveedores' and texto like 'Reconozco las tarifas de precios%';

-- Filas de prueba de Claude Code (28/11/2026).
delete from public.correo_proveedor_documento where buzon = 'prueba' and mensaje_id like 'prueba-claude%';
