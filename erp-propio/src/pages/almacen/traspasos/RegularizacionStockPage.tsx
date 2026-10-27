import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowDownAZ,
  Binoculars,
  ChevronFirst,
  ChevronLast,
  DoorOpen,
  FilePen,
  FilePlus2,
  FileX2,
  Play,
  Printer,
  Save,
  ScanBarcode,
  X,
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwInput, GwLookupButton, GwNumber, GwSelect, formatGw } from '../../../components/gw'
import { GwLookupDialog } from '../../../components/gw/GwLookupDialog'
import { BIG_INPUT, BIG_LABEL, BtnTexto, type ArticuloStock, fechaHora, resolverArticulo, stockDe } from './comun'
import { GwDateTime } from '../../../components/gw/GwDateTime'
import { navDir, navIndice, useNavRegistro, type NavDir, type NavFiltro } from '../../../components/gw/useNavRegistro'

/** Las regularizaciones anuladas no se recorren con la barra. */
const soloActivas: NavFiltro = (q) => q.neq('activo', false)
import { EntradaRapida } from './TraspasoFichaPage'

// Regularización de stock (GeminisWin: un registro por artículo y almacén, documento USR_STK).
// Abre en consulta; el número se asigna al guardar. Guardar genera el movimiento por la diferencia.

type Modo = 'consulta' | 'edicion' | 'alta'

interface Reg {
  tienda: string
  numero: number | null
  articulo_codigo: string
  almacen_codigo: string
  fecha: string
  documento_externo: string | null
  cantidad: number
  precio: number | null
  stock_anterior: number | null
  inventario_tienda_terminal_codigo: string | null
  inventario_numero: number | null
  creado_en: string | null
}

const COLS =
  'tienda:tienda_terminal_codigo, numero, articulo_codigo, almacen_codigo, fecha, documento_externo, cantidad, precio, stock_anterior, inventario_tienda_terminal_codigo, inventario_numero, creado_en'
const DOC_DEFECTO = 'USR_STK'

/** Movimiento de stock por una variación (positiva entra, negativa sale); 0 no genera nada. */
async function moverDiferencia(r: Reg, numero: number, delta: number, nota: string | null) {
  if (!delta) return null
  const { error } = await supabase.from('movimiento_stock').insert({
    tipo_movimiento: 'regularizacion',
    sentido: delta > 0 ? 1 : -1,
    almacen_codigo: r.almacen_codigo,
    articulo_codigo: r.articulo_codigo,
    cantidad: Math.abs(delta),
    costo_unitario: r.precio,
    documento_origen_tipo: 'regularizacion_stock',
    documento_origen_tienda_codigo: r.tienda,
    documento_origen_numero: numero,
    tienda_terminal_codigo: r.tienda,
    observaciones: nota,
  })
  return error
}

async function guardarUna(base: Reg, a: ArticuloStock, nuevo: number): Promise<number> {
  const anterior = await stockDe(a.codigo_interno, base.almacen_codigo)
  const { data: n, error: e1 } = await supabase.rpc('fn_siguiente_numero', {
    p_tienda: base.tienda,
    p_tipo_documento: 'regularizacion_stock',
    p_serie: '',
  })
  if (e1) throw e1
  const numero = Number(n)
  const reg: Reg = { ...base, numero, articulo_codigo: a.codigo_interno, cantidad: nuevo, stock_anterior: anterior, precio: a.coste_bruto }
  const { error: e2 } = await supabase.from('regularizacion_stock').insert({
    tienda_terminal_codigo: reg.tienda,
    numero,
    articulo_codigo: reg.articulo_codigo,
    almacen_codigo: reg.almacen_codigo,
    fecha: reg.fecha,
    documento_externo: reg.documento_externo || DOC_DEFECTO,
    cantidad: nuevo,
    precio: reg.precio,
    stock_anterior: anterior,
    activo: true,
  })
  if (e2) throw e2
  const e3 = await moverDiferencia(reg, numero, nuevo - anterior, null)
  if (e3) throw e3
  return numero
}

