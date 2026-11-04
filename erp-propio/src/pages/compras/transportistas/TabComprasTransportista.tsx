import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { GwDate, GwInput, GwLookupButton, GwRadio, GwSelect, formatGw } from '../../../components/gw'
import { FilasVacias } from '../../../components/gw/GwGridParts'
import { GwLookupDialog } from '../../../components/gw/GwLookupDialog'
import { GwAnterior, GwBuscar, GwPrimero, GwSiguiente, GwUltimo } from '../../../components/gw/GwIconos'

// Pestaña «Compras» del transportista, calcada de la captura de GeminisWin (04/11, ZIP 7):
// «Filtrar Según Fecha» (campo de fecha + operador, por defecto «No Filtrar»), «Tiendas»
// (Desde/Hasta, Cualquiera, Seleccionar), «Aplicar» y la rejilla de pedidos a proveedor que
// trajo el transportista con los nombres de columna de GeminisWin (PEDIDCAB), y debajo su barra
// de navegación. Doble clic en una fila: abre el pedido a proveedor.

interface Compra {
  tienda_terminal_codigo: string
  numero: number
  fecha_hora: string | null
  proveedor_codigo: string | null
  almacen_codigo: string | null
  fecha_liquidacion: string | null
  stock_movido: boolean | null
  pagado: boolean | null
  tipo_documento: number | null
  es_abono: boolean | null
  numero_albaran_proveedor: string | null
  numero_factura_proveedor_externo: string | null
  fecha_solicitud: string | null
  factura_proveedor_id: number | null
  fecha_vencimiento_1: string | null
  fecha_vencimiento_2: string | null
  estado: string | null
  total: number | null
}

const COLS =
  'tienda_terminal_codigo, numero, fecha_hora, proveedor_codigo, almacen_codigo, fecha_liquidacion, stock_movido, pagado, tipo_documento, es_abono, numero_albaran_proveedor, numero_factura_proveedor_externo, fecha_solicitud, factura_proveedor_id, fecha_vencimiento_1, fecha_vencimiento_2, estado, total'

const CAMPOS_FECHA = [
  { value: 'fecha_hora', label: 'Fecha de Alta' },
  { value: 'fecha_liquidacion', label: 'Fecha de Liquidación' },
  { value: 'fecha_factura', label: 'Fecha de Factura' },
  { value: 'fecha_pago', label: 'Fecha de Pago' },
] as const
type CampoFecha = (typeof CAMPOS_FECHA)[number]['value']

type Operador = 'no' | 'igual' | 'desde' | 'hasta' | 'entre'
const OPERADORES: { value: Operador; label: string }[] = [
  { value: 'no', label: 'No Filtrar' },
  { value: 'igual', label: 'Igual a' },
  { value: 'desde', label: 'Desde' },
  { value: 'hasta', label: 'Hasta' },
  { value: 'entre', label: 'Entre' },
]
type ModoTienda = 'rango' | 'cualquiera' | 'seleccionar'

interface Filtro {
  campo: CampoFecha
  operador: Operador
  fecha1: string
  fecha2: string
  modoTienda: ModoTienda
  tiendaDesde: string
  tiendaHasta: string
  tienda: string
}

function haceDosAnos() {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 2)
  return d.toISOString().slice(0, 10)
}

const FILTRO_INICIAL: Filtro = {
  campo: 'fecha_hora',
  operador: 'no',
  fecha1: haceDosAnos(),
  fecha2: '',
  modoTienda: 'cualquiera',
  tiendaDesde: '',
  tiendaHasta: '',
  tienda: '',
}

const fechaEs = (v: string | null) => {
  if (!v) return ' /  /'
  const [a, m, d] = v.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}
