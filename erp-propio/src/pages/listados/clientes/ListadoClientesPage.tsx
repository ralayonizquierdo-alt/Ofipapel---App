import { useState } from 'react'
import {
  BotonOpcion,
  CampoCodigo,
  GrupoRango,
  LST_INPUT,
  LstGrupo,
  ListadoVentana,
  describirPar,
  describirRango,
  par,
  rango,
  rangoSql,
  useInforme,
  type ColumnaInforme,
  type Destino,
  type Par,
  type Rango,
} from '../../../components/gw/GwListado'
import { rpc } from '../comun'
import { ErrorListado } from './comunClientes'

// Clientes → impresora de la ficha / Clientes → Listados → List. de Clientes: ventana «Listados de
// Clientes» calcada de GeminisWin (capturas ZIP 7, nº 63-66, 04/11/2026). Cálculo en
// fn_lst_clientes_gw (migración 20261104_informes_listados_gw.sql); columnas de cada informe
// sacadas de su .FRX de GeminisWin (tabla gw_informe): liscli2 (Simplificado), liscli
// (Desglosado), liscli4 (Cuentas Contables), liscliar (Artículos por Cliente), lisCli3 (Clientes
// con Artículos Asignados). «Fichas de los clientes» queda pendiente.

const INFORMES = [
  { value: 'desglosado', label: 'Listado Desglosado' },
  { value: 'fichas', label: 'Fichas de los clientes', disabled: true, title: 'Pendiente: ficha completa de cada cliente (una por hoja). De momento, la ficha se imprime desde Clientes.' },
  { value: 'resumido', label: 'Listado Resumido' },
  { value: 'simplificado', label: 'Listado Simplificado' },
  { value: 'cuentas', label: 'Listado con las Cuentas Contables' },
  { value: 'forma_pago', label: 'Listado por forma de Pago' },
  { value: 'articulos_cliente', label: 'Artículos por Cliente' },
  { value: 'clientes_articulo', label: 'Clientes por Artículo' },
  { value: 'con_articulos', label: 'Clientes con Artículos Asignados' },
  { value: 'tipo', label: 'Listado según el tipo de cliente' },
  { value: 'contactos_cliente', label: 'Listado de Contactos de la Agenda por Cliente' },
  { value: 'clientes_contacto', label: 'Listado de Clientes por Contactos de la Agenda' },
  { value: 'clientes_tipo_contacto', label: 'Listado de Clientes por el Tipo de Contacto de la Agenda' },
]

// La lista de GeminisWin tiene barra de desplazamiento: estos son los campos que se ven en la captura.
const ORDENES = [
  { value: 'codigo', label: 'Idcliente' },
  { value: 'nombre', label: 'Nombre' },
  { value: 'razon_social', label: 'Razonsoc' },
  { value: 'nif', label: 'Nif' },
  { value: 'fecha_nacimiento', label: 'F_nacim' },
  { value: 'gerente', label: 'Gerente' },
  { value: 'codigo_barras', label: 'Cod_barras' },
]

/** Campos de la ficha para «Filtrar Según Campos» (los mismos que acepta lst_campo_cli). */
const CAMPOS_FICHA: { value: string; label: string; tipo?: 'fecha' | 'num' }[] = [
  { value: 'fecha_alta', label: 'Fecha Alta', tipo: 'fecha' },
  { value: 'fecha_baja', label: 'Fecha Baja', tipo: 'fecha' },
  { value: 'fecha_ultima_venta', label: 'Fecha Última Venta', tipo: 'fecha' },
  { value: 'fecha_nacimiento', label: 'Fecha Nacimiento', tipo: 'fecha' },
  { value: 'nombre', label: 'Nombre' },
  { value: 'razon_social', label: 'Razón Social' },
  { value: 'nif', label: 'Nif' },
  { value: 'contacto', label: 'Contacto' },
  { value: 'gerente', label: 'Gerente' },
  { value: 'poblacion', label: 'Población' },
  { value: 'provincia_codigo', label: 'Provincia' },
  { value: 'codigo_postal', label: 'Código Postal' },
  { value: 'actividad', label: 'Actividad' },
  { value: 'vendedor_codigo', label: 'Vendedor' },
  { value: 'email', label: 'Email' },
  { value: 'limite_deuda', label: 'Límite de Deuda', tipo: 'num' },
  { value: 'deuda_actual', label: 'Deuda Actual', tipo: 'num' },
]

