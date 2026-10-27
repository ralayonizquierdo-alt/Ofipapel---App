import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronUp, ChevronsDown, ChevronsUp, DoorOpen, FilePen, FilePlus2, FileX2, Printer, ScanBarcode } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwInput, GwLookupButton, GwNumber, GwSelect, GwWindow, formatGw } from '../../../components/gw'
import { GwLookupDialog } from '../../../components/gw/GwLookupDialog'
import {
  actualizarInventario,
  anadirLinea,
  cargarLineas,
  crearInventario,
  normalizarCab,
  resolverArticulo,
  tomarLinea,
  vacia,
  CAMPOS_CAB,
  type Cabecera,
  type Linea,
} from '../inventarios/logica'
import { msgError, useAlmacenes, useTiendas } from './comun'

// Almacén → Inventariar Almacén. Calcada de la captura 06-28 (ventana pequeña «Inventariar
// Almacén», vacía y sin procesar): Almacén (código + nombre + «···»), Nº Invent. con «···» y el
// botón «Invent. Artic.», rejilla Código · Descripción · Cantidad y la barra de abajo. Es la toma
// rápida de un inventario: se elige el almacén, el inventario pendiente (0 = uno nuevo, que se crea
// con la primera línea), se teclean o leen los artículos con su cantidad y «Invent. Artic.»
// aplica el inventario al stock con la misma lógica que la ficha de Inventarios (inventarios/logica.ts).

type Modo = 'consulta' | 'alta' | 'edicion'

