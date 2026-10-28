import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDownToLine, ArrowUpFromLine, Scale, Search } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwCheck, GwDate, GwInput, GwSelect, formatGw } from '../../../components/gw'
import { CodigoBuscar, Grupo, IN, L } from '../../../components/gw/GwInformeArticulos'
import { AvisoSinCaptura, BotonCerrar, ModalGw, fechaEs, msgError, useAlmacenes, useF4 } from './comun'

// Almacén → Control de Lotes. SIN CAPTURA de GeminisWin. En la base de datos no había nada de
// lotes salvo la marca articulo.control_lotes / familia.control_lotes; la estructura mínima es
// articulo_lote (artículo, lote, almacén, caducidad, entrada, cantidad) y
// articulo_lote_movimiento (entradas, salidas y regularizaciones; un trigger mantiene la
// cantidad). Los movimientos se apuntan aquí con fn_lote_movimiento.
// PENDIENTE (Luis): compras y ventas todavía NO piden lote ni lo descuentan; el lote es un
// desglose del stock del artículo, que no se toca desde esta pantalla.

interface Lote {
  id: number
  articulo_codigo: string
  lote: string
  almacen_codigo: string
  fecha_caducidad: string | null
  fecha_entrada: string
  cantidad: number
  documento: string | null
  observaciones: string | null
  articulo: { descripcion: string } | null
}

interface MovLote {
  id: number
  tipo: string
  sentido: number
  cantidad: number
  ocurrido_en: string
  documento: string | null
  observaciones: string | null
  empleado_codigo: string | null
}

const TIPO: Record<string, string> = {
  entrada: 'Entrada',
  salida: 'Salida',
  regularizacion: 'Regularización',
  stock_cero_familia: 'Stock a 0 de familia',
}

const hoy = () => new Date().toLocaleDateString('sv-SE')
const sumarDias = (d: number) => {
  const f = new Date()
  f.setDate(f.getDate() + d)
  return f.toLocaleDateString('sv-SE')
}

function colorCaducidad(f: string | null) {
  if (!f) return ''
  if (f < hoy()) return 'text-[#c42b1c] font-bold'
  if (f <= sumarDias(30)) return 'text-[#b35c00] font-bold'
  return ''
}

type Accion = 'entrada' | 'salida' | 'regularizacion'

