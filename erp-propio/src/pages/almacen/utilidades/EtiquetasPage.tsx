import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Printer, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwInput, GwRadio, GwSelect, GwWindow, formatGw } from '../../../components/gw'
import {
  AlmacenStock,
  BarraSalida,
  CAMPOS_FECHA,
  CabeceraInforme,
  CodigoBuscar,
  CondicionCampo,
  FiltrarPor,
  Grupo,
  IN,
  L,
  RangoCodigos,
  aJson,
  filtroInicial,
  rangoVacio,
  type FiltroArticulos,
  type Rango,
  type Salida,
} from '../../../components/gw/GwInformeArticulos'
import { FiltrosArticulo, ORDENES_ART, type FilaArt } from './ListadosArticulosPage'
import { VisorInforme, msgError, rpcPagina, rpcTodas, useAlmacenes, useF4, type ColInforme } from './comun'
import { CodigoBarras } from './codigoBarras'

// Almacén → Etiquetas de Cód. de Barras. Calcada de la captura 06-24 («Listados de Etiquetas de
// Artículos»): informe, «Usar Formato de Etiqueta sencilla», «No Listar Artículos con el número
// de Etiquetas igual a Cero», orden, «Nº Etiquet. por Artíc.» y los filtros (fechas, artículo o
// familia, almacén y stock, tienda y número del pedido a proveedor, almacenes y, debajo, los
// mismos de Listados de Artículos). La parte de abajo de la ventana no se ve en la captura.
// Formatos: normal = hoja A4 de 3×8 (70×37 mm); sencilla = rollo térmico de 50×30 mm.
// Confirmar con Luis los formatos reales de sus etiquetas y las opciones de los desplegables.

const INFORMES = [
  {
    v: 'principal',
    l: 'Listar Etiquetas con el Cod. de Barras Principal del Artículo',
  },
  {
    v: 'todos',
    l: 'Listar Etiquetas con todos los Códigos de Barras del Artículo',
  },
  { v: 'interno', l: 'Listar Etiquetas con el Código Interno del Artículo' },
  { v: 'precio', l: 'Listar Etiquetas de Precio (sin código de barras)' },
]
const CUANTAS = [
  { v: 'contador', l: 'Contador' },
  { v: 'stock', l: 'Stock Actual' },
  { v: 'pedido', l: 'Unidades del Pedido' },
  { v: 'minimo', l: 'Stock Mínimo' },
]
const MAX_ETIQUETAS = 3000

interface Etiqueta {
  key: string
  codigo: string
  descripcion: string
  barras: string
  pvp: number | null
}

const pvpConIgic = (r: FilaArt) => (r.pvp0 == null ? null : Math.round(Number(r.pvp0) * (1 + Number(r.igic_pct ?? 0) / 100) * 100) / 100)

