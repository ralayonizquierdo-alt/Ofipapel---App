import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwField, GwInput, GwLookupButton, GwNumber, GwTextArea, GwWindow, formatGw } from '../../../components/gw'
import { GwCampoBusqueda } from '../../../components/gw/GwCampoBusqueda'
import { gwConCeros, useListaOrdenada, type GwListaOrdenadaDef } from '../../../components/gw/GwListaOrdenada'
import { defTercero } from '../../../components/gw/listasTerceros'
import { buscarArticulo } from '../../ventas/pedidos/precios'
import { crearPeticion, empleadoActual, TIENDA_PETICION } from './peticiones'

// Compras → «Generar Petición» (CTRL+P desde cualquier pantalla). SIN CAPTURA de GeminisWin:
// alta rápida de una petición de artículo (artículo con Ctrl+Intro, cantidad, cliente opcional y
// observaciones). Si la ventana abierta es la ficha de un artículo, viene con ese artículo.

/** Evento con el que el menú abre el alta rápida (el atajo CTRL+P lo recoge el propio host). */
export const EVENTO_GENERAR_PETICION = 'gw:generar-peticion'
/** Evento que se lanza al crear una petición, para refrescar las listas abiertas. */
export const EVENTO_PETICION_CREADA = 'gw:peticion-creada'

export function defArticuloPeticion(campo: 'codigo_interno' | 'descripcion'): GwListaOrdenadaDef {
  return {
    fuente: 'articulo',
    campo,
    etiqueta: campo === 'descripcion' ? 'Descripción' : 'Código Interno',
    que: 'Artículos',
    columnas: [
      { key: 'codigo_interno', label: 'Código Interno', width: 120 },
      { key: 'descripcion', label: 'Descripción' },
      { key: 'pvp', label: 'PVP General', width: 100, decimales: 3 },
      { key: 'stock', label: 'Stock', width: 80, decimales: 2 },
      { key: 'familia_codigo', label: 'Familia', width: 80 },
    ],
  }
}

interface ArticuloPet {
  codigo: string
  descripcion: string
  proveedor: string | null
  stock: number
}

export async function datosArticuloPeticion(codigoInterno: string): Promise<ArticuloPet | null> {
  const [{ data: a }, { data: s }] = await Promise.all([
    supabase.from('articulo').select('codigo_interno, descripcion, proveedor_habitual_codigo').eq('codigo_interno', codigoInterno).maybeSingle(),
    supabase.from('articulo_almacen_stock').select('cantidad_actual').eq('articulo_codigo', codigoInterno),
  ])
  if (!a) return null
  return {
    codigo: a.codigo_interno as string,
    descripcion: (a.descripcion as string) ?? '',
    proveedor: a.proveedor_habitual_codigo as string | null,
    stock: (s ?? []).reduce((t, r) => t + Number(r.cantidad_actual ?? 0), 0),
  }
}

