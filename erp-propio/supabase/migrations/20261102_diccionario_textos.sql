-- Diccionario de textos (Luis, 02/11/2026: «para cambiar las mayúsculas por minúsculas tienes que añadir un
-- diccionario tanto a la web como a la gestión»). Las descripciones de GeminisWin vienen en MAYÚSCULAS y sin
-- tildes («CALCULADORA CIENTIFICA Casio FX-991-SPCW»). fn_texto_natural las deja legibles
-- («Calculadora científica Casio FX-991-SPCW»):
--   · una palabra entera en MAYÚSCULAS se busca en el diccionario (con su punto, «CART.», y sin él): si está,
--     se escribe como diga (científica, tóner, HP, XL…); si no, en minúsculas;
--   · lo que ya está escrito en minúsculas o mezclado (Casio, Brother, (Negro)) no se toca;
--   · lo que lleva números (códigos de modelo, medidas: FX-991-SPCW, TN-421/423, 80x60, A-4) no se toca;
--   · la primera letra, en mayúscula.
-- Un solo diccionario para el ERP y la web (Archivo → Diccionario de textos).

create table if not exists public.diccionario_texto (
  palabra text primary key check (palabra = upper(palabra) and palabra <> ''),
  forma text not null check (btrim(forma) <> ''),
  tipo text not null default 'palabra' check (tipo in ('palabra', 'sigla', 'marca', 'abreviatura')),
  creado_por text default public.fn_empleado_actual(),
  actualizado_en timestamptz not null default now()
);
comment on table public.diccionario_texto is 'Cómo se escribe cada palabra al pasar las descripciones de MAYÚSCULAS a minúsculas (ERP y web).';
alter table public.diccionario_texto enable row level security;
drop policy if exists diccionario_texto_lee on public.diccionario_texto;
create policy diccionario_texto_lee on public.diccionario_texto for select to authenticated using (true);
drop policy if exists diccionario_texto_escribe on public.diccionario_texto;
create policy diccionario_texto_escribe on public.diccionario_texto for all to authenticated
  using (public.fn_es_administrador()) with check (public.fn_es_administrador());
drop trigger if exists trg_auditoria_diccionario_texto on public.diccionario_texto;
create trigger trg_auditoria_diccionario_texto after insert or update or delete on public.diccionario_texto
  for each row execute function public.fn_auditoria_trigger();

create or replace function public.fn_texto_natural(p_texto text)
returns text language plpgsql stable set search_path = public as $$
declare
  m text[]; partes text[]; pre text; nucleo text; post text; sale text; v_forma text; res text := '';
begin
  if p_texto is null then return null; end if;
  for m in select regexp_matches(p_texto, '(\S+)(\s*)', 'g') loop
    partes := regexp_match(m[1], '^([^[:alnum:]]*)(.*?)([^[:alnum:]]*)$');
    pre := coalesce(partes[1], ''); nucleo := coalesce(partes[2], ''); post := coalesce(partes[3], '');
    if nucleo = '' or nucleo ~ '[0-9]' or nucleo <> upper(nucleo) or nucleo !~ '[[:alpha:]]' then
      sale := m[1];
    else
      -- Primero con el punto de detrás («CART.» → cartucho), luego la palabra sola.
      v_forma := null;
      if left(post, 1) = '.' then
        select forma into v_forma from diccionario_texto where palabra = nucleo || '.';
        if v_forma is not null then post := substr(post, 2); end if;
      end if;
      if v_forma is null then select forma into v_forma from diccionario_texto where palabra = nucleo; end if;
      sale := pre || coalesce(v_forma, lower(nucleo)) || post;
    end if;
    res := res || sale || m[2];
  end loop;
  return upper(left(res, 1)) || substr(res, 2);
end $$;
grant execute on function public.fn_texto_natural(text) to authenticated, anon;