export function ControlLotesPage() {
  const navigate = useNavigate()
  const cerrar = useCallback(() => navigate('/'), [navigate])
  useF4(cerrar)
  const almacenes = useAlmacenes()

  const [articulo, setArticulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [almacen, setAlmacen] = useState('')
  const [conExistencias, setConExistencias] = useState(true)
  const [caducaAntes, setCaducaAntes] = useState<string | null>(null)
  const [lotes, setLotes] = useState<Lote[] | null>(null)
  const [sel, setSel] = useState<number | null>(null)
  const [movs, setMovs] = useState<MovLote[]>([])
  const [stockArt, setStockArt] = useState<{ almacen_codigo: string; cantidad_actual: number }[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [accion, setAccion] = useState<Accion | null>(null)

  // Descripción y stock del artículo elegido (para comparar con la suma de sus lotes).
  useEffect(() => {
    const c = articulo.trim()
    if (!c) {
      setDescripcion('')
      setStockArt([])
      return
    }
    let vivo = true
    Promise.all([
      supabase.from('articulo').select('descripcion').eq('codigo_interno', c).maybeSingle(),
      supabase.from('articulo_almacen_stock').select('almacen_codigo, cantidad_actual').eq('articulo_codigo', c).order('almacen_codigo'),
    ]).then(([a, s]) => {
      if (!vivo) return
      setDescripcion(a.data?.descripcion ?? (c ? 'No existe el artículo' : ''))
      setStockArt(((s.data ?? []) as { almacen_codigo: string; cantidad_actual: number }[]).map((r) => ({ ...r, cantidad_actual: Number(r.cantidad_actual) })))
    })
    return () => {
      vivo = false
    }
  }, [articulo])

  const consultar = useCallback(async () => {
    setMsg(null)
    setOcupado(true)
    try {
      let q = supabase
        .from('articulo_lote')
        .select('id, articulo_codigo, lote, almacen_codigo, fecha_caducidad, fecha_entrada, cantidad, documento, observaciones, articulo:articulo_codigo(descripcion)')
      if (articulo.trim()) q = q.eq('articulo_codigo', articulo.trim())
      if (almacen) q = q.eq('almacen_codigo', almacen)
      if (conExistencias) q = q.neq('cantidad', 0)
      if (caducaAntes) q = q.lte('fecha_caducidad', caducaAntes)
      const { data, error } = await q.order('fecha_caducidad', { ascending: true, nullsFirst: false }).order('articulo_codigo').order('lote').limit(1000)
      if (error) throw error
      const l = ((data ?? []) as unknown as Lote[]).map((x) => ({ ...x, cantidad: Number(x.cantidad) }))
      setLotes(l)
      setSel((s) => (s != null && l.some((x) => x.id === s) ? s : (l[0]?.id ?? null)))
      if (l.length === 1000) setMsg('Se muestran los primeros 1000 lotes; afina el filtro.')
    } catch (e) {
      setMsg(`Error: ${msgError(e)}`)
    } finally {
      setOcupado(false)
    }
  }, [articulo, almacen, conExistencias, caducaAntes])

  useEffect(() => {
    consultar()
    // Al abrir: todos los lotes con existencias, por caducidad.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const actual = lotes?.find((l) => l.id === sel) ?? null

  useEffect(() => {
    if (sel == null) return setMovs([])
    let vivo = true
    supabase
      .from('articulo_lote_movimiento')
      .select('id, tipo, sentido, cantidad, ocurrido_en, documento, observaciones, empleado_codigo')
      .eq('lote_id', sel)
      .order('ocurrido_en')
      .order('id')
      .limit(1000)
      .then(({ data }) => vivo && setMovs(((data ?? []) as MovLote[]).map((m) => ({ ...m, cantidad: Number(m.cantidad) }))))
    return () => {
      vivo = false
    }
  }, [sel, lotes])

  const sumaLotes = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of lotes ?? []) if (l.articulo_codigo === articulo.trim()) m.set(l.almacen_codigo, (m.get(l.almacen_codigo) ?? 0) + l.cantidad)
    return m
  }, [lotes, articulo])

  const nombreAlm = (c: string) => almacenes.find((a) => a.codigo === c)?.nombre ?? ''
  let saldo = 0

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <Grupo
        titulo="Consulta de lotes"
        derecha={
          <span className="ml-auto">
            <AvisoSinCaptura />
          </span>
        }
      >
        <div className="grid grid-cols-[200px_minmax(0,1fr)_220px_150px_auto_auto] items-end gap-3">
          <label className="flex flex-col">
            <span className={L}>Artículo</span>
            <CodigoBuscar value={articulo} lookup="articulo" onChange={setArticulo} />
          </label>
          <label className="flex min-w-0 flex-col">
            <span className={L}>Descripción</span>
            <GwInput className={IN} readOnly value={descripcion} />
          </label>
          <label className="flex flex-col">
            <span className={L}>Almacén</span>
            <GwSelect className={IN} value={almacen} onChange={(e) => setAlmacen(e.target.value)}>
              <option value="">(Todos)</option>
              {almacenes.map((a) => (
                <option key={a.codigo} value={a.codigo}>
                  {a.codigo} {a.nombre}
                </option>
              ))}
            </GwSelect>
          </label>
          <label className="flex flex-col">
            <span className={L}>Caducan hasta</span>
            <GwDate className={IN} value={caducaAntes} onChange={setCaducaAntes} />
          </label>
          <GwCheck label={<span className={L}>Solo con existencias</span>} checked={conExistencias} onChange={setConExistencias} />
          <button type="button" className="gw-btn !h-[30px] !w-[140px] !gap-1 !text-[15px]" disabled={ocupado} onClick={consultar}>
            <Search size={15} /> Consultar
          </button>
        </div>
        {articulo.trim() && stockArt.length > 0 && (
          <p className={`${L} mt-1`}>
            Stock del artículo:{' '}
            {stockArt.map((s) => {
              const enLotes = sumaLotes.get(s.almacen_codigo) ?? 0
              const sinLote = s.cantidad_actual - enLotes
              return (
                <span key={s.almacen_codigo} className="mr-4">
                  Alm. {s.almacen_codigo}: <b>{formatGw(s.cantidad_actual, 3)}</b> · en lotes {formatGw(enLotes, 3)}
                  {sinLote !== 0 && <span className="text-[#b35c00]"> · sin lote {formatGw(sinLote, 3)}</span>}
                </span>
              )
            })}
          </p>
        )}
      </Grupo>

      <div className="min-h-0 flex-[3] overflow-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th style={{ width: 130 }}>Artículo</th>
              <th>Descripción</th>
              <th style={{ width: 140 }}>Lote</th>
              <th style={{ width: 170 }}>Almacén</th>
              <th style={{ width: 100 }}>F. Entrada</th>
              <th style={{ width: 100 }}>F. Caducidad</th>
              <th style={{ width: 110 }} className="!text-right">
                Cantidad
              </th>
              <th style={{ width: 130 }}>Documento</th>
            </tr>
          </thead>
          <tbody>
            {(lotes ?? []).map((l) => (
              <tr key={l.id} className={l.id === sel ? 'gw-selected' : ''} onClick={() => setSel(l.id)}>
                <td>{l.articulo_codigo}</td>
                <td className="max-w-[360px] truncate">{l.articulo?.descripcion}</td>
                <td>{l.lote}</td>
                <td className="truncate">
                  {l.almacen_codigo} {nombreAlm(l.almacen_codigo)}
                </td>
                <td>{fechaEs(l.fecha_entrada)}</td>
                <td className={colorCaducidad(l.fecha_caducidad)}>{fechaEs(l.fecha_caducidad)}</td>
                <td className="text-right">{formatGw(l.cantidad, 3)}</td>
                <td>{l.documento}</td>
              </tr>
            ))}
            {lotes && !lotes.length && (
              <tr>
                <td colSpan={8} className="text-center text-[#6d6d6d]">
                  No hay lotes con esos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className={`${L} flex items-center gap-2`}>
        <b>Movimientos del lote</b>
        <span>{actual ? `${actual.lote} · ${actual.articulo_codigo} · almacén ${actual.almacen_codigo}` : '—'}</span>
        <span className="ml-auto text-[13px] text-[#6d6d6d]">
          Caducidad en rojo: vencida · en naranja: vence en 30 días. Compras y ventas aún no piden lote (pendiente de confirmar).
        </span>
      </div>
      <div className="min-h-0 flex-[2] overflow-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th style={{ width: 150 }}>Fecha</th>
              <th style={{ width: 170 }}>Tipo</th>
              <th style={{ width: 100 }} className="!text-right">
                Entrada
              </th>
              <th style={{ width: 100 }} className="!text-right">
                Salida
              </th>
              <th style={{ width: 100 }} className="!text-right">
                Saldo
              </th>
              <th style={{ width: 130 }}>Documento</th>
              <th>Observaciones</th>
              <th style={{ width: 80 }}>Empleado</th>
            </tr>
          </thead>
          <tbody>
            {movs.map((m) => {
              saldo += m.sentido * m.cantidad
              return (
                <tr key={m.id}>
                  <td>{fechaEs(m.ocurrido_en, true)}</td>
                  <td>{TIPO[m.tipo] ?? m.tipo}</td>
                  <td className="text-right">{m.sentido > 0 ? formatGw(m.cantidad, 3) : ''}</td>
                  <td className="text-right">{m.sentido < 0 ? formatGw(m.cantidad, 3) : ''}</td>
                  <td className="text-right">{formatGw(saldo, 3)}</td>
                  <td>{m.documento}</td>
                  <td className="max-w-[340px] truncate">{m.observaciones}</td>
                  <td>{m.empleado_codigo}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {msg && <div className={`text-[14px] ${msg.startsWith('Error') ? 'text-[#c42b1c]' : 'text-[#127a12]'}`}>{msg}</div>}
      <div className="flex items-stretch gap-2 border-t border-[var(--gw-border-light)] pr-[64px] pt-1">
        <div className="flex w-[175px] flex-none items-center px-1 text-[16px] leading-[19px]">Pulse F4 para cerrar la ventana</div>
        <span className="flex-1" />
        <button type="button" className="gw-btn !h-[46px] !w-[190px] !gap-1.5 !text-[17px]" onClick={() => setAccion('entrada')}>
          <ArrowDownToLine size={16} className="text-[#127a12]" /> Entrada / Nuevo
        </button>
        <button type="button" className="gw-btn !h-[46px] !w-[130px] !gap-1.5 !text-[17px]" disabled={!actual} onClick={() => setAccion('salida')}>
          <ArrowUpFromLine size={16} className="text-[#c42b1c]" /> Salida
        </button>
        <button type="button" className="gw-btn !h-[46px] !w-[160px] !gap-1.5 !text-[17px]" disabled={!actual} onClick={() => setAccion('regularizacion')}>
          <Scale size={16} /> Regularizar
        </button>
        <BotonCerrar onClick={cerrar} />
      </div>

      {accion && (
        <DialogoLote
          accion={accion}
          lote={accion === 'entrada' ? (actual ?? null) : actual}
          articuloDefecto={articulo.trim()}
          almacenDefecto={almacen}
          almacenes={almacenes}
          onClose={() => setAccion(null)}
          onHecho={(t) => {
            setAccion(null)
            consultar().then(() => setMsg(t))
          }}
        />
      )}
    </div>
  )
}

function DialogoLote({
  accion,
  lote,
  articuloDefecto,
  almacenDefecto,
  almacenes,
  onClose,
  onHecho,
}: {
  accion: Accion
  lote: Lote | null
  articuloDefecto: string
  almacenDefecto: string
  almacenes: { codigo: string; nombre: string }[]
  onClose: () => void
  onHecho: (msg: string) => void
}) {
  // En «Salida» y «Regularizar» el lote es el seleccionado; en «Entrada» se propone el
  // seleccionado pero se puede escribir otro (si no existe, se crea).
  const fijo = accion !== 'entrada'
  const [art, setArt] = useState(lote?.articulo_codigo ?? articuloDefecto)
  const [codLote, setCodLote] = useState(fijo ? (lote?.lote ?? '') : '')
  const [alm, setAlm] = useState(lote?.almacen_codigo ?? almacenDefecto ?? '')
  const [cad, setCad] = useState<string | null>(fijo ? (lote?.fecha_caducidad ?? null) : null)
  const [cant, setCant] = useState('')
  const [doc, setDoc] = useState('')
  const [obs, setObs] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function aceptar() {
    const c = Number(cant.trim().replace(/\./g, '').replace(',', '.'))
    if (!art.trim()) return setError('Indica el artículo.')
    if (!codLote.trim()) return setError('Indica el lote.')
    if (!alm) return setError('Indica el almacén.')
    if (!cant.trim() || !Number.isFinite(c) || c < 0) return setError('Cantidad no válida.')
    setOcupado(true)
    const { error: e } = await supabase.rpc('fn_lote_movimiento', {
      p_articulo: art.trim(),
      p_lote: codLote.trim(),
      p_almacen: alm,
      p_tipo: accion,
      p_cantidad: c,
      p_fecha_caducidad: cad,
      p_documento: doc.trim() || null,
      p_observaciones: obs.trim() || null,
    })
    setOcupado(false)
    if (e) return setError(e.message)
    onHecho(`${TIPO[accion]} apuntada en el lote ${codLote.trim()} (${art.trim()}, almacén ${alm}).`)
  }

  const titulo = accion === 'entrada' ? 'Entrada en lote (crea el lote si no existe)' : accion === 'salida' ? 'Salida de lote' : 'Regularizar lote'
  const fila = 'grid grid-cols-[130px_minmax(0,1fr)] items-center gap-2'
  return (
    <ModalGw titulo={titulo} onClose={onClose} ancho={520}>
      <div className="flex flex-col gap-1.5 text-[15px]">
        <label className={fila}>
          <span>Artículo</span>
          {fijo ? <GwInput className={IN} readOnly value={art} /> : <CodigoBuscar value={art} lookup="articulo" onChange={setArt} />}
        </label>
        <label className={fila}>
          <span>Lote</span>
          <GwInput className={IN} readOnly={fijo} value={codLote} onChange={(e) => setCodLote(e.target.value.toUpperCase())} autoFocus={!fijo} />
        </label>
        <label className={fila}>
          <span>Almacén</span>
          <GwSelect className={IN} disabled={fijo} value={alm} onChange={(e) => setAlm(e.target.value)}>
            <option value=""></option>
            {almacenes.map((a) => (
              <option key={a.codigo} value={a.codigo}>
                {a.codigo} {a.nombre}
              </option>
            ))}
          </GwSelect>
        </label>
        <label className={fila}>
          <span>Fecha caducidad</span>
          <GwDate className={IN} value={cad} onChange={setCad} />
        </label>
        <label className={fila}>
          <span>{accion === 'regularizacion' ? 'Cantidad real' : 'Cantidad'}</span>
          <GwInput className={`${IN} text-right`} value={cant} onChange={(e) => setCant(e.target.value)} autoFocus={fijo} onKeyDown={(e) => e.key === 'Enter' && aceptar()} />
        </label>
        {lote && fijo && (
          <span className="text-[13px] text-[#444]">
            Cantidad actual del lote: <b>{formatGw(lote.cantidad, 3)}</b>
            {accion === 'regularizacion' ? ' · se apunta la diferencia' : ''}
          </span>
        )}
        <label className={fila}>
          <span>Documento</span>
          <GwInput className={IN} value={doc} onChange={(e) => setDoc(e.target.value)} />
        </label>
        <label className={fila}>
          <span>Observaciones</span>
          <GwInput className={IN} value={obs} onChange={(e) => setObs(e.target.value)} />
        </label>
        <span className="text-[12px] text-[#6d6d6d]">El lote es un desglose: el stock del artículo no cambia desde aquí.</span>
        {error && <span className="text-[#c42b1c]">{error}</span>}
        <div className="mt-1 flex justify-end gap-2">
          <button type="button" className="gw-btn !h-[30px] !w-[110px]" disabled={ocupado} onClick={aceptar}>
            Aceptar
          </button>
          <button type="button" className="gw-btn !h-[30px] !w-[110px]" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </ModalGw>
  )
}