function GenerarPeticionDialog({ articuloInicial, onClose }: { articuloInicial: string | null; onClose: (creada?: { t: string; n: number }) => void }) {
  const listaOrd = useListaOrdenada()
  const [codigo, setCodigo] = useState(articuloInicial ?? '')
  const [art, setArt] = useState<ArticuloPet | null>(null)
  const [cantidad, setCantidad] = useState<number | null>(1)
  const [cliente, setCliente] = useState('')
  const [nombreCliente, setNombreCliente] = useState('')
  const [obs, setObs] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const cantidadRef = useRef<HTMLDivElement>(null)

  async function fijarArticulo(codigoInterno: string) {
    const a = await datosArticuloPeticion(codigoInterno)
    setArt(a)
    setCodigo(a?.codigo ?? codigoInterno)
    setError(a ? null : `No existe el artículo ${codigoInterno}.`)
    if (a) setTimeout(() => cantidadRef.current?.querySelector('input')?.focus(), 0)
  }

  async function resolverArticulo(texto: string) {
    const t = texto.trim()
    if (!t) {
      setArt(null)
      return
    }
    if (art && t === art.codigo) return
    const a = await buscarArticulo(t)
    if (a) await fijarArticulo(a.codigo_interno)
    else {
      setArt(null)
      setError(`No existe el artículo ${t}. Ctrl+Intro: lista de artículos.`)
    }
  }

  useEffect(() => {
    if (articuloInicial) fijarArticulo(articuloInicial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function resolverCliente(texto: string) {
    const t = texto.trim()
    if (!t) {
      setCliente('')
      setNombreCliente('')
      return
    }
    const { data } = await supabase.from('cliente').select('codigo, nombre').in('codigo', [t, gwConCeros(t)]).limit(1)
    if (data?.[0]) {
      setCliente(data[0].codigo as string)
      setNombreCliente((data[0].nombre as string) ?? '')
      setError(null)
    } else {
      setNombreCliente('')
      setError(`No existe el cliente ${t}. Ctrl+Intro: lista de clientes.`)
    }
  }

  async function aceptar() {
    if (!art) return setError('Indica el artículo de la petición (Ctrl+Intro: lista de artículos).')
    if (!cantidad || cantidad <= 0) return setError('La cantidad tiene que ser mayor que cero.')
    if (cliente && !nombreCliente) return setError(`No existe el cliente ${cliente}.`)
    setSaving(true)
    setError(null)
    try {
      const empleado = await empleadoActual()
      const n = await crearPeticion({
        tienda_terminal_codigo: TIENDA_PETICION,
        tipo: null,
        estado: 'pendiente',
        articulo_codigo: art.codigo,
        descripcion: art.descripcion,
        cantidad,
        cantidad_tramitada: 0,
        empleado_peticion_codigo: empleado,
        vendedor_codigo: null,
        empleado_atencion_codigo: null,
        concepto: null,
        origen_tipo: null,
        origen_tienda_terminal_codigo: null,
        origen_movimiento_numero: null,
        origen_almacen_codigo: null,
        origen_cliente_codigo: cliente || null,
        origen_nombre: nombreCliente || null,
        proveedor_codigo: null,
        fecha_prevista_entrega: null,
        observaciones: obs.trim() || null,
      })
      window.dispatchEvent(new Event(EVENTO_PETICION_CREADA))
      onClose({ t: TIENDA_PETICION, n })
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-20"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.defaultPrevented) onClose()
      }}
    >
      <GwWindow title="Generar Petición de Artículo" onClose={() => onClose()} className="w-[720px] max-w-[96vw]">
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-[150px_minmax(0,1fr)] items-end gap-x-2 gap-y-1">
            <GwField label="Artículo">
              <div className="flex gap-1">
                <GwCampoBusqueda
                  editable
                  autoFocus={!articuloInicial}
                  value={codigo}
                  title="PETICION.ARTICULO"
                  onChange={setCodigo}
                  onBlur={() => resolverArticulo(codigo)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                      e.preventDefault()
                      resolverArticulo(codigo)
                    }
                  }}
                  onLista={(t) => listaOrd.abrir(defArticuloPeticion('codigo_interno'), { texto: t, ancla: art?.codigo, onPick: (f) => fijarArticulo(String(f.codigo_interno)) })}
                />
              </div>
            </GwField>
            <GwField label="Descripción">
              <div className="flex gap-1">
                <GwInput readOnly tabIndex={-1} value={art?.descripcion ?? ''} />
                <GwLookupButton
                  title="Lista de artículos por descripción"
                  onClick={() => listaOrd.abrir(defArticuloPeticion('descripcion'), { texto: null, ancla: art?.codigo, onPick: (f) => fijarArticulo(String(f.codigo_interno)) })}
                />
              </div>
            </GwField>
          </div>
          <div className="grid grid-cols-[150px_150px_150px_minmax(0,1fr)] items-end gap-x-2">
            <GwField label="Cantidad">
              <div ref={cantidadRef}>
                <GwNumber value={cantidad} decimals={3} onChange={setCantidad} />
              </div>
            </GwField>
            <GwField label="Stock (todos alm.)">
              <GwInput readOnly tabIndex={-1} className="gw-num" value={art ? formatGw(art.stock, 3) : ''} />
            </GwField>
            <GwField label="Prov. Habitual">
              <GwInput readOnly tabIndex={-1} value={art?.proveedor ?? ''} />
            </GwField>
            <span />
          </div>
          <div className="grid grid-cols-[150px_minmax(0,1fr)] items-end gap-x-2">
            <GwField label="Cliente (opcional)">
              <GwCampoBusqueda
                editable
                value={cliente}
                title="PETICION.CLIENTE"
                onChange={(v) => {
                  setCliente(v)
                  setNombreCliente('')
                }}
                onBlur={() => resolverCliente(cliente)}
                onLista={(t) =>
                  listaOrd.abrir(defTercero('cliente', 'codigo'), {
                    texto: t,
                    ancla: cliente || null,
                    onPick: (f) => {
                      setCliente(String(f.codigo))
                      setNombreCliente(String(f.nombre ?? ''))
                      setError(null)
                    },
                  })
                }
              />
            </GwField>
            <GwField label="Nombre">
              <div className="flex gap-1">
                <GwInput readOnly tabIndex={-1} value={nombreCliente} />
                <GwLookupButton
                  title="Lista de clientes por nombre"
                  onClick={() =>
                    listaOrd.abrir(defTercero('cliente', 'nombre'), {
                      texto: null,
                      ancla: cliente || null,
                      onPick: (f) => {
                        setCliente(String(f.codigo))
                        setNombreCliente(String(f.nombre ?? ''))
                        setError(null)
                      },
                    })
                  }
                />
              </div>
            </GwField>
          </div>
          <GwField label="Observaciones">
            <GwTextArea rows={3} value={obs} title="PETICION.OBSERV" onChange={(e) => setObs(e.target.value)} />
          </GwField>
          {error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[13px] text-[#a4262c]">{error}</div>}
          <div className="flex items-center justify-end gap-1.5">
            <span className="flex-1 text-[12px] text-[#555]">Tienda {TIENDA_PETICION} · Estado: Pendiente · Ctrl+Intro en Artículo o Cliente: lista ordenada</span>
            <button type="button" className="gw-btn w-[110px]" disabled={saving} onClick={aceptar}>
              <Check size={15} strokeWidth={3} className="text-[#127a12]" /> {saving ? 'Grabando…' : 'Aceptar'}
            </button>
            <button type="button" className="gw-btn w-[110px]" disabled={saving} onClick={() => onClose()}>
              <X size={15} strokeWidth={3} className="text-[#c42b1c]" /> Cancelar
            </button>
          </div>
        </div>
      </GwWindow>
      {listaOrd.dialogo}
    </div>
  )
}

/**
 * Host global del alta rápida: CTRL+P desde cualquier pantalla (o el menú Compras → Generar
 * Petición) abre el diálogo; en la ficha de un artículo viene con ese artículo.
 */
export function GenerarPeticionHost() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [abierto, setAbierto] = useState<{ articulo: string | null } | null>(null)
  const [aviso, setAviso] = useState<{ t: string; n: number } | null>(null)
  const ruta = useRef(pathname)
  ruta.current = pathname

  useEffect(() => {
    const abrir = () => {
      const m = ruta.current.match(/^\/articulos\/([^/]+)$/)
      const codigo = m && m[1] !== 'lista' && m[1] !== 'nuevo' ? decodeURIComponent(m[1]) : null
      setAbierto((a) => a ?? { articulo: codigo })
    }
    const tecla = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && !ev.shiftKey && ev.key.toLowerCase() === 'p') {
        ev.preventDefault()
        abrir()
      }
    }
    window.addEventListener('keydown', tecla)
    window.addEventListener(EVENTO_GENERAR_PETICION, abrir)
    return () => {
      window.removeEventListener('keydown', tecla)
      window.removeEventListener(EVENTO_GENERAR_PETICION, abrir)
    }
  }, [])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 6000)
    return () => clearTimeout(t)
  }, [aviso])

  return (
    <>
      {abierto && (
        <GenerarPeticionDialog
          articuloInicial={abierto.articulo}
          onClose={(creada) => {
            setAbierto(null)
            if (creada) setAviso(creada)
          }}
        />
      )}
      {aviso && (
        <div className="fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 border border-[#2a9d2a] bg-[#e7f6e7] px-3 py-1.5 text-[13px] shadow">
          Petición {aviso.t}/{aviso.n} creada (Pendiente).
          <button type="button" className="text-[#1a4fd0] underline" onClick={() => navigate(`/peticiones/${encodeURIComponent(aviso.t)}/${aviso.n}`)}>
            Ver petición
          </button>
        </div>
      )}
    </>
  )
}
