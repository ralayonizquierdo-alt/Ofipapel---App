import { useState } from 'react'
import {
  CampoCodigo,
  GrupoRango,
  LST_INPUT,
  LstGrupo,
  ListadoVentana,
  describirRango,
  rango,
  rangoSql,
  useInforme,
  type ColumnaInforme,
  type Destino,
  type NombreBuscador,
  type Rango,
} from '../../components/gw/GwListado'
import { GwDate } from '../../components/gw'
import { rpc } from './comun'
import { ErrorListado } from './clientes/comunClientes'

// Compras → Informes de Proveedores, como GeminisWin (captura de Luis, 30/10/2026): se abre con la
// impresora de la ficha de Proveedores. «Listado de Proveedores» y «Listado de Cuentas
// Contables»; Orden de salida; Código, Nif y Nombre (Desde/Hasta · Cualquiera · Seleccionar) y
// dos «Filtrar Según Campos». Cálculo en fn_lst_proveedores (migración 20261030_listado_proveedores).

const INFORMES = [
  { value: 'listado', label: 'Listado de Proveedores' },
  { value: 'cuentas', label: 'Listado de Cuentas Contables' },
]

const ORDENES = [
  { value: 'codigo', label: 'Codigo' },
  { value: 'nombre', label: 'Nombre' },
  { value: 'nif', label: 'Nif' },
  { value: 'poblacion', label: 'Poblacion' },
]

const CAMPOS: { value: string; label: string; fecha?: boolean; buscador?: NombreBuscador }[] = [
  { value: 'fecha_alta', label: 'Fecha Alta', fecha: true },
  { value: 'fecha_baja', label: 'Fecha Baja', fecha: true },
  { value: 'fecha_ultima_compra', label: 'Fecha Última Compra', fecha: true },
  { value: 'fecha_ultimo_pedido', label: 'Fecha Último Pedido', fecha: true },
  { value: 'poblacion', label: 'Población' },
  { value: 'provincia', label: 'Provincia' },
  { value: 'codigo_postal', label: 'Código Postal' },
  { value: 'forma_pago', label: 'Forma de Pago', buscador: 'formaPago' },
  { value: 'contacto', label: 'Contacto' },
  { value: 'tipo', label: 'Tipo (proveedor / acreedor)' },
]

interface CampoFiltro {
  campo: string
  modo: 'no' | 'igual' | 'desdeHasta'
  desde: string
  hasta: string
}
const campoFiltro = (): CampoFiltro => ({ campo: 'fecha_alta', modo: 'no', desde: '', hasta: '' })

function describirCampo(c: CampoFiltro) {
  if (c.modo === 'no') return null
  const d = CAMPOS.find((x) => x.value === c.campo)
  const f = (v: string) => (d?.fecha && v ? v.split('-').reverse().join('/') : v)
  const l = d?.label ?? c.campo
  return c.modo === 'igual' ? `${l}: ${f(c.desde)}` : `${l}: desde ${f(c.desde) || '…'} hasta ${f(c.hasta) || '…'}`
}