/** Una etiqueta a tamaño real (mm). */
function EtiquetaArt({ e, sencilla, sinBarras }: { e: Etiqueta; sencilla: boolean; sinBarras: boolean }) {
  const w = sencilla ? 50 : 70
  const h = sencilla ? 30 : 37
  return (
    <div
      className="flex flex-col overflow-hidden bg-white text-black"
      style={{
        width: `${w}mm`,
        height: `${h}mm`,
        padding: sencilla ? '1.5mm 2mm' : '2.5mm 3mm',
        boxSizing: 'border-box',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div
        style={{
          fontSize: sencilla ? '7pt' : '8pt',
          lineHeight: 1.15,
          height: sencilla ? '6mm' : '7mm',
          overflow: 'hidden',
        }}
      >
        {e.descripcion}
      </div>
      <div className="flex items-baseline justify-between" style={{ marginTop: '0.5mm' }}>
        <span style={{ fontSize: '6pt' }}>{e.codigo}</span>
        <span style={{ fontSize: sencilla ? '13pt' : '15pt', fontWeight: 700 }}>{e.pvp != null ? `${formatGw(e.pvp, 2)} €` : ''}</span>
      </div>
      {!sinBarras && e.barras && (
        <div className="mt-auto flex justify-center">
          <CodigoBarras codigo={e.barras} ancho={sencilla ? 44 : 52} alto={sencilla ? 13 : 15} />
        </div>
      )}
      {sinBarras && (
        <div className="mt-auto text-right" style={{ fontSize: '5.5pt' }}>
          IGIC incluido
        </div>
      )}
    </div>
  )
}

function Hojas({ etiquetas, sencilla, sinBarras, pantalla }: { etiquetas: Etiqueta[]; sencilla: boolean; sinBarras: boolean; pantalla?: boolean }) {
  if (sencilla)
    return (
      <div className={pantalla ? 'flex flex-wrap gap-2' : ''}>
        {etiquetas.map((e, i) => (
          <div key={e.key + i} style={pantalla ? { outline: '1px dashed #bbb' } : { breakAfter: 'page', pageBreakAfter: 'always' }}>
            <EtiquetaArt e={e} sencilla sinBarras={sinBarras} />
          </div>
        ))}
      </div>
    )
  const hojas: Etiqueta[][] = []
  for (let i = 0; i < etiquetas.length; i += 24) hojas.push(etiquetas.slice(i, i + 24))
  return (
    <>
      {hojas.map((hoja, n) => (
        <div
          key={n}
          className="grid bg-white"
          style={{
            width: '210mm',
            height: '296mm',
            gridTemplateColumns: 'repeat(3, 70mm)',
            gridTemplateRows: 'repeat(8, 37mm)',
            breakAfter: 'page',
            pageBreakAfter: 'always',
            margin: pantalla ? '0 auto 12px' : undefined,
            boxShadow: pantalla ? '0 1px 4px rgba(0,0,0,0.4)' : undefined,
          }}
        >
          {hoja.map((e, i) => (
            <div key={e.key + i} style={pantalla ? { outline: '1px dashed #ccc' } : undefined}>
              <EtiquetaArt e={e} sencilla={false} sinBarras={sinBarras} />
            </div>
          ))}
        </div>
      ))}
    </>
  )
}

export function EtiquetasPage() {
  const navigate = useNavigate()
  const almacenes = useAlmacenes()
  const [informe, setInforme] = useState('principal')
  const [sencilla, setSencilla] = useState(false)
  const [sinCero, setSinCero] = useState(true)
  const [orden, setOrden] = useState('codigo')
  const [cuantas, setCuantas] = useState('contador')
  const [contador, setContador] = useState(1)
  const [f, setF] = useState<FiltroArticulos>(() =>
    filtroInicial({
      articulos: rangoVacio(),
      fecha1: {
        campo: 'fecha_ultima_modificacion_pvp',
        op: 'no',
        v1: '',
        v2: '',
      },
      fecha2: { campo: 'ultima_compra_fecha', op: 'no', v1: '', v2: '' },
    }),
  )
  const [pedido, setPedido] = useState<
    Rango & {
      tienda_desde: string
      numero_desde: string
      tienda_hasta: string
      numero_hasta: string
    }
  >({
    ...rangoVacio(),
    tienda_desde: '',
    numero_desde: '',
    tienda_hasta: '',
    numero_hasta: '',
  })
  const [salida, setSalida] = useState<Salida>('pantalla')
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [vista, setVista] = useState<Etiqueta[] | null>(null)
  const [imprimir, setImprimir] = useState<Etiqueta[] | null>(null)
  const [examinar, setExaminar] = useState<Record<string, unknown> | null>(null)
  const set = (p: Partial<FiltroArticulos>) => setF((x) => ({ ...x, ...p }))
  const cerrar = useCallback(() => navigate('/'), [navigate])
  useF4(cerrar)

  function payload(): Record<string, unknown> {
    const p: Record<string, unknown> = { ...aJson(f), orden }
    if (pedido.modo !== 'cualquiera')
      p.pedido = {
        ...pedido,
        lista: pedido.lista
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
      }
    // El stock hace falta para «Nº de etiquetas = Stock Actual» aunque no se filtre por él.
    if (cuantas === 'stock' && !f.alm_stock.almacen) p.alm_stock = { ...f.alm_stock, almacen: '*', op: 'no' }
    return p
  }

  function copias(r: FilaArt) {
    const n = cuantas === 'contador' ? contador : cuantas === 'stock' ? Number(r.stock) : cuantas === 'pedido' ? Number(r.unidades_pedido ?? 0) : Number(r.stock_minimo ?? 0)
    return Math.max(0, Math.floor(n))
  }

  async function etiquetasDe(filas: FilaArt[]): Promise<Etiqueta[]> {
    const extra = new Map<string, string[]>()
    if (informe === 'todos') {
      const cods = filas.map((r) => r.codigo_interno)
      for (let i = 0; i < cods.length; i += 300) {
        const { data, error: e } = await supabase
          .from('articulo_codigo_barras')
          .select('articulo_codigo, codigo_barras')
          .in('articulo_codigo', cods.slice(i, i + 300))
        if (e) throw e
        for (const b of (data ?? []) as {
          articulo_codigo: string
          codigo_barras: string
        }[])
          extra.set(b.articulo_codigo, [...(extra.get(b.articulo_codigo) ?? []), b.codigo_barras])
      }
    }
    const out: Etiqueta[] = []
    for (const r of filas) {
      const n = copias(r)
      if (n === 0 && sinCero) continue
      const codigos =
        informe === 'interno'
          ? [r.codigo_interno]
          : informe === 'todos'
            ? [...new Set([r.codigo_barras, ...(extra.get(r.codigo_interno) ?? [])].filter((x): x is string => !!x))]
            : [r.codigo_barras || r.codigo_interno]
      for (const c of codigos.length ? codigos : [r.codigo_interno])
        for (let k = 0; k < n; k++)
          out.push({
            key: `${r.codigo_interno}|${c}|${k}`,
            codigo: r.codigo_interno,
            descripcion: r.descripcion,
            barras: c,
            pvp: pvpConIgic(r),
          })
      if (out.length > MAX_ETIQUETAS) throw new Error(`Salen más de ${MAX_ETIQUETAS} etiquetas: afina los filtros o el número de etiquetas por artículo.`)
    }
    return out
  }

  async function procesar() {
    setError(null)
    const p = payload()
    if (salida === 'examinar') return setExaminar(p)
    setProcesando(true)
    try {
      const filas = await rpcTodas<FilaArt>('fn_informe_articulos', p, 5000)
      const et = await etiquetasDe(filas)
      if (!et.length) throw new Error('No sale ninguna etiqueta con esos filtros.')
      if (salida === 'pantalla') setVista(et)
      else {
        setImprimir(et)
        setTimeout(() => {
          window.print()
          setImprimir(null)
        }, 500)
      }
    } catch (e) {
      setError(msgError(e))
    } finally {
      setProcesando(false)
    }
  }

  const colsExaminar: ColInforme<FilaArt>[] = [
    { k: 'codigo_interno', l: 'Cod. Interno', w: 120 },
    { k: 'descripcion', l: 'Descripción', w: 380 },
    { k: 'codigo_barras', l: 'Cód. Barras Principal', w: 150 },
    { k: 'pvp0', l: 'PVP', w: 90, d: 3 },
    { k: 'pvp_igic', l: 'PVP + IGIC', w: 90, d: 2, v: pvpConIgic },
    { k: 'stock', l: 'Stock', w: 90, d: 3 },
    { k: 'unidades_pedido', l: 'Uds. Pedido', w: 90, d: 3 },
    { k: 'n', l: 'Nº Etiq.', w: 70, d: 0, v: copias },
  ]
  const paso = (t: string) => <span className={L}>{t}</span>

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <CabeceraInforme
        informes={INFORMES}
        informe={informe}
        setInforme={setInforme}
        soloTotales={sencilla}
        setSoloTotales={setSencilla}
        checkLabel="Usar Formato de Etiqueta sencilla"
        ordenes={ORDENES_ART}
        orden={orden}
        setOrden={setOrden}
        extraIzq={
          <label className="mt-0.5 flex items-center gap-1 text-[17px]">
            <input type="checkbox" className="h-[12px] w-[12px]" checked={sinCero} onChange={(e) => setSinCero(e.target.checked)} />
            No Listar Artículos con el número de Etiquetas igual a Cero
          </label>
        }
        derecha={
          <div className="flex w-[230px] flex-none flex-col border border-[var(--gw-border-light)] px-1.5 pb-1">
            <span className="text-[18px] font-bold leading-[22px]">Nº Etiquet. por Artíc.</span>
            <GwSelect className="!h-[28px] !text-[17px]" value={cuantas} onChange={(e) => setCuantas(e.target.value)}>
              {CUANTAS.map((c) => (
                <option key={c.v} value={c.v}>
                  {c.l}
                </option>
              ))}
            </GwSelect>
            <GwInput
              type="number"
              min={0}
              max={999}
              className="mt-0.5 !h-[28px] text-right !text-[17px]"
              style={{ width: 170 }}
              disabled={cuantas !== 'contador'}
              value={contador}
              onChange={(e) => setContador(Math.max(0, Math.min(999, Number(e.target.value) || 0)))}
            />
          </div>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden border border-[var(--gw-border-light)] p-1">
        <div className="flex flex-col gap-1">
          <div className="grid grid-cols-2 gap-3">
            <Grupo titulo="Filtrar Según Fecha">
              <CondicionCampo value={f.fecha1} onChange={(v) => set({ fecha1: v })} campos={CAMPOS_FECHA} />
            </Grupo>
            <Grupo titulo="Filtrar Según Fecha">
              <CondicionCampo value={f.fecha2} onChange={(v) => set({ fecha2: v })} campos={CAMPOS_FECHA} />
            </Grupo>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Grupo titulo={<FiltrarPor f={f} set={set} name="etq" />}>
              <RangoCodigos value={f.articulos} onChange={(r) => set({ articulos: r })} lookup={f.por === 'familia' ? 'familia' : 'articulo'} name="etq-art" />
            </Grupo>
            <Grupo titulo="Elegir Almacen y/o Filtrar por el Stock del Artículo">
              <AlmacenStock value={f.alm_stock} onChange={(v) => set({ alm_stock: v })} almacenes={almacenes} />
            </Grupo>
          </div>
          <div className="grid grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] gap-3">
            <Grupo titulo="Tienda y Número del Pedido">
              <div className="flex gap-2">
                <div className={`flex w-[118px] flex-none flex-col justify-around ${L}`}>
                  {(['rango', 'cualquiera', 'seleccionar'] as const).map((m) => (
                    <GwRadio
                      key={m}
                      name="etq-ped"
                      label={paso(m === 'rango' ? 'Desde/Hasta' : m === 'cualquiera' ? 'Cualquiera' : 'Seleccionar')}
                      checked={pedido.modo === m}
                      onChange={() => setPedido((x) => ({ ...x, modo: m }))}
                    />
                  ))}
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-between gap-[3px]">
                  <div className="grid grid-cols-[100px_minmax(0,1fr)_100px_minmax(0,1fr)] gap-1.5">
                    <CodigoBuscar value={pedido.tienda_desde} lookup="tienda" disabled={pedido.modo !== 'rango'} onChange={(v) => setPedido((x) => ({ ...x, tienda_desde: v }))} />
                    <PedidoNumero
                      value={pedido.numero_desde}
                      disabled={pedido.modo !== 'rango'}
                      onChange={(v, t) =>
                        setPedido((x) => ({
                          ...x,
                          numero_desde: v,
                          tienda_desde: t ?? x.tienda_desde,
                        }))
                      }
                    />
                    <CodigoBuscar value={pedido.tienda_hasta} lookup="tienda" disabled={pedido.modo !== 'rango'} onChange={(v) => setPedido((x) => ({ ...x, tienda_hasta: v }))} />
                    <PedidoNumero
                      value={pedido.numero_hasta}
                      disabled={pedido.modo !== 'rango'}
                      onChange={(v, t) =>
                        setPedido((x) => ({
                          ...x,
                          numero_hasta: v,
                          tienda_hasta: t ?? x.tienda_hasta,
                        }))
                      }
                    />
                  </div>
                  <span className="flex">
                    <GwInput
                      className={IN}
                      value={pedido.lista}
                      disabled={pedido.modo !== 'seleccionar'}
                      title="Pedidos tienda/número separados por comas (01/6, 01/8)"
                      onChange={(e) => setPedido((x) => ({ ...x, lista: e.target.value }))}
                    />
                    <PedidoNumero
                      soloBoton
                      value=""
                      disabled={pedido.modo !== 'seleccionar'}
                      onChange={(v, t) =>
                        setPedido((x) => ({
                          ...x,
                          lista: [x.lista, `${t}/${v}`].filter(Boolean).join(', '),
                        }))
                      }
                    />
                  </span>
                </div>
              </div>
            </Grupo>
            <Grupo titulo="Almacenes">
              <RangoCodigos value={f.almacenes} onChange={(r) => set({ almacenes: r })} lookup="almacen" name="etq-alm" anchoCodigo={105} />
            </Grupo>
          </div>
          <FiltrosArticulo f={f} set={set} almacenes={almacenes} name="etq2" sinCabecera sinAlmacenes />
        </div>
      </div>
      {error && <div className="text-[13px] text-[#c42b1c]">{error}</div>}
      <BarraSalida salida={salida} setSalida={setSalida} onProcesar={procesar} onCerrar={cerrar} procesando={procesando} />

      {vista && <VistaEtiquetas etiquetas={vista} sencilla={sencilla} sinBarras={informe === 'precio'} onCerrar={() => setVista(null)} />}
      {examinar && (
        <VisorInforme<FilaArt>
          titulo="Artículos para etiquetar"
          modo="examinar"
          cols={colsExaminar}
          cargar={(d, l) => rpcPagina<FilaArt>('fn_informe_articulos', examinar, d, l)}
          todas={() => rpcTodas<FilaArt>('fn_informe_articulos', examinar)}
          totales={(r) =>
            r ? (
              <span>
                Artículos: <b>{Number(r.total_filas).toLocaleString('es-ES')}</b>
              </span>
            ) : (
              <span>Ningún artículo.</span>
            )
          }
          clave={(r) => r.codigo_interno}
          onAbrir={(r) => navigate(`/articulos/${encodeURIComponent(r.codigo_interno)}`)}
          onCerrar={() => setExaminar(null)}
          nombreCsv="etiquetas_articulos.csv"
        />
      )}
      {imprimir && <ImprimirEtiquetas etiquetas={imprimir} sencilla={sencilla} sinBarras={informe === 'precio'} />}
    </div>
  )
}

/** Nº de pedido a proveedor con «···» (busca en pedido_proveedor y devuelve también la tienda). */
function PedidoNumero({ value, onChange, disabled, soloBoton }: { value: string; onChange: (numero: string, tienda?: string) => void; disabled?: boolean; soloBoton?: boolean }) {
  const [abierto, setAbierto] = useState(false)
  const boton = (
    <button type="button" className="gw-btn gw-lookup !h-[26px]" disabled={disabled} onClick={() => setAbierto(true)} title="Buscar pedido a proveedor">
      ···
    </button>
  )
  return (
    <span className="flex min-w-0">
      {!soloBoton && <GwInput className={`${IN} text-right`} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))} />}
      {boton}
      {abierto && <BuscarPedido onPick={(t, n) => (setAbierto(false), onChange(String(n), t))} onClose={() => setAbierto(false)} />}
    </span>
  )
}

