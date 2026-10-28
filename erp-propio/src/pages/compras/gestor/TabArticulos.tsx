import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Package } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { avisoTope, todasLasFilas } from '../../../lib/todasLasFilas'
import { formatGw, GwDate } from '../../../components/gw'
import { GwLookupDialog } from '../../../components/gw/GwLookupDialog'
import { BarButton, BIG_INPUT, chunks, fechaEs, LocalizarDialog } from '../../ventas/gestores/comun'
import { ordenar, Rejilla, type Col, type Orden } from '../../ventas/gestores/rejilla'
import { BarraGestor, buscarFila, Contador } from './barra'
import { colorProveedor, type OpcionesGestorCompras } from './opciones'

interface ArtProvRow {
  key: string
  articulo: string
  descripcion: string
  proveedor: string
  nombre: string
  puro: number | null
  neto: number | null
  bruto: number | null
  liquido: number | null
  fechaUlt: string | null
  pendiente: number
  prevista: string | null
  ultCant: number | null
  ultBonif: number | null
  ultDto: number | null
}

interface FiltroArt {
  proveedor: string
  familia: string
  texto: string
  ultDesde: string
  ultHasta: string
  anulados: boolean
  soloPendientes: boolean
}

const FILTRO_INICIAL: FiltroArt = { proveedor: '', familia: '', texto: '', ultDesde: '', ultHasta: '', anulados: false, soloPendientes: false }

/** Máximo de filas de la pestaña; si hay más, avisa de que se afine el filtro. */
const TOPE_FILAS_TAB = 5000