-- Palabras de partida (se amplían desde la pantalla).
insert into public.diccionario_texto (palabra, forma, tipo) values
 ('HP','HP','sigla'),('XL','XL','sigla'),('XXL','XXL','sigla'),('ESO','ESO','sigla'),('LED','LED','sigla'),('USB','USB','sigla'),
 ('PVC','PVC','sigla'),('DIN','DIN','sigla'),('TV','TV','sigla'),('CD','CD','sigla'),('DVD','DVD','sigla'),('RGB','RGB','sigla'),
 ('TSA','TSA','sigla'),('PC','PC','sigla'),('ABS','ABS','sigla'),('IGIC','IGIC','sigla'),('IVA','IVA','sigla'),('SD','SD','sigla'),
 ('HDMI','HDMI','sigla'),('UV','UV','sigla'),('ISO','ISO','sigla'),('PDF','PDF','sigla'),('NFC','NFC','sigla'),('OEM','OEM','sigla'),
 ('PVP','PVP','sigla'),('EVA','EVA','sigla'),('LCD','LCD','sigla'),('DNI','DNI','sigla'),('WIFI','wifi','palabra'),('ADSL','ADSL','sigla'),
 ('BIC','BIC','marca'),('UHU','UHU','marca'),('DYMO','DYMO','marca'),
 ('CART.','cartucho','abreviatura'),('INK-JET','ink-jet','palabra'),('TONER','tóner','palabra'),('LASER','láser','palabra'),
 ('CIENTIFICA','científica','palabra'),('CIENTIFICO','científico','palabra'),('PROYECCION','proyección','palabra'),('TRIPODE','trípode','palabra'),
 ('LAPIZ','lápiz','palabra'),('LAPICES','lápices','palabra'),('CALCULO','cálculo','palabra'),('TERMICO','térmico','palabra'),('TERMICA','térmica','palabra'),
 ('CARTON','cartón','palabra'),('CLASIFICACION','clasificación','palabra'),('CORRECCION','corrección','palabra'),('EXPEDICION','expedición','palabra'),
 ('SEÑALIZACION','señalización','palabra'),('COMUNICACION','comunicación','palabra'),('OFIMATICA','ofimática','palabra'),('INFORMATICA','informática','palabra'),
 ('MAQUINA','máquina','palabra'),('MAQUINAS','máquinas','palabra'),('BOLIGRAFO','bolígrafo','palabra'),('BOLIGRAFOS','bolígrafos','palabra'),
 ('PAPELERIA','papelería','palabra'),('TELEFONO','teléfono','palabra'),('TELEFONIA','telefonía','palabra'),('ELECTRICO','eléctrico','palabra'),
 ('ELECTRICA','eléctrica','palabra'),('ELECTRONICO','electrónico','palabra'),('ELECTRONICA','electrónica','palabra'),('AUTOMATICO','automático','palabra'),
 ('AUTOMATICA','automática','palabra'),('MAGNETICO','magnético','palabra'),('MAGNETICA','magnética','palabra'),('PLASTICO','plástico','palabra'),
 ('PLASTICA','plástica','palabra'),('METRICA','métrica','palabra'),('METRICO','métrico','palabra'),('MOVIL','móvil','palabra'),('ALBUM','álbum','palabra'),
 ('ALBUMES','álbumes','palabra'),('INDICE','índice','palabra'),('INDICES','índices','palabra'),('ACORDEON','acordeón','palabra'),('CAJON','cajón','palabra'),
 ('NUMERO','número','palabra'),('NUMEROS','números','palabra'),('GRAFICO','gráfico','palabra'),('GRAFICA','gráfica','palabra'),('TECNICO','técnico','palabra'),
 ('TECNICA','técnica','palabra'),('TECNICAS','técnicas','palabra'),('ESCALIMETRO','escalímetro','palabra'),('ESCALIMETROS','escalímetros','palabra'),
 ('BATERIA','batería','palabra'),('BATERIAS','baterías','palabra'),('ACRILICO','acrílico','palabra'),('ACRILICA','acrílica','palabra'),
 ('METALICO','metálico','palabra'),('METALICA','metálica','palabra'),('ECONOMICO','económico','palabra'),('ECOLOGICO','ecológico','palabra'),
 ('PAGINA','página','palabra'),('PAGINAS','páginas','palabra'),('CODIGO','código','palabra'),('CODIGOS','códigos','palabra'),('FACIL','fácil','palabra'),
 ('MULTIFUNCION','multifunción','palabra'),('ENCUADERNACION','encuadernación','palabra'),('PLASTIFICACION','plastificación','palabra'),
 ('ROTULACION','rotulación','palabra'),('ORGANIZACION','organización','palabra'),('SUJECION','sujeción','palabra'),('PROTECCION','protección','palabra'),
 ('DECORACION','decoración','palabra'),('IMPRESION','impresión','palabra'),('CONEXION','conexión','palabra'),('INSTALACION','instalación','palabra'),
 ('REPARACION','reparación','palabra'),('CARTABON','cartabón','palabra'),('COMPAS','compás','palabra'),('LAMINA','lámina','palabra'),('LAMINAS','láminas','palabra'),
 ('TEMPERA','témpera','palabra'),('OLEO','óleo','palabra'),('CERAMICA','cerámica','palabra'),('RAPIDO','rápido','palabra'),('RAPIDA','rápida','palabra'),
 ('UNICO','único','palabra'),('UNICA','única','palabra'),('BASICO','básico','palabra'),('BASICA','básica','palabra'),('CLASICO','clásico','palabra'),
 ('CLASICA','clásica','palabra'),('PRACTICO','práctico','palabra'),('MAXIMO','máximo','palabra'),('MINIMO','mínimo','palabra'),('DIAMETRO','diámetro','palabra'),
 ('ANGULO','ángulo','palabra'),('MARRON','marrón','palabra'),('FOTOGRAFICO','fotográfico','palabra'),('FOTOGRAFICA','fotográfica','palabra'),
 ('SILLON','sillón','palabra'),('ESTANTERIA','estantería','palabra'),('IMAN','imán','palabra'),('CUADRICULA','cuadrícula','palabra'),
 ('BIOLOGIA','biología','palabra'),('MATEMATICAS','matemáticas','palabra'),('MUSICA','música','palabra'),('EDUCACION','educación','palabra'),
 ('CAFE','café','palabra'),('CAMARA','cámara','palabra'),('ESPAÑOL','español','palabra'),('ESPAÑOLA','española','palabra')