function BuscarPedido({ onPick, onClose }: { onPick: (tienda: string, numero: number) => void; onClose: () => void }) {
  const [filas, setFilas] = useState<
    {
      tienda_terminal_codigo: string
      numero: number
      proveedor_codigo: string
      estado: string
      fecha_hora: string
    }[]
  >([])
  useEffect(() => {
    supabase
      .from('pedido_proveedor')
      .select('tienda_terminal_codigo, numero, proveedor_codigo, estado, fecha_hora')
      .order('fecha_hora', { ascending: false })
      .limit(200)
      .then(({ data }) => setFilas((data ?? []) as typeof filas))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/20 pt-24" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <GwWindow title="Pedidos a proveedor (los 200 últimos)" onClose={onClose} className="w-[640px]">
        <div className="max-h-[380px] overflow-y-auto border border-[var(--gw-border)]">
          <table className="gw-grid">
            <thead className="sticky top-0">
              <tr>
                <th>Tienda</th>
                <th>Número</th>
                <th>Fecha</th>
                <th>Proveedor</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((r) => (
                <tr key={`${r.tienda_terminal_codigo}/${r.numero}`} onDoubleClick={() => onPick(r.tienda_terminal_codigo, r.numero)} title="Doble clic: elegir">
                  <td>{r.tienda_terminal_codigo}</td>
                  <td className="text-right">{r.numero}</td>
                  <td>{r.fecha_hora ? new Date(r.fecha_hora).toLocaleDateString('es-ES') : ''}</td>
                  <td>{r.proveedor_codigo}</td>
                  <td>{r.estado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GwWindow>
    </div>,
    document.body,
  )
}

function VistaEtiquetas({ etiquetas, sencilla, sinBarras, onCerrar }: { etiquetas: Etiqueta[]; sencilla: boolean; sinBarras: boolean; onCerrar: () => void }) {
  const [imprimir, setImprimir] = useState(false)
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/20 pt-4">
      <GwWindow
        title="Etiquetas (vista previa)"
        onClose={onCerrar}
        className="h-[calc(100vh-32px)] w-[960px] max-w-[98vw] [&>div:last-child]:min-h-0 [&>div:last-child]:overflow-hidden"
      >
        <div className="flex h-full min-h-0 flex-col gap-1">
          <div className="min-h-0 flex-1 overflow-auto bg-[#9a9a9a] p-3">
            <Hojas etiquetas={etiquetas} sencilla={sencilla} sinBarras={sinBarras} pantalla />
          </div>
          <div className="flex flex-none items-center gap-2">
            <span className="flex-1 text-[14px]">
              Etiquetas: <b>{etiquetas.length}</b> · Formato {sencilla ? 'sencillo, rollo térmico 50×30 mm' : 'hoja A4 de 3×8 (70×37 mm)'}
              {!sencilla && ` · ${Math.ceil(etiquetas.length / 24)} hoja(s)`}
            </span>
            <button
              type="button"
              className="gw-btn !h-[32px] !gap-1.5 !text-[15px]"
              onClick={() => {
                setImprimir(true)
                setTimeout(() => {
                  window.print()
                  setImprimir(false)
                }, 400)
              }}
            >
              <Printer size={15} /> Imprimir
            </button>
            <button type="button" className="gw-btn !h-[32px] !gap-1.5 !text-[15px]" onClick={onCerrar}>
              <X size={15} strokeWidth={3} className="text-[#c42b1c]" /> Cerrar
            </button>
          </div>
        </div>
      </GwWindow>
      {imprimir && <ImprimirEtiquetas etiquetas={etiquetas} sencilla={sencilla} sinBarras={sinBarras} />}
    </div>,
    document.body,
  )
}

/** Bloque de impresión de etiquetas, con su tamaño de página. */
function ImprimirEtiquetas({ etiquetas, sencilla, sinBarras }: { etiquetas: Etiqueta[]; sencilla: boolean; sinBarras: boolean }): ReactNode {
  return createPortal(
    <div className="etiquetas-impresion">
      <style>{`
        .etiquetas-impresion { display: none; }
        @media print {
          @page { size: ${sencilla ? '50mm 30mm' : 'A4 portrait'}; margin: 0; }
          body * { visibility: hidden; }
          .etiquetas-impresion, .etiquetas-impresion * { visibility: visible; }
          .etiquetas-impresion { display: block; position: absolute; left: 0; top: 0; }
        }
      `}</style>
      <Hojas etiquetas={etiquetas} sencilla={sencilla} sinBarras={sinBarras} />
    </div>,
    document.body,
  )
}