export function TabArticulos({ opciones, onError }: { opciones: OpcionesGestorCompras; onError: (m: string | null) => void }) {
  const navigate = useNavigate()
  const [filtro, setFiltro] = useState<FiltroArt>(FILTRO_INICIAL)
  const [rows, setRows] = useState<ArtProvRow[]>([])
  const [sel, setSel] = useState(0)
  const [ord, setOrd] = useState<Orden | null>(null)
  const [cargando, setCargando] = useState(false)
  const [lookup, setLookup] = useState<null | 'proveedor' | 'familia'>(null)
  const [localizar, setLocalizar] = useState(false)
  const set = (p: Partial<FiltroArt>) => setFiltro((f) => ({ ...f, ...p }))

  async function aplicar() {
    setCargando(true)
    onError(null)
    const t = filtro.texto.trim().replace(/[%,()]/g, ' ')
    const qa = () => {
      let q = supabase.from('articulo').select('codigo_interno, descripcion').order('codigo_interno')
      if (!filtro.anulados) q = q.eq('activo', true)
      if (filtro.familia) q = q.eq('familia_codigo', filtro.familia)
      if (t) q = q.or(`codigo_interno.ilike.%${t}%,descripcion.ilike.%${t}%`)
      return q
    }
    const descr = new Map<string, string>()
    let codigos: string[] | null = null
    let aviso: string | null = null
    if (filtro.familia || t) {
      // Supabase corta cada respuesta en 1000 filas: por bloques, con tope y aviso.
      const { data, error, cortado } = await todasLasFilas(qa, { tope: TOPE_FILAS_TAB })
      if (error) {
        onError(error)
        setCargando(false)
        return
      }
      if (cortado) aviso = avisoTope(TOPE_FILAS_TAB)
      for (const a of data) descr.set(a.codigo_interno, a.descripcion ?? '')
      codigos = [...descr.keys()]
    }

    const sel =
      'articulo_codigo, proveedor_codigo, coste_puro, coste_neto, coste_bruto, precio_medio_compra, ultima_compra_fecha, unidades_pedidas, fecha_prevista_entrega, ultimas_unidades_compradas, ultima_bonificacion, ultimo_descuento_pct, proveedor:proveedor_codigo(nombre)'
    const base = () => {
      let q = supabase.from('articulo_proveedor').select(sel).order('articulo_codigo').order('proveedor_codigo')
      if (filtro.proveedor) q = q.eq('proveedor_codigo', filtro.proveedor)
      if (filtro.ultDesde) q = q.gte('ultima_compra_fecha', filtro.ultDesde)
      if (filtro.ultHasta) q = q.lte('ultima_compra_fecha', filtro.ultHasta)
      if (filtro.soloPendientes) q = q.gt('unidades_pedidas', 0)
      return q
    }
    type R = {
      articulo_codigo: string
      proveedor_codigo: string
      coste_puro: number | null
      coste_neto: number | null
      coste_bruto: number | null
      precio_medio_compra: number | null
      ultima_compra_fecha: string | null
      unidades_pedidas: number | null
      fecha_prevista_entrega: string | null
      ultimas_unidades_compradas: number | null
      ultima_bonificacion: number | null
      ultimo_descuento_pct: number | null
      proveedor: { nombre: string | null } | { nombre: string | null }[] | null
    }
    const datos: R[] = []
    if (codigos) {
      for (const trozo of chunks(codigos)) {
        const { data, error } = await todasLasFilas<R>(() => base().in('articulo_codigo', trozo))
        if (error) {
          onError(error)
          break
        }
        datos.push(...data)
      }
    } else {
      const { data, error, cortado } = await todasLasFilas<R>(base, { tope: TOPE_FILAS_TAB })
      if (error) onError(error)
      if (cortado) aviso = avisoTope(TOPE_FILAS_TAB)
      datos.push(...data)
    }
    if (aviso) onError(aviso)
    // Descripciones (y, si no se muestran anulados, quitar los artículos dados de baja).
    const faltan = [...new Set(datos.map((d) => d.articulo_codigo))].filter((c) => !descr.has(c))
    const activos = new Set<string>(descr.keys())
    for (const trozo of chunks(faltan)) {
      const { data } = await supabase.from('articulo').select('codigo_interno, descripcion, activo').in('codigo_interno', trozo)
      for (const a of data ?? []) {
        descr.set(a.codigo_interno, a.descripcion ?? '')
        if (a.activo || filtro.anulados) activos.add(a.codigo_interno)
      }
    }
    setRows(
      datos
        .filter((d) => activos.has(d.articulo_codigo))
        .map((d) => {
          const p = Array.isArray(d.proveedor) ? d.proveedor[0] : d.proveedor
          return {
            key: `${d.articulo_codigo}|${d.proveedor_codigo}`,
            articulo: d.articulo_codigo,
            descripcion: descr.get(d.articulo_codigo) ?? '',
            proveedor: d.proveedor_codigo,
            nombre: p?.nombre ?? '',
            puro: d.coste_puro,
            neto: d.coste_neto,
            bruto: d.coste_bruto,
            liquido: d.precio_medio_compra,
            fechaUlt: d.ultima_compra_fecha,
            pendiente: Number(d.unidades_pedidas ?? 0),
            prevista: d.fecha_prevista_entrega,
            ultCant: d.ultimas_unidades_compradas,
            ultBonif: d.ultima_bonificacion,
            ultDto: d.ultimo_descuento_pct,
          }
        }),
    )
    setSel(0)
    setCargando(false)
  }

  const num = (v: number | null, d = 3) => (v == null ? '' : formatGw(v, d))
  const cols: Col<ArtProvRow>[] = useMemo(
    () => [
      { key: 'articulo', label: 'Cod. Artic.', width: 130, value: (r) => r.articulo },
      { key: 'descripcion', label: 'Descripción', width: 290, value: (r) => r.descripcion },
      { key: 'proveedor', label: 'Proved.', width: 80, value: (r) => r.proveedor },
      { key: 'nombre', label: 'Nombre Proveedor', width: 230, value: (r) => r.nombre },
      { key: 'puro', label: 'Coste Puro', width: 105, align: 'right', value: (r) => r.puro, render: (r) => num(r.puro) },
      { key: 'neto', label: 'Coste Neto', width: 105, align: 'right', value: (r) => r.neto, render: (r) => num(r.neto) },
      { key: 'bruto', label: 'Coste Bruto', width: 105, align: 'right', value: (r) => r.bruto, render: (r) => num(r.bruto) },
      { key: 'liquido', label: 'Cte Líquido', width: 105, align: 'right', value: (r) => r.liquido, render: (r) => num(r.liquido), title: 'Precio medio de compra' },
      { key: 'fechaUlt', label: 'Fecha Ult.', width: 110, value: (r) => r.fechaUlt, render: (r) => fechaEs(r.fechaUlt) },
      { key: 'pendiente', label: 'Pendiente', width: 100, align: 'right', value: (r) => r.pendiente, render: (r) => num(r.pendiente) },
      { key: 'prevista', label: 'Prev. Entr.', width: 110, value: (r) => r.prevista, render: (r) => fechaEs(r.prevista) },
      { key: 'ultCant', label: 'Ult. Cant.', width: 100, align: 'right', value: (r) => r.ultCant, render: (r) => num(r.ultCant) },
      { key: 'ultBonif', label: 'Ult. Bonif.', width: 100, align: 'right', value: (r) => r.ultBonif, render: (r) => num(r.ultBonif) },
      { key: 'ultDto', label: 'Ult. Dto.', width: 90, align: 'right', value: (r) => r.ultDto, render: (r) => num(r.ultDto, 2) },
    ],
    [],
  )
  const filas = useMemo(() => ordenar(rows, cols, ord), [rows, cols, ord])
  const actual = filas[sel]

  const campo = (label: string, ancho: string, input: ReactNode) => (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className={`${ancho} flex-none text-[17px]`}>{label}</span>
      {input}
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <fieldset className="gw-group flex-none px-2 pb-2 pt-0.5">
        <legend className="text-[17px]!">Filtrar Artículos</legend>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)_170px] items-center gap-x-4 gap-y-1.5">
          {campo(
            'Proveedor:',
            'w-[90px]',
            <>
              <input className={`${BIG_INPUT} min-w-0`} value={filtro.proveedor} onChange={(e) => set({ proveedor: e.target.value.trim() })} />
              <button type="button" className="gw-btn h-[30px]! w-[48px] flex-none font-bold" onClick={() => setLookup('proveedor')} title="Buscar proveedor">
                ···
              </button>
            </>,
          )}
          {campo(
            'Familia:',
            'w-[70px]',
            <>
              <input className={`${BIG_INPUT} min-w-0`} value={filtro.familia} onChange={(e) => set({ familia: e.target.value.trim() })} />
              <button type="button" className="gw-btn h-[30px]! w-[48px] flex-none font-bold" onClick={() => setLookup('familia')} title="Buscar familia">
                ···
              </button>
            </>,
          )}
          {campo('Código / Descripción:', 'w-auto', <input className={`${BIG_INPUT} min-w-0`} value={filtro.texto} onChange={(e) => set({ texto: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && aplicar()} />)}
          <button type="button" className="gw-btn row-span-2 h-[66px]! w-full text-[18px]!" onClick={aplicar} disabled={cargando}>
            <Check size={16} strokeWidth={3} className="text-[#2a9d2a]" />
            {cargando ? 'Buscando…' : 'Aplicar Filtros'}
          </button>
          {campo(
            'Ult. compra desde:',
            'w-auto',
            <>
              <GwDate className={`${BIG_INPUT} min-w-0`} value={filtro.ultDesde} onChange={(v) => set({ ultDesde: v ?? '' })} />
            </>,
          )}
          {campo('hasta:', 'w-auto', <GwDate className={`${BIG_INPUT} min-w-0`} value={filtro.ultHasta} onChange={(v) => set({ ultHasta: v ?? '' })} />)}
          <div className="flex items-center gap-5">
            <label className="flex select-none items-center gap-1.5 whitespace-nowrap text-[17px]">
              <input type="checkbox" className="m-0 h-[13px] w-[13px] accent-[#0078d7]" checked={filtro.anulados} onChange={(e) => set({ anulados: e.target.checked })} />
              Incluir anulados
            </label>
            <label className="flex select-none items-center gap-1.5 whitespace-nowrap text-[17px]">
              <input type="checkbox" className="m-0 h-[13px] w-[13px] accent-[#0078d7]" checked={filtro.soloPendientes} onChange={(e) => set({ soloPendientes: e.target.checked })} />
              Solo con pendiente
            </label>
          </div>
        </div>
      </fieldset>

      <Rejilla
        rows={filas}
        cols={cols}
        rowKey={(r) => r.key}
        sel={sel}
        onSel={setSel}
        onOpen={(r) => navigate(`/articulos/${encodeURIComponent(r.articulo)}`)}
        orden={ord}
        onOrden={setOrd}
        vacias={14}
        rowStyle={(r) => (opciones.colorearProveedorArticulos ? { background: colorProveedor(r.proveedor) } : undefined)}
      />

      <BarraGestor grid={{ sel, set: setSel, n: filas.length, ord, setOrd, first: cols[0].key }} onLocalizar={() => setLocalizar(true)}>
        <BarButton title="Abrir la ficha del artículo" className="ml-3 w-[150px] text-[17px]! text-[#000]" disabled={!actual} onClick={() => actual && navigate(`/articulos/${encodeURIComponent(actual.articulo)}`)}>
          <Package size={16} className="text-[#2a9d2a]" /> Artículos
        </BarButton>
        <Contador texto={`Nº Artic.: ${rows.length}`} />
      </BarraGestor>

      {lookup && (
        <GwLookupDialog<Record<string, unknown>>
          title={lookup === 'proveedor' ? 'Proveedores' : 'Familias'}
          table={lookup}
          columns={
            lookup === 'proveedor'
              ? [
                  { key: 'codigo', label: 'Código', width: 90 },
                  { key: 'nombre', label: 'Nombre' },
                ]
              : [
                  { key: 'codigo', label: 'Código', width: 110 },
                  { key: 'descripcion', label: 'Descripción' },
                ]
          }
          searchColumns={lookup === 'proveedor' ? ['codigo', 'nombre'] : ['codigo', 'descripcion']}
          orderBy="codigo"
          keyColumn="codigo"
          onClose={() => setLookup(null)}
          onPick={(r) => {
            set(lookup === 'proveedor' ? { proveedor: String(r.codigo) } : { familia: String(r.codigo) })
            setLookup(null)
          }}
        />
      )}
      {localizar && (
        <LocalizarDialog
          onBuscar={(t) => {
            const i = buscarFila(filas, cols, sel, t)
            if (i >= 0) setSel(i)
            return i >= 0
          }}
          onClose={() => setLocalizar(false)}
        />
      )}
    </div>
  )
}