/** «Filtrar Según Campos»: campo de la ficha, No Filtrar / Igual a / Desde-Hasta y dos valores. */
function GrupoCampo({ valor, onChange }: { valor: CampoFiltro; onChange: (c: CampoFiltro) => void }) {
  const set = (p: Partial<CampoFiltro>) => onChange({ ...valor, ...p })
  const d = CAMPOS.find((c) => c.value === valor.campo)
  const valorCampo = (v: string, cambiar: (x: string) => void, apagado: boolean, title: string) =>
    d?.fecha ? (
      <GwDate value={v || null} onChange={(x) => cambiar(x ?? '')} disabled={apagado} title={title} />
    ) : (
      <CampoCodigo valor={v} onChange={cambiar} buscador={d?.buscador} disabled={apagado} className="flex-1" title={title} />
    )
  return (
    <LstGrupo titulo="Filtrar Según Campos">
      <div className="grid grid-cols-2 gap-x-2 gap-y-[6px]">
        <select className={LST_INPUT} value={valor.campo} onChange={(e) => set({ campo: e.target.value, desde: '', hasta: '' })}>
          {CAMPOS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select className={LST_INPUT} value={valor.modo} onChange={(e) => set({ modo: e.target.value as CampoFiltro['modo'] })}>
          <option value="no">No Filtrar</option>
          <option value="igual">Igual a</option>
          <option value="desdeHasta">Desde/Hasta</option>
        </select>
        {valorCampo(valor.desde, (v) => set({ desde: v }), valor.modo === 'no', 'Desde / valor')}
        {valorCampo(valor.hasta, (v) => set({ hasta: v }), valor.modo !== 'desdeHasta', 'Hasta')}
      </div>
    </LstGrupo>
  )
}

/** Nombre: se compara en mayúsculas (como se guardan los nombres de GeminisWin). */
const mayus = (r: Rango): Rango => ({ ...r, desde: r.desde.toUpperCase(), hasta: r.hasta.toUpperCase(), lista: r.lista.toUpperCase() })

export function ListadoProveedoresPage() {
  const inf = useInforme()
  const [informe, setInforme] = useState('listado')
  const [orden, setOrden] = useState('codigo')
  const [destino, setDestino] = useState<Destino>('pantalla')
  const [codigos, setCodigos] = useState<Rango>(rango())
  const [nifs, setNifs] = useState<Rango>(rango())
  const [nombres, setNombres] = useState<Rango>(rango())
  const [campo1, setCampo1] = useState<CampoFiltro>(campoFiltro())
  const [campo2, setCampo2] = useState<CampoFiltro>({ ...campoFiltro(), campo: 'poblacion' })

  function procesar() {
    const p = {
      informe,
      orden,
      codigos: rangoSql(codigos),
      nifs: rangoSql(nifs),
      nombres: rangoSql(mayus(nombres)),
      campo1,
      campo2,
    }
    const columnas: ColumnaInforme[] =
      informe === 'cuentas'
        ? [
            { key: 'clave', titulo: 'Código', ancho: 60 },
            { key: 'descripcion', titulo: 'Nombre' },
            { key: 'nif', titulo: 'N.I.F.', ancho: 80 },
            { key: 'cta_400', titulo: 'Cta. 400', ancho: 85 },
            { key: 'cta_600', titulo: 'Cta. 600', ancho: 85 },
            { key: 'cta_401', titulo: 'Cta. 401', ancho: 85 },
            { key: 'cta_572', titulo: 'Cta. 572', ancho: 85 },
            { key: 'n', titulo: 'Nº', tipo: 'entero', ancho: 35 },
          ]
        : [
            { key: 'clave', titulo: 'Código', ancho: 60 },
            { key: 'descripcion', titulo: 'Nombre' },
            { key: 'nif', titulo: 'N.I.F.', ancho: 80 },
            { key: 'poblacion', titulo: 'Población', ancho: 110 },
            { key: 'telefono', titulo: 'Teléfono', ancho: 115 },
            { key: 'contacto', titulo: 'Contacto', ancho: 110 },
            { key: 'forma_pago', titulo: 'Forma de Pago', ancho: 110 },
            { key: 'tipo', titulo: 'Tipo', ancho: 65 },
            { key: 'n', titulo: 'Nº', tipo: 'entero', ancho: 35 },
          ]
    inf.procesar(
      {
        titulo: INFORMES.find((i) => i.value === informe)?.label ?? 'Listado de Proveedores',
        apaisado: true,
        sinCaptura: true,
        columnas,
        filtros: [
          describirRango('Código', codigos),
          describirRango('Nif', nifs),
          describirRango('Nombre', nombres),
          describirCampo(campo1),
          describirCampo(campo2),
        ],
        cargar: () => rpc('fn_lst_proveedores', p),
      },
      destino,
    )
  }

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
      >
        <ErrorListado error={inf.error} />
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-2">
          <GrupoRango titulo="Código" valor={codigos} onChange={setCodigos} buscador="proveedor" nombre="lp-codigo" />
          <GrupoRango titulo="Nif" valor={nifs} onChange={setNifs} nombre="lp-nif" />
        </div>
        <GrupoRango titulo="Nombre" valor={nombres} onChange={setNombres} nombre="lp-nombre" />
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-2">
          <GrupoCampo valor={campo1} onChange={setCampo1} />
          <GrupoCampo valor={campo2} onChange={setCampo2} />
        </div>
      </ListadoVentana>
      {inf.vista}
    </>
  )
}