const CAMPOS_AGENDA: { value: string; label: string }[] = [
  { value: 'nombre', label: 'Nombre' },
  { value: 'tipo_contacto_codigo', label: 'Tipo de Contacto' },
  { value: 'descripcion', label: 'Descripción' },
  { value: 'telefono_fijo', label: 'Teléfono' },
  { value: 'telefono_movil', label: 'Móvil' },
  { value: 'email', label: 'Email' },
]

type ModoCampo = 'no' | 'igual' | 'contiene' | 'desdeHasta'
interface FiltroCampo {
  campo: string
  modo: ModoCampo
  desde: string
  hasta: string
}
const filtroCampo = (campo: string): FiltroCampo => ({ campo, modo: 'no', desde: '', hasta: '' })

/** 'dd/mm/aaaa' → 'aaaa-mm-dd' (los campos fecha se comparan en ISO). */
function aIso(v: string) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(v.trim())
  if (!m) return v.trim()
  const a = m[3].length === 2 ? `20${m[3]}` : m[3]
  return `${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

function sqlCampo(f: FiltroCampo, campos: { value: string; tipo?: 'fecha' | 'num' }[]) {
  const t = campos.find((c) => c.value === f.campo)?.tipo
  const conv = (v: string) => (t === 'fecha' ? aIso(v) : t === 'num' ? v.replace(/\./g, '').replace(',', '.').trim() : v.trim())
  return { campo: f.campo, modo: f.modo, desde: conv(f.desde), hasta: conv(f.hasta), num: t === 'num' }
}

function describirCampo(f: FiltroCampo, campos: { value: string; label: string }[], prefijo = '') {
  if (f.modo === 'no') return null
  const l = `${prefijo}${campos.find((c) => c.value === f.campo)?.label ?? f.campo}`
  if (f.modo === 'igual') return `${l} igual a ${f.desde}`
  if (f.modo === 'contiene') return `${l} contiene «${f.desde}»`
  return `${l}: desde ${f.desde || '…'} hasta ${f.hasta || '…'}`
}

/** «Filtrar Según Campos» / «Filtrar según campos de la Agenda»: campo, condición y valores. */
function GrupoCampo({
  titulo,
  multiple,
  campos,
  valor,
  onChange,
}: {
  titulo: string
  multiple?: boolean
  campos: { value: string; label: string; tipo?: 'fecha' | 'num' }[]
  valor: FiltroCampo
  onChange: (f: FiltroCampo) => void
}) {
  const set = (p: Partial<FiltroCampo>) => onChange({ ...valor, ...p })
  const fecha = campos.find((c) => c.value === valor.campo)?.tipo === 'fecha'
  return (
    <LstGrupo
      titulo={
        <span className="flex items-center gap-6">
          <span>{titulo}</span>
          {multiple && (
            <span className="text-[16px] text-[#1a3fd6]" title="Varias condiciones de agenda a la vez: pendiente (de momento, una)">
              Múltiple
            </span>
          )}
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-x-2 gap-y-[6px] pt-[2px]">
        <select className={LST_INPUT} value={valor.campo} onChange={(e) => set({ campo: e.target.value, desde: '', hasta: '' })}>
          {campos.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select className={LST_INPUT} value={valor.modo} onChange={(e) => set({ modo: e.target.value as ModoCampo })}>
          <option value="no">No Filtrar</option>
          <option value="igual">Igual a</option>
          <option value="contiene">Contiene</option>
          <option value="desdeHasta">Desde/Hasta</option>
        </select>
        <CampoCodigo
          valor={valor.desde}
          onChange={(v) => set({ desde: v })}
          disabled={valor.modo === 'no'}
          className="flex-1"
          title={fecha ? 'Fecha dd/mm/aaaa' : 'Valor / desde'}
        />
        <CampoCodigo
          valor={valor.hasta}
          onChange={(v) => set({ hasta: v })}
          disabled={valor.modo !== 'desdeHasta'}
          className="flex-1"
          title={fecha ? 'Fecha dd/mm/aaaa' : 'Hasta'}
        />
      </div>
    </LstGrupo>
  )
}

interface Filtros {
  clientes: Rango
  tipos: Rango
  zonas: Rango
  rutas: Rango
  formasPago: Rango
  tarifas: Rango
  tipoVenta: string
  dc: string
  tipoFactura: string
  activos: Par
  bloqueados: Par
  genericos: Par
  web: Par
  agenda: FiltroCampo
  campo1: FiltroCampo
  campo2: FiltroCampo
}

const inicial = (): Filtros => ({
  clientes: rango(),
  tipos: rango(),
  zonas: rango(),
  rutas: rango(),
  formasPago: rango(),
  tarifas: rango(),
  tipoVenta: '',
  dc: '',
  tipoFactura: '',
  activos: { si: true, no: false },
  bloqueados: par(),
  genericos: par(),
  web: par(),
  agenda: filtroCampo('nombre'),
  campo1: filtroCampo('fecha_alta'),
  campo2: filtroCampo('fecha_alta'),
})

function columnasDe(informe: string): { columnas: ColumnaInforme[]; apaisado?: boolean } {
  const cod: ColumnaInforme = { key: 'clave', titulo: 'Código', ancho: 60 }
  switch (informe) {
    case 'desglosado':
      return {
        apaisado: true,
        columnas: [
          cod,
          { key: 'c1', titulo: 'Nif', ancho: 80 },
          { key: 'c2', titulo: 'Nombre' },
          { key: 'c3', titulo: 'Razón Social' },
          { key: 'c4', titulo: 'Teléfono', ancho: 110 },
          { key: 'c5', titulo: 'Fax', ancho: 80 },
          { key: 'c6', titulo: 'Contacto', ancho: 110 },
          { key: 'c7', titulo: 'Gerente', ancho: 110 },
          { key: 'c8', titulo: 'Tar.', ancho: 30 },
        ],
      }
    case 'resumido':
      return {
        columnas: [cod, { key: 'c1', titulo: 'Nombre' }, { key: 'c2', titulo: 'Nif', ancho: 80 }, { key: 'c3', titulo: 'Población', ancho: 110 }, { key: 'c4', titulo: 'Teléfono', ancho: 110 }],
      }
    case 'cuentas':
      return {
        apaisado: true,
        columnas: [
          cod,
          { key: 'c1', titulo: 'Nombre' },
          { key: 'c2', titulo: 'Cuenta 430', ancho: 90 },
          { key: 'c3', titulo: 'Cuenta 700', ancho: 90 },
          { key: 'c4', titulo: 'Cuenta 431', ancho: 90 },
          { key: 'c5', titulo: 'Cuenta 4315', ancho: 90 },
          { key: 'c6', titulo: 'Cuenta 572', ancho: 90 },
        ],
      }
    case 'forma_pago':
    case 'tipo':
      return {
        columnas: [cod, { key: 'c1', titulo: 'Nombre' }, { key: 'c2', titulo: 'Teléfono', ancho: 110 }, { key: 'c3', titulo: 'Población', ancho: 110 }, { key: 'c4', titulo: 'Tarifa', ancho: 40 }, { key: 'n', titulo: 'Nº', tipo: 'entero', ancho: 35 }],
      }
    case 'articulos_cliente':
      return {
        columnas: [
          { key: 'clave', titulo: 'Código', ancho: 90 },
          { key: 'c1', titulo: 'Descripción' },
          { key: 'c2', titulo: 'Cant. Mín.', ancho: 60 },
          { key: 'importe', titulo: 'Pvp', tipo: 'num', dec: 3, ancho: 75, suma: false },
          { key: 'n', titulo: 'Nº', tipo: 'entero', ancho: 35 },
        ],
      }
    case 'clientes_articulo':
      return {
        columnas: [cod, { key: 'c1', titulo: 'Nombre' }, { key: 'c2', titulo: 'Cant. Mín.', ancho: 60 }, { key: 'importe', titulo: 'Pvp', tipo: 'num', dec: 3, ancho: 75, suma: false }, { key: 'n', titulo: 'Nº', tipo: 'entero', ancho: 35 }],
      }
    case 'con_articulos':
      return {
        columnas: [cod, { key: 'c1', titulo: 'Nombre' }, { key: 'c2', titulo: 'Teléfono', ancho: 110 }, { key: 'c3', titulo: 'Actividad', ancho: 130 }, { key: 'c4', titulo: 'Tar.', ancho: 30 }, { key: 'c5', titulo: 'Artículos', ancho: 60 }],
      }
    case 'contactos_cliente':
      return {
        columnas: [
          { key: 'clave', titulo: 'Contacto' },
          { key: 'c1', titulo: 'Tipo de Contacto', ancho: 130 },
          { key: 'c2', titulo: 'Teléfono', ancho: 95 },
          { key: 'c3', titulo: 'Móvil', ancho: 95 },
          { key: 'c4', titulo: 'Email', ancho: 170 },
        ],
      }
    case 'clientes_contacto':
      return {
        columnas: [cod, { key: 'c1', titulo: 'Nombre' }, { key: 'c2', titulo: 'Tipo de Contacto', ancho: 130 }, { key: 'c3', titulo: 'Teléfono', ancho: 95 }, { key: 'c4', titulo: 'Email', ancho: 170 }],
      }
    case 'clientes_tipo_contacto':
      return {
        columnas: [cod, { key: 'c1', titulo: 'Nombre' }, { key: 'c2', titulo: 'Contacto', ancho: 140 }, { key: 'c3', titulo: 'Teléfono', ancho: 95 }, { key: 'c4', titulo: 'Email', ancho: 170 }],
      }
    default: // simplificado
      return {
        columnas: [cod, { key: 'c1', titulo: 'Nombre' }, { key: 'c2', titulo: 'Teléfono', ancho: 110 }, { key: 'c3', titulo: 'Actividad', ancho: 140 }, { key: 'c4', titulo: 'Tarifa', ancho: 40 }],
      }
  }
}

export function ListadoClientesPage() {
  const inf = useInforme()
  const [informe, setInforme] = useState('simplificado')
  const [orden, setOrden] = useState('codigo')
  const [destino, setDestino] = useState<Destino>('pantalla')
  const [f, setF] = useState<Filtros>(inicial)
  const set = (p: Partial<Filtros>) => setF((x) => ({ ...x, ...p }))

  function procesar() {
    const p = {
      informe,
      orden,
      clientes: rangoSql(f.clientes),
      tiposCliente: rangoSql(f.tipos),
      zonas: rangoSql(f.zonas),
      rutas: rangoSql(f.rutas),
      formasPago: rangoSql(f.formasPago),
      tarifas: rangoSql(f.tarifas),
      tipoVenta: f.tipoVenta,
      dc: f.dc,
      tipoFactura: f.tipoFactura,
      activos: f.activos,
      bloqueados: f.bloqueados,
      genericos: f.genericos,
      web: f.web,
      agenda: sqlCampo(f.agenda, CAMPOS_AGENDA),
      campo1: sqlCampo(f.campo1, CAMPOS_FICHA),
      campo2: sqlCampo(f.campo2, CAMPOS_FICHA),
    }
    const { columnas, apaisado } = columnasDe(informe)
    const estado = describirPar('Clientes Activos', 'Clientes Inactivos', f.activos) ?? 'Clientes Inactivos y Activos'
    inf.procesar(
      {
        titulo: INFORMES.find((i) => i.value === informe)?.label ?? 'Listado de Clientes',
        apaisado,
        columnas,
        filtros: [
          estado,
          describirRango('Clientes', f.clientes),
          describirRango('Tipos de cliente', f.tipos),
          describirRango('Zonas territoriales', f.zonas),
          describirRango('Rutas de reparto', f.rutas),
          describirRango('Formas de pago', f.formasPago),
          describirRango('Tarifas', f.tarifas),
          f.tipoVenta && `Tipo de venta: ${f.tipoVenta}`,
          f.dc && `D.C.: ${f.dc}`,
          f.tipoFactura && `Tipo de factura: ${f.tipoFactura}`,
          describirPar('Bloqueados', 'No bloqueados', f.bloqueados),
          describirPar('Genéricos', 'No genéricos', f.genericos),
          describirPar('Publicados en la web', 'No publicados en la web', f.web),
          describirCampo(f.agenda, CAMPOS_AGENDA, 'Agenda: '),
          describirCampo(f.campo1, CAMPOS_FICHA),
          describirCampo(f.campo2, CAMPOS_FICHA),
        ],
        cargar: () => rpc('fn_lst_clientes_gw', p),
      },
      destino,
    )
  }

  const boton = (label: string, k: 'activos' | 'bloqueados' | 'genericos' | 'web', lado: 'si' | 'no') => (
    <BotonOpcion label={label} on={f[k][lado]} set={(v) => set({ [k]: { ...f[k], [lado]: v } } as Partial<Filtros>)} />
  )

  return (
    <>
      <ListadoVentana
        informes={INFORMES}
        informe={informe}
        onInforme={setInforme}
        ordenes={ORDENES}
        orden={orden}
        onOrden={setOrden}
        destino={destino}
        onDestino={setDestino}
        onProcesar={procesar}
        procesando={inf.cargando}
        operativa={[
          {
            titulo: 'Sacar un listado de clientes',
            pasos: [
              'Elige el informe en «Informe a procesar» y el orden en «Orden de salida».',
              'Pon los filtros: Desde/Hasta (un tramo de códigos), Cualquiera (todos) o Seleccionar (varios códigos separados por comas; «···» los busca).',
              'En «Estado del Cliente» marca con ✓ lo que quieras ver (Activo, No Activo…). Sin ninguna marca en una pareja, no se filtra por ella.',
              'Elige el destino (Pantalla, Impresora, Examinar o Doc. PDF) y pulsa Procesar.',
            ],
            notas: [
              '«Filtrar Según Campos» filtra por un dato de la ficha (Fecha Alta, Población…). Las fechas se escriben dd/mm/aaaa.',
              '«Filtrar según campos de la Agenda» deja los clientes que tienen algún contacto que cumpla la condición.',
              'Los informes con «(Pendiente)» aún no los saca el ERP.',
              'F4 cierra la ventana.',
            ],
          },
        ]}
      >
        <ErrorListado error={inf.error} />
        <div className="grid grid-cols-2 gap-2">
          <GrupoRango nombre="lcg-cli" titulo="Cliente" valor={f.clientes} onChange={(clientes) => set({ clientes })} buscador="cliente" />
          <GrupoRango nombre="lcg-tip" titulo="Tipo Cliente" valor={f.tipos} onChange={(tipos) => set({ tipos })} buscador="tipoCliente" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <GrupoRango nombre="lcg-zon" titulo="Zona Territorial" valor={f.zonas} onChange={(zonas) => set({ zonas })} buscador="zona" />
          <GrupoRango nombre="lcg-rut" titulo="Ruta de Reparto" valor={f.rutas} onChange={(rutas) => set({ rutas })} buscador="ruta" />
        </div>
        <div className="grid grid-cols-[minmax(0,345fr)_minmax(0,288fr)_minmax(0,272fr)] gap-2">
          <GrupoRango nombre="lcg-fp" titulo="Formas de pago" valor={f.formasPago} onChange={(formasPago) => set({ formasPago })} buscador="formaPago" />
          <GrupoRango nombre="lcg-tar" titulo="Tarifa" valor={f.tarifas} onChange={(tarifas) => set({ tarifas })} />
          <LstGrupo titulo="Tipo Venta y Factura del Cliente">
            <div className="flex flex-col gap-2 pt-1 text-[16px]">
              <div className="flex items-center gap-2">
                <select className={`${LST_INPUT} flex-1`} value={f.tipoVenta} onChange={(e) => set({ tipoVenta: e.target.value })} title="Tipo de venta de la ficha (Contado / Crédito)">
                  <option value="">Cualquiera</option>
                  <option value="Contado">Contado</option>
                  <option value="Crédito">Crédito</option>
                </select>
                <span>D.C.:</span>
                <select className={`${LST_INPUT} w-[64px]!`} value={f.dc} onChange={(e) => set({ dc: e.target.value })} title="Dígito de control de facturación de la ficha">
                  <option value="">Cualquiera</option>
                  {['1', '2', '3'].map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="whitespace-nowrap">Tipo Factura:</span>
                <select className={`${LST_INPUT} flex-1`} value={f.tipoFactura} onChange={(e) => set({ tipoFactura: e.target.value })} title="Tipo de factura global de la ficha">
                  <option value="">Cualquiera</option>
                  {[0, 1, 2, 3, 4].map((t) => (
                    <option key={t} value={String(t)}>
                      Tipo {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </LstGrupo>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-2">
          <LstGrupo titulo="Estado del Cliente">
            <div className="grid grid-cols-4 gap-0 pt-1">
              {boton('Activo', 'activos', 'si')}
              {boton('Bloqueado', 'bloqueados', 'si')}
              {boton('Genérico', 'genericos', 'si')}
              {boton('Web', 'web', 'si')}
              {boton('No Activo', 'activos', 'no')}
              {boton('No Bloque.', 'bloqueados', 'no')}
              {boton('No Genér.', 'genericos', 'no')}
              {boton('No Web', 'web', 'no')}
            </div>
          </LstGrupo>
          <GrupoCampo titulo="Filtrar según campos de la Agenda" multiple campos={CAMPOS_AGENDA} valor={f.agenda} onChange={(agenda) => set({ agenda })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <GrupoCampo titulo="Filtrar Según Campos" campos={CAMPOS_FICHA} valor={f.campo1} onChange={(campo1) => set({ campo1 })} />
          <GrupoCampo titulo="Filtrar Según Campos" campos={CAMPOS_FICHA} valor={f.campo2} onChange={(campo2) => set({ campo2 })} />
        </div>
      </ListadoVentana>
      {inf.vista}
    </>
  )
}