export function InventariarAlmacenPage() {
  const navigate = useNavigate()
  const almacenes = useAlmacenes()
  const tiendas = useTiendas()
  const [almacen, setAlmacen] = useState('')
  const [cab, setCab] = useState<Cabecera | null>(null)
  const [numero, setNumero] = useState(0)
  const [lineas, setLineas] = useState<Linea[]>([])
  const [sel, setSel] = useState(0)
  const [modo, setModo] = useState<Modo>('consulta')
  const [codigo, setCodigo] = useState('')
  const [desc, setDesc] = useState('')
  const [cantidad, setCantidad] = useState<number | null>(1)
  const [msg, setMsg] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [dialogo, setDialogo] = useState<null | 'almacen' | 'inventario'>(null)
  const codigoRef = useRef<HTMLInputElement>(null)
  const filaRef = useRef<HTMLTableRowElement>(null)

  const tiendaDe = useCallback((alm: string) => tiendas.find((t) => t.almacen_codigo === alm)?.codigo ?? tiendas[0]?.codigo ?? '', [tiendas])

  const cargar = useCallback(async (t: string, n: number) => {
    const { data } = await supabase.from('inventario').select(CAMPOS_CAB).eq('tienda_terminal_codigo', t).eq('numero', n).maybeSingle()
    if (!data) return
    const c = normalizarCab(data as Record<string, unknown>)
    setCab(c)
    setNumero(n)
    setLineas(await cargarLineas({ tienda_terminal_codigo: t, numero: n }))
    setSel(0)
  }, [])

  useEffect(() => {
    filaRef.current?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  function elegirAlmacen(a: string) {
    setAlmacen(a)
    setCab(null)
    setNumero(0)
    setLineas([])
    setMsg(null)
  }

  async function aceptarLinea() {
    if (!almacen) return setMsg('Elige primero el almacén.')
    setOcupado(true)
    setMsg(null)
    let c = cab
    try {
      if (modo === 'edicion') {
        const l = lineas[sel]
        if (!c?.numero || !l) return
        const r = await tomarLinea({ tienda_terminal_codigo: c.tienda_terminal_codigo, numero: c.numero }, c, l, cantidad, (m) => confirm(m))
        if (r === 'descartada') setMsg('Toma descartada.')
      } else {
        const art = await resolverArticulo(codigo, true)
        if (!art) throw new Error(`No existe ningún artículo con el código ${codigo}.`)
        if (!c?.numero) {
          const nueva = { ...vacia(tiendaDe(almacen), almacen), nombre: `Inventariar almacén ${almacen}` }
          const creada = await crearInventario(nueva)
          c = { ...nueva, numero: creada.numero }
          setCab(c)
          setNumero(creada.numero)
        }
        const clave = { tienda_terminal_codigo: c.tienda_terminal_codigo, numero: c.numero! }
        const actuales = await cargarLineas(clave)
        const ya = actuales.find((l) => l.articulo_codigo === art.codigo_interno)
        if (ya) {
          // Ya contado: se suma lo nuevo (lectura de varias unidades seguidas con el lector).
          await tomarLinea(clave, c, ya, Number(ya.cantidad_contada ?? 0) + Number(cantidad ?? 0), (m) => confirm(m))
        } else {
          await anadirLinea(clave, almacen, art, cantidad, actuales.reduce((m, l) => Math.max(m, l.numero_linea), 0) + 1)
        }
      }
      if (c?.numero) {
        const ls = await cargarLineas({ tienda_terminal_codigo: c.tienda_terminal_codigo, numero: c.numero })
        setLineas(ls)
        const i = ls.findIndex((l) => l.articulo_codigo.toUpperCase() === codigo.trim().toUpperCase())
        setSel(i >= 0 ? i : ls.length - 1)
      }
      if (modo === 'alta') {
        setCodigo('')
        setDesc('')
        setCantidad(1)
        setTimeout(() => codigoRef.current?.focus(), 0)
      } else setModo('consulta')
    } catch (e) {
      setMsg(msgError(e))
    } finally {
      setOcupado(false)
    }
  }

  async function borrarLinea() {
    const l = lineas[sel]
    if (!cab || !l || !confirm(`¿Quitar ${l.articulo_codigo} del inventario?`)) return
    const { error } = await supabase
      .from('inventario_linea')
      .delete()
      .eq('tienda_terminal_codigo', cab.tienda_terminal_codigo)
      .eq('numero', cab.numero!)
      .eq('numero_linea', l.numero_linea)
    if (error) return setMsg(error.message)
    setLineas(await cargarLineas({ tienda_terminal_codigo: cab.tienda_terminal_codigo, numero: cab.numero! }))
    setSel((s) => Math.max(0, s - 1))
  }

  async function inventariar() {
    if (!cab?.numero) return
    const contadas = lineas.filter((l) => l.cantidad_contada != null).length
    if (!confirm(`¿Inventariar ${contadas} artículo(s) en el almacén ${almacen}?\nEl stock pasará a ser la cantidad contada (se crea antes un punto de restauración).`)) return
    setOcupado(true)
    try {
      setMsg(await actualizarInventario({ tienda_terminal_codigo: cab.tienda_terminal_codigo, numero: cab.numero }, cab))
      await cargar(cab.tienda_terminal_codigo, cab.numero)
    } catch (e) {
      setMsg(msgError(e))
    } finally {
      setOcupado(false)
    }
  }

  const editando = modo !== 'consulta'
  const inventariado = cab?.estado === 'inventariado'
  const b =
    'flex h-[40px] flex-1 items-center justify-center border border-[var(--gw-border-light)] text-[#1d3a8a] hover:bg-[#e5f1fb] disabled:text-[#a8a8a8] disabled:hover:bg-transparent'

  return (
    <div className="flex h-full items-start justify-center pt-6">
      <div className="flex w-[430px] flex-col gap-1 border border-[var(--gw-border)] bg-[var(--gw-face)] p-1.5 shadow">
        <fieldset className="gw-group !pt-0">
          <legend className="text-[20px]">Almacén</legend>
          <div className="flex gap-1">
            <GwInput className="!h-[34px] flex-none !text-[18px]" style={{ width: 70 }} value={almacen} onChange={(e) => elegirAlmacen(e.target.value)} />
            <GwSelect className="!h-[34px] !text-[16px]" value={almacen} onChange={(e) => elegirAlmacen(e.target.value)}>
              <option value="" />
              {almacenes.map((a) => (
                <option key={a.codigo} value={a.codigo}>
                  {a.nombre}
                </option>
              ))}
            </GwSelect>
            <GwLookupButton onClick={() => setDialogo('almacen')} />
          </div>
        </fieldset>
        <div className="flex items-center gap-1">
          <span className="whitespace-nowrap text-[20px]">Nº Invent.:</span>
          <span className="flex">
            <GwInput
              className="!h-[34px] text-right !text-[20px]"
              style={{ width: 110 }}
              readOnly
              value={numero}
              title={cab ? `Inventario ${cab.tienda_terminal_codigo}-${cab.numero} · ${cab.estado}` : '0 = uno nuevo, se crea con la primera línea'}
            />
            <GwLookupButton disabled={!almacen} onClick={() => setDialogo('inventario')} title="Inventarios pendientes de este almacén" />
          </span>
          <button
            type="button"
            className="gw-btn ml-auto !h-[38px] !gap-1 whitespace-nowrap !px-2 !text-[18px]"
            disabled={!cab?.numero || inventariado || editando || ocupado || !lineas.length}
            title="Aplicar el inventario al stock"
            onClick={inventariar}
          >
            <ScanBarcode size={16} /> Invent. Artic.
          </button>
        </div>
        <div className="h-[300px] overflow-y-auto border border-[var(--gw-border)] bg-white">
          <table className="gw-grid table-fixed">
            <thead className="sticky top-0">
              <tr>
                <th style={{ width: 10 }} />
                <th style={{ width: 84 }} className="!text-[16px]">
                  Código
                </th>
                <th className="!text-[16px]">Descripción</th>
                <th style={{ width: 74 }} className="!text-[16px]">
                  Cantidad
                </th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, i) => (
                <tr key={l.numero_linea} ref={i === sel ? filaRef : undefined} className={i === sel && !editando ? 'gw-selected' : ''} onClick={() => !editando && setSel(i)}>
                  <td className="!px-0" />
                  <td className="truncate">{l.articulo_codigo}</td>
                  <td className="truncate">{l.descripcion}</td>
                  <td className="text-right">{l.cantidad_contada == null ? '' : formatGw(l.cantidad_contada, 3)}</td>
                </tr>
              ))}
              {Array.from({ length: Math.max(0, 13 - lineas.length) }, (_, i) => (
                <tr key={`v${i}`}>
                  <td />
                  <td>&nbsp;</td>
                  <td />
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editando && (
          <div className="grid grid-cols-[120px_minmax(0,1fr)_86px] gap-1">
            <input
              ref={codigoRef}
              className="gw-input"
              autoFocus
              disabled={modo === 'edicion'}
              placeholder="Código / barras"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key !== 'Enter') return
                const a = await resolverArticulo(codigo, true)
                setDesc(a?.descripcion ?? 'No existe')
                if (a) aceptarLinea()
              }}
              onBlur={async () => codigo && setDesc((await resolverArticulo(codigo, true))?.descripcion ?? 'No existe')}
            />
            <GwInput readOnly tabIndex={-1} value={desc} />
            <GwNumber decimals={3} value={cantidad} onChange={setCantidad} emptyAsZero />
            <div className="col-span-3 flex justify-end gap-1">
              <button type="button" className="gw-btn" disabled={ocupado} onClick={aceptarLinea}>
                Aceptar
              </button>
              <button type="button" className="gw-btn" onClick={() => setModo('consulta')}>
                Terminar
              </button>
            </div>
          </div>
        )}
        {msg && <div className={`text-[13px] ${/^Inventario actualizado|Toma/.test(msg) ? 'text-[#127a12]' : 'text-[#c42b1c]'}`}>{msg}</div>}
        <div className="flex gap-[2px]">
          <button type="button" className={b} title="Primero" disabled={editando || !lineas.length} onClick={() => setSel(0)}>
            <ChevronsUp size={18} />
          </button>
          <button type="button" className={b} title="Anterior" disabled={editando || sel <= 0} onClick={() => setSel((s) => s - 1)}>
            <ChevronUp size={18} />
          </button>
          <button type="button" className={b} title="Siguiente" disabled={editando || sel >= lineas.length - 1} onClick={() => setSel((s) => s + 1)}>
            <ChevronDown size={18} />
          </button>
          <button type="button" className={b} title="Último" disabled={editando || !lineas.length} onClick={() => setSel(lineas.length - 1)}>
            <ChevronsDown size={18} />
          </button>
          <button type="button" className={b} title="Imprimir" disabled={!lineas.length} onClick={() => window.print()}>
            <Printer size={17} />
          </button>
          <button
            type="button"
            className={b}
            title="Nueva línea"
            disabled={!almacen || editando || inventariado}
            onClick={() => {
              setCodigo('')
              setDesc('')
              setCantidad(1)
              setModo('alta')
            }}
          >
            <FilePlus2 size={17} />
          </button>
          <button
            type="button"
            className={b}
            title="Modificar la cantidad"
            disabled={editando || !lineas[sel] || inventariado}
            onClick={() => {
              setCodigo(lineas[sel].articulo_codigo)
              setDesc(lineas[sel].descripcion ?? '')
              setCantidad(lineas[sel].cantidad_contada)
              setModo('edicion')
            }}
          >
            <FilePen size={17} />
          </button>
          <button type="button" className={b} title="Quitar la línea" disabled={editando || !lineas[sel] || inventariado} onClick={borrarLinea}>
            <FileX2 size={17} />
          </button>
          <button type="button" className={b} title="Salir" onClick={() => navigate('/')}>
            <DoorOpen size={17} />
          </button>
        </div>
      </div>

      {dialogo === 'almacen' && (
        <GwLookupDialog<Record<string, unknown>>
          title="Almacenes"
          table="almacen"
          columns={[
            { key: 'codigo', label: 'Código', width: 80 },
            { key: 'nombre', label: 'Nombre' },
          ]}
          searchColumns={['codigo', 'nombre']}
          orderBy="codigo"
          keyColumn="codigo"
          onPick={(r) => (setDialogo(null), elegirAlmacen(String(r.codigo)))}
          onClose={() => setDialogo(null)}
        />
      )}
      {dialogo === 'inventario' && (
        <ElegirInventario
          almacen={almacen}
          onPick={(t, n) => {
            setDialogo(null)
            if (n === 0) {
              setCab(null)
              setNumero(0)
              setLineas([])
            } else cargar(t, n)
          }}
          onClose={() => setDialogo(null)}
        />
      )}
    </div>
  )
}