export function RegularizacionStockPage() {
  const navigate = useNavigate()
  const partes = (useParams()['*'] ?? '').split('/').filter(Boolean)
  const esNuevo = partes[0] === 'nuevo'
  const claveTienda = !esNuevo && partes.length >= 2 ? decodeURIComponent(partes[0]) : null
  const claveNumero = !esNuevo && partes.length >= 2 ? Number(partes[1]) : null

  const [modo, setModo] = useState<Modo>('consulta')
  const [reg, setReg] = useState<Reg | null>(null)
  const [orig, setOrig] = useState<Reg | null>(null)
  const [tiendas, setTiendas] = useState<{ codigo: string; almacen_codigo: string | null }[]>([])
  const [almacenes, setAlmacenes] = useState<{ codigo: string; nombre: string }[]>([])
  const [descripcion, setDescripcion] = useState('')
  const [articulo, setArticulo] = useState<ArticuloStock | null>(null)
  const [stockActual, setStockActual] = useState(0)
  const [ordenDesc, setOrdenDesc] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [refresco, setRefresco] = useState(0)
  const [dialogo, setDialogo] = useState<null | 'buscar' | 'almacen' | 'articulo' | 'documento' | 'rapida'>(null)

  const editable = modo !== 'consulta'

  useEffect(() => {
    Promise.all([
      supabase.from('tienda_terminal').select('codigo, almacen_codigo').order('codigo'),
      supabase.from('almacen').select('codigo, nombre').order('codigo'),
    ]).then(([t, a]) => {
      setTiendas((t.data ?? []) as { codigo: string; almacen_codigo: string | null }[])
      setAlmacenes((a.data ?? []) as { codigo: string; nombre: string }[])
    })
  }, [])

  // Navegación contra el servidor: solo el vecino (gt/lt + limit 1) y el recuento, nunca la lista.
  const nav = useNavRegistro<{ tienda_terminal_codigo: string; numero: number }>({
    tabla: 'regularizacion_stock',
    orden: ['tienda_terminal_codigo', 'numero'],
    actual: reg?.numero != null ? [reg.tienda, reg.numero] : null,
    filtro: soloActivas,
  })
  const cargarClaves = nav.refrescar

  const vacia = useCallback((): Reg => {
    const t = tiendas[0]
    return {
      tienda: t?.codigo ?? '',
      numero: null,
      articulo_codigo: '',
      almacen_codigo: t?.almacen_codigo ?? '',
      fecha: new Date().toISOString(),
      documento_externo: DOC_DEFECTO,
      cantidad: 0,
      precio: null,
      stock_anterior: null,
      inventario_tienda_terminal_codigo: null,
      inventario_numero: null,
      creado_en: null,
    }
  }, [tiendas])

  useEffect(() => {
    let cancel = false
    async function run() {
      setMensaje(null)
      if (esNuevo) {
        if (tiendas.length === 0) return
        setReg(vacia())
        setOrig(null)
        setArticulo(null)
        setModo('alta')
        return
      }
      let q = supabase.from('regularizacion_stock').select(COLS).neq('activo', false)
      if (claveTienda && claveNumero != null) q = q.eq('tienda_terminal_codigo', claveTienda).eq('numero', claveNumero)
      else q = q.order('creado_en', { ascending: false }).order('numero', { ascending: false })
      const { data } = await q.limit(1)
      if (cancel) return
      const r = ((data ?? [])[0] as Reg | undefined) ?? null
      setReg(r)
      setOrig(r)
      setModo('consulta')
    }
    run()
    return () => {
      cancel = true
    }
  }, [esNuevo, claveTienda, claveNumero, tiendas, vacia])

  useEffect(() => {
    const cod = reg?.articulo_codigo
    if (!cod) {
      setDescripcion('')
      return
    }
    resolverArticulo(cod).then((a) => {
      setArticulo(a)
      setDescripcion(a?.descripcion ?? '')
    })
  }, [reg?.articulo_codigo])

  useEffect(() => {
    if (!reg?.articulo_codigo || !reg.almacen_codigo) return setStockActual(0)
    stockDe(reg.articulo_codigo, reg.almacen_codigo).then(setStockActual)
  }, [reg?.articulo_codigo, reg?.almacen_codigo, reg?.numero, refresco])

  const patch = (p: Partial<Reg>) => setReg((r) => (r ? { ...r, ...p } : r))
  const irA = (t: string, n: number) => navigate(`/regularizacion-stock/${encodeURIComponent(t)}/${n}`)
  const idx = navIndice(nav, ordenDesc)
  const totalClaves = nav.total ?? 0
  async function navegar(d: NavDir) {
    const f = await nav.ir(navDir(d, ordenDesc))
    if (f) irA(f.tienda_terminal_codigo, Number(f.numero))
  }

  // En alta el stock antiguo es el actual; en consulta, el que había al regularizar.
  const antiguo = modo === 'alta' ? stockActual : Number(reg?.stock_anterior ?? 0)
  const diferencia = (reg?.cantidad ?? 0) - antiguo

  async function cambiarArticulo(codigo: string) {
    if (!codigo.trim()) return
    const a = await resolverArticulo(codigo)
    if (!a) {
      setMensaje(`No existe ningún artículo con el código ${codigo}.`)
      setDescripcion('')
      return
    }
    setMensaje(null)
    patch({ articulo_codigo: a.codigo_interno })
  }

  async function guardar() {
    if (!reg) return
    if (!reg.almacen_codigo) return setMensaje('Indica el almacén.')
    if (!reg.articulo_codigo || !articulo) return setMensaje('Indica un artículo válido.')
    setGuardando(true)
    setMensaje(null)
    try {
      if (modo === 'alta') {
        const numero = await guardarUna({ ...reg, fecha: reg.fecha }, articulo, reg.cantidad)
        cargarClaves()
        setModo('consulta')
        irA(reg.tienda, numero)
      } else {
        // Modificación: solo nuevo stock, fecha y documento; el stock se corrige por lo que cambie el nuevo stock.
        const { error } = await supabase
          .from('regularizacion_stock')
          .update({ cantidad: reg.cantidad, fecha: reg.fecha, documento_externo: reg.documento_externo || DOC_DEFECTO })
          .eq('tienda_terminal_codigo', reg.tienda)
          .eq('numero', reg.numero!)
          .eq('articulo_codigo', reg.articulo_codigo)
        if (error) throw error
        const e = await moverDiferencia(reg, reg.numero!, reg.cantidad - (orig?.cantidad ?? reg.cantidad), 'Modificación de la regularización')
        if (e) throw e
        setOrig(reg)
        setModo('consulta')
        setRefresco((x) => x + 1)
      }
    } catch (e) {
      setMensaje(`No se ha podido guardar: ${(e as { message?: string }).message ?? String(e)}`)
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar() {
    if (!reg || reg.numero == null) return
    if (!window.confirm(`¿Eliminar la regularización ${reg.numero}? El stock volverá a ${formatGw(Number(reg.stock_anterior ?? 0), 3)} unidades menos lo movido después.`)) return
    setGuardando(true)
    try {
      const e = await moverDiferencia(reg, reg.numero, Number(reg.stock_anterior ?? 0) - reg.cantidad, 'Anulación de la regularización')
      if (e) throw e
      const { error } = await supabase
        .from('regularizacion_stock')
        .update({ activo: false })
        .eq('tienda_terminal_codigo', reg.tienda)
        .eq('numero', reg.numero)
        .eq('articulo_codigo', reg.articulo_codigo)
      if (error) throw error
      cargarClaves()
      navigate('/regularizacion-stock')
    } catch (e) {
      setMensaje(`No se ha podido eliminar: ${(e as { message?: string }).message ?? String(e)}`)
    } finally {
      setGuardando(false)
    }
  }

  function cancelar() {
    setMensaje(null)
    if (modo === 'alta') {
      if (totalClaves) void navegar('ultimo')
      else {
        setReg(null)
        setModo('consulta')
        navigate('/regularizacion-stock')
      }
      return
    }
    setReg(orig)
    setModo('consulta')
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!editable) return
      if (e.key === 'F1') {
        e.preventDefault()
        guardar()
      } else if (e.key === 'Backspace' && e.altKey) {
        e.preventDefault()
        cancelar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const r = reg ?? vacia()
  const sinDoc = !reg

  return (
    <div className="mx-auto flex w-[820px] max-w-full flex-col gap-2">
      <div className="grid grid-cols-[70px_100px_200px_minmax(0,1fr)_170px] items-end gap-2">
        <label className="flex flex-col">
          <span className={BIG_LABEL}>Tienda</span>
          <GwSelect className={BIG_INPUT} disabled={modo !== 'alta'} value={r.tienda} onChange={(e) => patch({ tienda: e.target.value })}>
            {tiendas.map((t) => (
              <option key={t.codigo} value={t.codigo}>
                {t.codigo}
              </option>
            ))}
          </GwSelect>
        </label>
        <label className="flex flex-col">
          <span className={BIG_LABEL}>Número</span>
          <GwInput className={`${BIG_INPUT} text-right`} readOnly value={r.numero ?? ''} title="Se asigna al guardar" />
        </label>
        <label className="flex flex-col">
          <span className={BIG_LABEL}>Fecha y Hora</span>
          {editable ? (
            <GwDateTime
              className={BIG_INPUT}
              title="dd/mm/aaaa hh:mm · +/- día · H ahora · F4 calendario"
              value={r.fecha}
              onChange={(v) => v && patch({ fecha: v })}
            />
          ) : (
            <GwInput className={BIG_INPUT} readOnly value={sinDoc ? '' : fechaHora(r.fecha)} />
          )}
        </label>
        <label className="flex flex-col">
          <span className={BIG_LABEL}>Documento</span>
          <span className="flex">
            <GwInput className={BIG_INPUT} disabled={!editable} value={r.documento_externo ?? ''} onChange={(e) => patch({ documento_externo: e.target.value || null })} />
            <GwLookupButton disabled={!editable} onClick={() => setDialogo('documento')} title="Buscar documento" />
          </span>
        </label>
        <button
          type="button"
          className="gw-btn !h-[44px] !text-[16px]"
          disabled={editable || guardando}
          onClick={() => setDialogo('rapida')}
          title="Regularizar varios artículos seguidos con lector o teclado"
        >
          <ScanBarcode size={16} /> Entrada Rápida
        </button>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_200px] items-end gap-3">
        <fieldset className="gw-group !pt-1">
          <legend className={BIG_LABEL}>Almacén</legend>
          <div className="grid grid-cols-[70px_minmax(0,1fr)] gap-1">
            <GwInput className={BIG_INPUT} disabled={modo !== 'alta'} value={r.almacen_codigo} onChange={(e) => patch({ almacen_codigo: e.target.value })} />
            <span className="flex">
              <GwInput className={BIG_INPUT} readOnly tabIndex={-1} value={almacenes.find((a) => a.codigo === r.almacen_codigo)?.nombre ?? ''} />
              <GwLookupButton disabled={modo !== 'alta'} onClick={() => setDialogo('almacen')} title="Buscar almacén" />
            </span>
          </div>
        </fieldset>
        <div className="flex flex-col items-center pb-1">
          <span className={BIG_LABEL}>Stock Actual</span>
          <span className="text-[24px] font-bold leading-[28px] text-[#1a4fd0]">{r.articulo_codigo ? formatGw(stockActual, 3) : ''}</span>
        </div>
      </div>

      <fieldset className="gw-group !pt-1">
        <legend className={BIG_LABEL}>Artículo</legend>
        <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-1">
          <GwInput
            key={`${r.tienda}-${r.numero}-${modo}`}
            className={BIG_INPUT}
            disabled={modo !== 'alta'}
            defaultValue={r.articulo_codigo}
            onBlur={(e) => e.target.value !== r.articulo_codigo && cambiarArticulo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <span className="flex">
            <GwInput className={BIG_INPUT} readOnly tabIndex={-1} value={descripcion} />
            <GwLookupButton disabled={modo !== 'alta'} onClick={() => setDialogo('articulo')} title="Buscar artículo" />
          </span>
        </div>
      </fieldset>

      <div className="grid grid-cols-4 gap-3">
        <label className="flex flex-col">
          <span className={BIG_LABEL}>Nuevo Stock</span>
          <GwNumber className={`${BIG_INPUT} font-bold`} decimals={3} disabled={!editable} value={r.cantidad} onChange={(v) => patch({ cantidad: v ?? 0 })} emptyAsZero />
        </label>
        <div className="flex flex-col">
          <span className={BIG_LABEL}>Stock Antiguo</span>
          <span className={`gw-input ${BIG_INPUT} flex items-center justify-end font-bold ${antiguo < 0 ? 'text-[#c42b1c]' : ''}`}>
            {r.articulo_codigo ? formatGw(antiguo, 3) : ''}
          </span>
        </div>
        <div className="flex flex-col">
          <span className={BIG_LABEL}>Diferencia</span>
          <span className={`gw-input ${BIG_INPUT} flex items-center justify-end font-bold text-[#1a4fd0]`}>{r.articulo_codigo ? formatGw(diferencia, 3) : ''}</span>
        </div>
        <div className="flex flex-col">
          <span className={BIG_LABEL}>Fecha y Hora de Alta</span>
          <span className={`gw-input ${BIG_INPUT} flex items-center text-[#1a4fd0]`}>{fechaHora(r.creado_en)}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className={`${BIG_LABEL} whitespace-nowrap`}>Nº de Inventario:</span>
        <span className={`gw-input ${BIG_INPUT} flex w-[160px] items-center justify-end`} title="Se rellena cuando la regularización sale de un inventario">
          {r.inventario_numero != null ? `${r.inventario_tienda_terminal_codigo ?? ''}/${r.inventario_numero}` : ''}
        </span>
      </div>

      {mensaje && <p className="gw-label text-[#c42b1c]">{mensaje}</p>}
      {sinDoc && modo === 'consulta' && <p className="gw-label text-[#1a4fd0]">No hay regularizaciones todavía. Pulsa Agregar para crear la primera.</p>}

      <div className="flex h-[66px] gap-1 border border-[var(--gw-border)] bg-[var(--gw-face)] p-[2px]">
        <div className="grid w-[150px] grid-cols-3 grid-rows-2">
          <BtnTexto title="Primero" disabled={editable || idx < 0} onClick={() => navegar('primero')}>
            <ChevronFirst size={16} strokeWidth={3} />
          </BtnTexto>
          <BtnTexto title="Siguiente" disabled={editable || idx < 0 || idx >= totalClaves - 1} onClick={() => navegar('siguiente')}>
            <Play size={11} fill="currentColor" />
          </BtnTexto>
          <BtnTexto title={ordenDesc ? 'Orden: del más nuevo al más antiguo' : 'Orden: del más antiguo al más nuevo'} disabled={editable} onClick={() => setOrdenDesc((o) => !o)}>
            <ArrowDownAZ size={16} />
          </BtnTexto>
          <BtnTexto title="Anterior" disabled={editable || idx <= 0} onClick={() => navegar('anterior')}>
            <Play size={11} className="rotate-180" fill="currentColor" />
          </BtnTexto>
          <BtnTexto title="Último" disabled={editable || idx < 0} onClick={() => navegar('ultimo')}>
            <ChevronLast size={16} strokeWidth={3} />
          </BtnTexto>
          <BtnTexto title="Buscar" disabled={editable} onClick={() => setDialogo('buscar')}>
            <Binoculars size={16} />
          </BtnTexto>
        </div>
        <BtnTexto className="flex-1" label="Imprimir" disabled={sinDoc} onClick={() => window.print()}>
          <Printer size={20} />
        </BtnTexto>
        {editable ? (
          <>
            <BtnTexto className="flex-1" label="Guardar" title="Guardar (F1)" disabled={guardando} onClick={guardar}>
              <Save size={20} />
            </BtnTexto>
            <BtnTexto className="flex-1" label="Cancelar" title="Cancelar (Alt+Retroceso)" disabled={guardando} onClick={cancelar}>
              <X size={20} strokeWidth={3} />
            </BtnTexto>
          </>
        ) : (
          <>
            <BtnTexto className="flex-1" label="Agregar" onClick={() => navigate('/regularizacion-stock/nuevo')}>
              <FilePlus2 size={20} />
            </BtnTexto>
            <BtnTexto className="flex-1" label="Editar" disabled={sinDoc} onClick={() => setModo('edicion')}>
              <FilePen size={20} />
            </BtnTexto>
            <BtnTexto className="flex-1" label="Eliminar" disabled={sinDoc || guardando} onClick={eliminar}>
              <FileX2 size={20} className="text-[#c42b1c]" />
            </BtnTexto>
          </>
        )}
        <BtnTexto className="flex-1" label="Cerrar" onClick={() => navigate('/')}>
          <DoorOpen size={20} />
        </BtnTexto>
      </div>

      {dialogo === 'buscar' && (
        <GwLookupDialog<Record<string, unknown>>
          title="Localizar regularización"
          table="regularizacion_stock"
          columns={[
            { key: 'tienda_terminal_codigo', label: 'Tienda', width: 70 },
            { key: 'numero', label: 'Número', width: 100 },
            { key: 'articulo_codigo', label: 'Artículo', width: 140 },
            { key: 'almacen_codigo', label: 'Almacén', width: 80 },
            { key: 'documento_externo', label: 'Documento' },
          ]}
          searchColumns={['articulo_codigo', 'documento_externo', 'almacen_codigo']}
          orderBy="numero"
          keyColumn="numero"
          onPick={(x) => {
            setDialogo(null)
            irA(String(x.tienda_terminal_codigo), Number(x.numero))
          }}
          onClose={() => setDialogo(null)}
        />
      )}
      {dialogo === 'almacen' && (
        <GwLookupDialog<Record<string, unknown>>
          title="Almacén"
          table="almacen"
          columns={[
            { key: 'codigo', label: 'Código', width: 90 },
            { key: 'nombre', label: 'Nombre' },
          ]}
          searchColumns={['codigo', 'nombre']}
          orderBy="codigo"
          keyColumn="codigo"
          onPick={(x) => {
            patch({ almacen_codigo: String(x.codigo) })
            setDialogo(null)
          }}
          onClose={() => setDialogo(null)}
        />
      )}
      {dialogo === 'articulo' && (
        <GwLookupDialog<Record<string, unknown>>
          title="Buscar artículo"
          table="articulo"
          columns={[
            { key: 'codigo_interno', label: 'Código', width: 140 },
            { key: 'descripcion', label: 'Descripción' },
            { key: 'codigo_barras_principal', label: 'Cód. barras', width: 140 },
          ]}
          searchColumns={['codigo_interno', 'descripcion', 'codigo_barras_principal']}
          orderBy="codigo_interno"
          keyColumn="codigo_interno"
          onPick={(x) => {
            setDialogo(null)
            patch({ articulo_codigo: String(x.codigo_interno) })
          }}
          onClose={() => setDialogo(null)}
        />
      )}
      {dialogo === 'documento' && (
        <GwLookupDialog<Record<string, unknown>>
          title="Tipo de documento"
          table="tipo_documento_contable"
          columns={[
            { key: 'codigo', label: 'Código', width: 110 },
            { key: 'descripcion', label: 'Descripción' },
          ]}
          searchColumns={['codigo', 'descripcion']}
          orderBy="codigo"
          keyColumn="codigo"
          onPick={(x) => {
            patch({ documento_externo: String(x.codigo) })
            setDialogo(null)
          }}
          onClose={() => setDialogo(null)}
        />
      )}
      {dialogo === 'rapida' && (
        <EntradaRapida
          titulo={`Regularización rápida · almacén ${r.almacen_codigo || vacia().almacen_codigo}`}
          etiquetaCantidad="Nuevo stock"
          cantidadInicial={0}
          onCerrar={async () => {
            setDialogo(null)
            cargarClaves()
            setRefresco((x) => x + 1)
          }}
          onAnadir={async (a, nuevo) => {
            const base = { ...vacia(), almacen_codigo: r.almacen_codigo || vacia().almacen_codigo }
            await guardarUna(base, a, nuevo)
          }}
        />
      )}
    </div>
  )
}