on conflict (palabra) do nothing;

-- Segunda parte (aplicada como «diccionario_textos_2»): abreviaturas con punto escritas como sea («Cart.»)
-- y fn_diccionario_pendientes(p_limite): las palabras en MAYÚSCULAS de los artículos que aún no están en el
-- diccionario, las más repetidas primero (Archivo → Diccionario de textos → Palabras por revisar).
create or replace function public.fn_texto_natural(p_texto text)
returns text language plpgsql stable set search_path = public as $$
declare
  m text[]; partes text[]; pre text; nucleo text; post text; sale text; v_forma text; res text := '';
begin
  if p_texto is null then return null; end if;
  for m in select regexp_matches(p_texto, '(\S+)(\s*)', 'g') loop
    partes := regexp_match(m[1], '^([^[:alnum:]]*)(.*?)([^[:alnum:]]*)$');
    pre := coalesce(partes[1], ''); nucleo := coalesce(partes[2], ''); post := coalesce(partes[3], '');
    v_forma := null;
    if nucleo <> '' and nucleo !~ '[0-9]' and left(post, 1) = '.' then
      select forma into v_forma from diccionario_texto where palabra = upper(nucleo) || '.';
      if v_forma is not null then post := substr(post, 2); end if;
    end if;
    if v_forma is not null then
      sale := pre || v_forma || post;
    elsif nucleo = '' or nucleo ~ '[0-9]' or nucleo <> upper(nucleo) or nucleo !~ '[[:alpha:]]' then
      sale := m[1];
    else
      select forma into v_forma from diccionario_texto where palabra = nucleo;
      sale := pre || coalesce(v_forma, lower(nucleo)) || post;
    end if;
    res := res || sale || m[2];
  end loop;
  return upper(left(res, 1)) || substr(res, 2);
end $$;

create or replace function public.fn_diccionario_pendientes(p_limite integer default 200)
returns table (palabra text, veces bigint, ejemplo text, propuesta text)
language sql stable security definer set search_path = public as $$
  with t as (
    select a.descripcion, (regexp_matches(a.descripcion, '([[:alpha:]][[:alpha:]-]{2,})', 'g'))[1] w
      from articulo a where a.descripcion is not null)
  select w, count(*), min(descripcion), lower(w)
    from t
   where w = upper(w) and w ~ '[[:alpha:]]{3,}'
     and not exists (select 1 from diccionario_texto d where d.palabra = t.w)
   group by w
   order by count(*) desc, w
   limit greatest(1, least(coalesce(p_limite, 200), 1000))
$$;
grant execute on function public.fn_diccionario_pendientes(integer) to authenticated;
revoke execute on function public.fn_diccionario_pendientes(integer) from anon;