function ElegirInventario({ almacen, onPick, onClose }: { almacen: string; onPick: (tienda: string, numero: number) => void; onClose: () => void }) {
  const [filas, setFilas] = useState<{ tienda_terminal_codigo: string; numero: number; nombre: string | null; fecha: string; estado: string }[]>([])
  useEffect(() => {
    supabase
      .from('inventario')
      .select('tienda_terminal_codigo, numero, nombre, fecha, estado')
      .eq('almacen_codigo', almacen)
      .order('numero', { ascending: false })
      .limit(100)
      .then(({ data }) => setFilas((data ?? []) as typeof filas))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [almacen])
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/20 pt-24" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <GwWindow title={`Inventarios del almacén ${almacen}`} onClose={onClose} className="w-[560px]">
        <div className="flex flex-col gap-1.5">
          <div className="max-h-[340px] overflow-y-auto border border-[var(--gw-border)]">
            <table className="gw-grid">
              <thead className="sticky top-0">
                <tr>
                  <th>Tienda</th>
                  <th>Número</th>
                  <th>Fecha</th>
                  <th>Nombre</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                <tr onDoubleClick={() => onPick('', 0)} title="Doble clic: empezar uno nuevo">
                  <td />
                  <td className="text-right">0</td>
                  <td />
                  <td colSpan={2}>(nuevo inventario: se crea con la primera línea)</td>
                </tr>
                {filas.map((r) => (
                  <tr key={`${r.tienda_terminal_codigo}-${r.numero}`} onDoubleClick={() => onPick(r.tienda_terminal_codigo, r.numero)} title="Doble clic: elegir">
                    <td>{r.tienda_terminal_codigo}</td>
                    <td className="text-right">{r.numero}</td>
                    <td>{new Date(`${r.fecha}T00:00:00`).toLocaleDateString('es-ES')}</td>
                    <td className="truncate">{r.nombre}</td>
                    <td>{r.estado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <span className="text-[12px] text-[#444]">Doble clic para elegir. Los ya inventariados se ven pero no se pueden tocar.</span>
        </div>
      </GwWindow>
    </div>,
    document.body,
  )
}