const fechaHoraEs = (v: string | null) => {
  if (!v) return ''
  const d = new Date(v)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
const tf = (v: boolean | null) => (v ? 'T' : 'F')

export function TabComprasTransportista({ codigo }: { codigo: string }) {
  const navigate = useNavigate()
  const [borrador, setBorrador] = useState<Filtro>(FILTRO_INICIAL)
  const [filtro, setFiltro] = useState<Filtro>(FILTRO_INICIAL)
  const [rows, setRows] = useState<Compra[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [buscarTienda, setBuscarTienda] = useState<null | 'tiendaDesde' | 'tiendaHasta' | 'tienda'>(null)

  useEffect(() => {
    if (!codigo) {
      setRows([])
      return
    }
    let vivo = true
    setError(null)
    setSel(null)
    ;(async () => {
      const f = filtro
      let q = supabase
        .from('pedido_proveedor')
        .select(COLS)
        .eq('transportista_codigo', codigo)
        .order('fecha_hora', { ascending: false })
        .order('numero', { ascending: false })
        .limit(500)
      const c = f.campo
      const fin = (d: string) => (c === 'fecha_hora' ? `${d}T23:59:59.999` : d)
      if (f.operador === 'igual' && f.fecha1) q = q.gte(c, f.fecha1).lte(c, fin(f.fecha1))
      if (f.operador === 'desde' && f.fecha1) q = q.gte(c, f.fecha1)
      if (f.operador === 'hasta' && f.fecha1) q = q.lte(c, fin(f.fecha1))
      if (f.operador === 'entre') {
        if (f.fecha1) q = q.gte(c, f.fecha1)
        if (f.fecha2) q = q.lte(c, fin(f.fecha2))
      }
      if (f.modoTienda === 'seleccionar' && f.tienda) q = q.eq('tienda_terminal_codigo', f.tienda)
      if (f.modoTienda === 'rango') {
        if (f.tiendaDesde) q = q.gte('tienda_terminal_codigo', f.tiendaDesde)
        if (f.tiendaHasta) q = q.lte('tienda_terminal_codigo', f.tiendaHasta)
      }
      const { data, error: err } = await q
      if (!vivo) return
      if (err) setError(err.message)
      setRows((data ?? []) as Compra[])
    })()
    return () => {
      vivo = false
    }
  }, [codigo, filtro])

  const claves = rows.map((r) => `${r.tienda_terminal_codigo}/${r.numero}`)
  const i = sel ? claves.indexOf(sel) : -1
  const ir = (n: number) => claves.length && setSel(claves[Math.max(0, Math.min(claves.length - 1, n))])
  const abrir = (k: string | null) => {
    if (!k) return
    const [t, n] = k.split('/')
    navigate(`/pedidos-proveedor/${encodeURIComponent(t)}/${n}`)
  }
  const b = 'flex h-[30px] w-[74px] items-center justify-center border-r border-[var(--gw-border-light)] text-[#1d3a8a] hover:bg-[#e5f1fb] disabled:text-[#a8a8a8] disabled:hover:bg-transparent'
  const vacio = claves.length === 0
  const fechaOff = borrador.operador === 'no'

  const campoTienda = (k: 'tiendaDesde' | 'tiendaHasta' | 'tienda', activo: boolean) => (
    <div className="flex w-[78px] gap-0.5">
      <GwInput value={borrador[k]} disabled={!activo} title="Código de tienda" onChange={(e) => setBorrador({ ...borrador, [k]: e.target.value })} />
      <GwLookupButton disabled={!activo} title="Buscar tienda" onClick={() => setBuscarTienda(k)} />
    </div>
  )

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-stretch gap-2">
        <fieldset className="gw-group grid w-[480px] grid-cols-2 gap-x-2 gap-y-1">
          <legend className="text-[15px]">Filtrar Según Fecha</legend>
          <GwSelect value={borrador.campo} title="Campo de fecha por el que se filtra" onChange={(e) => setBorrador({ ...borrador, campo: e.target.value as CampoFecha })}>
            {CAMPOS_FECHA.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </GwSelect>
          <GwSelect value={borrador.operador} title="Cómo se filtra" onChange={(e) => setBorrador({ ...borrador, operador: e.target.value as Operador })}>
            {OPERADORES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </GwSelect>
          <GwDate disabled={fechaOff} value={borrador.fecha1} onChange={(v) => setBorrador({ ...borrador, fecha1: v ?? '' })} />
          <GwDate disabled={borrador.operador !== 'entre'} value={borrador.fecha2} onChange={(v) => setBorrador({ ...borrador, fecha2: v ?? '' })} />
        </fieldset>
        <fieldset className="gw-group grid grid-cols-[130px_auto_auto] items-center gap-x-2 gap-y-0.5">
          <legend className="text-[15px]">Tiendas</legend>
          <GwRadio name="transp-compras-tiendas" label="Desde/Hasta" checked={borrador.modoTienda === 'rango'} onChange={() => setBorrador({ ...borrador, modoTienda: 'rango' })} />
          {campoTienda('tiendaDesde', borrador.modoTienda === 'rango')}
          {campoTienda('tiendaHasta', borrador.modoTienda === 'rango')}
          <GwRadio name="transp-compras-tiendas" label="Cualquiera" checked={borrador.modoTienda === 'cualquiera'} onChange={() => setBorrador({ ...borrador, modoTienda: 'cualquiera' })} />
          <span />
          <span />
          <GwRadio name="transp-compras-tiendas" label="Seleccionar" checked={borrador.modoTienda === 'seleccionar'} onChange={() => setBorrador({ ...borrador, modoTienda: 'seleccionar' })} />
          {campoTienda('tienda', borrador.modoTienda === 'seleccionar')}
          <span />
        </fieldset>
        <div className="ml-auto flex flex-col pt-1">
          <button type="button" className="gw-btn h-[44px] w-[100px] text-[16px]" title="Aplicar el filtro a la rejilla" onClick={() => setFiltro({ ...borrador })}>
            <Check size={15} strokeWidth={3} className="text-[#127a12]" />
            Aplicar
          </button>
        </div>
      </div>

      {error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[#a4262c]">{error}</div>}
      <div className="h-[132px] overflow-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid min-w-[1300px]" title="PEDIDCAB">
          <thead className="sticky top-0">
            <tr>
              <th style={{ width: 40 }}>Idofic</th>
              <th style={{ width: 70 }}>Numero</th>
              <th style={{ width: 150 }}>Fechahora</th>
              <th style={{ width: 80 }}>Cod_prov</th>
              <th style={{ width: 40 }}>Almac</th>
              <th style={{ width: 80 }}>Fecha_l</th>
              <th style={{ width: 34 }}>Actu</th>
              <th style={{ width: 34 }}>Paga</th>
              <th style={{ width: 40 }}>Tipod</th>
              <th style={{ width: 34 }}>Abon</th>
              <th style={{ width: 95 }}>Num_alba</th>
              <th style={{ width: 95 }}>Num_factur</th>
              <th style={{ width: 80 }}>Fecha_p</th>
              <th style={{ width: 50 }}>Fact_c</th>
              <th style={{ width: 80 }}>Fecha_v</th>
              <th style={{ width: 80 }}>Fecha_v2</th>
              <th style={{ width: 90 }}>Estado</th>
              <th style={{ width: 90 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const k = `${r.tienda_terminal_codigo}/${r.numero}`
              return (
                <tr key={k} className={sel === k ? 'gw-selected' : ''} onClick={() => setSel(k)} onDoubleClick={() => abrir(k)}>
                  <td>{r.tienda_terminal_codigo}</td>
                  <td className="text-right">{r.numero}</td>
                  <td>{fechaHoraEs(r.fecha_hora)}</td>
                  <td>{r.proveedor_codigo ?? ''}</td>
                  <td>{r.almacen_codigo ?? ''}</td>
                  <td>{fechaEs(r.fecha_liquidacion)}</td>
                  <td>{tf(r.stock_movido)}</td>
                  <td>{tf(r.pagado)}</td>
                  <td className="text-right">{r.tipo_documento ?? 0}</td>
                  <td>{tf(r.es_abono)}</td>
                  <td>{r.numero_albaran_proveedor ?? ''}</td>
                  <td>{r.numero_factura_proveedor_externo ?? ''}</td>
                  <td>{fechaEs(r.fecha_solicitud)}</td>
                  <td className="text-right">{r.factura_proveedor_id ?? 0}</td>
                  <td>{fechaEs(r.fecha_vencimiento_1)}</td>
                  <td>{fechaEs(r.fecha_vencimiento_2)}</td>
                  <td>{r.estado ?? ''}</td>
                  <td className="text-right">{formatGw(r.total ?? 0, 2)}</td>
                </tr>
              )
            })}
            <FilasVacias cols={18} ocupadas={rows.length} total={5} />
          </tbody>
        </table>
      </div>
      <div className="flex w-fit border border-[var(--gw-border)] bg-[var(--gw-face)]">
        <button type="button" className={b} title="Primero" disabled={vacio} onClick={() => ir(0)}>
          <GwPrimero />
        </button>
        <button type="button" className={b} title="Anterior" disabled={vacio} onClick={() => ir(i - 1)}>
          <GwAnterior />
        </button>
        <button type="button" className={b} title="Siguiente" disabled={vacio} onClick={() => ir(i + 1)}>
          <GwSiguiente />
        </button>
        <button type="button" className={b} title="Último" disabled={vacio} onClick={() => ir(claves.length - 1)}>
          <GwUltimo />
        </button>
        <button
          type="button"
          className={`${b} border-r-0`}
          title="Buscar por número de pedido"
          disabled={vacio}
          onClick={() => {
            const q = window.prompt('Buscar por número de pedido:')?.trim()
            const k = q ? claves.find((c) => c.endsWith(`/${q}`)) : undefined
            if (k) setSel(k)
          }}
        >
          <GwBuscar />
        </button>
      </div>

      {buscarTienda && (
        <GwLookupDialog<{ codigo: string; descripcion: string }>
          title="Buscar Tienda"
          table="tienda_terminal"
          columns={[
            { key: 'codigo', label: 'Código', width: 80 },
            { key: 'descripcion', label: 'Descripción' },
          ]}
          searchColumns={['codigo', 'descripcion']}
          orderBy="codigo"
          keyColumn="codigo"
          onPick={(r) => {
            setBorrador((x) => ({ ...x, [buscarTienda]: r.codigo }))
            setBuscarTienda(null)
          }}
          onClose={() => setBuscarTienda(null)}
        />
      )}
    </div>
  )
}
