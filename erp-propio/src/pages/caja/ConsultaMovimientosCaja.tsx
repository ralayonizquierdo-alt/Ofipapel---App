import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { avisoTope, todasLasFilas } from '../../lib/todasLasFilas'
import { GwInput, GwLookupButton, GwSelect, formatGw } from '../../components/gw'
import { GwDateTime } from '../../components/gw/GwDateTime'
import { GwLookupDialog } from '../../components/gw/GwLookupDialog'
import { Grupo, I, L } from './piezasCaja'
import { MOV_COLS, fechaGw, textoDocumento, type CajaApertura, type MovimientoCaja } from './cajaModel'

// Pestaña «Consultas Movimientos de Caja» de Aperturas y Cierres de Caja (captura ZIP 7, 04/11/2026):
// Filtrar Según Fecha (Fecha y Hora Mov. · Desde / Hasta), Tiendas (Desde/Hasta · Cualquiera ·
// Seleccionar), Aplicar, y la rejilla Ti. · Nº Movim. · Fecha · Hora · Documento · IoG · Ingreso ·
// Gasto · Concepto con su barra de navegación. Al entrar propone el periodo de la caja (de la
// apertura al cierre, o hasta hoy si sigue abierta) y la tienda de la caja.

const pad = (n: number) => String(n).padStart(2, '0')
const fechaLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const horaLocal = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`

function finDeHoy() {
  const d = new Date()
  d.setHours(23, 59, 59, 0)
  return d.toISOString()
}

const TOPE = 20000

export function ConsultaMovimientosCaja({ caja }: { caja: CajaApertura }) {
  const navigate = useNavigate()
  const [campoFecha, setCampoFecha] = useState('fecha_hora')
  const [modoFecha, setModoFecha] = useState<'rango' | 'cualquiera'>('rango')
  const [desde, setDesde] = useState<string | null>(caja.fecha_apertura)
  const [hasta, setHasta] = useState<string | null>(caja.fecha_cierre ?? finDeHoy())
  const [modoTienda, setModoTienda] = useState<'rango' | 'cualquiera' | 'seleccionar'>('rango')
  const [tDesde, setTDesde] = useState(caja.tienda_terminal_codigo)
  const [tHasta, setTHasta] = useState(caja.tienda_terminal_codigo)
  const [seleccion, setSeleccion] = useState<string[]>([])
  const [buscarTienda, setBuscarTienda] = useState<null | 'desde' | 'hasta' | 'sel'>(null)
  const [movs, setMovs] = useState<MovimientoCaja[] | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [sel, setSel] = useState(0)
  const tabla = useRef<HTMLDivElement>(null)

  async function aplicar() {
    setMovs(null)
    setAviso(null)
    const dD = desde ? new Date(desde) : null
    const dH = hasta ? new Date(hasta) : null
    const conFecha = modoFecha === 'rango'
    const { data, error, cortado } = await todasLasFilas<MovimientoCaja>(
      () => {
        let q = supabase.from('movimiento_caja').select(MOV_COLS)
        if (conFecha && dD) q = q.gte('fecha', fechaLocal(dD))
        if (conFecha && dH) q = q.lte('fecha', fechaLocal(dH))
        if (modoTienda === 'rango') {
          if (tDesde) q = q.gte('tienda_terminal_codigo', tDesde)
          if (tHasta) q = q.lte('tienda_terminal_codigo', tHasta)
        } else if (modoTienda === 'seleccionar' && seleccion.length) q = q.in('tienda_terminal_codigo', seleccion)
        return q.order('fecha').order('hora').order('tienda_terminal_codigo').order('numero')
      },
      { tope: TOPE },
    )
    if (error) return setAviso(error)
    // La fecha va en un campo y la hora en otro: los extremos del periodo se afinan aquí.
    const ini = conFecha && dD ? `${fechaLocal(dD)} ${horaLocal(dD)}` : null
    const fin = conFecha && dH ? `${fechaLocal(dH)} ${horaLocal(dH)}` : null
    const filas = data.filter((m) => {
      const k = `${m.fecha ?? ''} ${m.hora ?? '00:00:00'}`
      return (!ini || k >= ini) && (!fin || k <= fin)
    })
    setMovs(filas)
    setSel(filas.length ? filas.length - 1 : 0)
    if (cortado) setAviso(avisoTope(TOPE))
  }

  // Al entrar en la pestaña (o cambiar de caja) se aplica el filtro propuesto.
  useEffect(() => {
    aplicar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caja.tienda_terminal_codigo, caja.ejercicio])

  useEffect(() => {
    tabla.current?.querySelector('tr.gw-selected')?.scrollIntoView({ block: 'nearest' })
  }, [sel, movs])

  const n = movs?.length ?? 0
  const radio = (activo: boolean, onClick: () => void, texto: string) => (
    <label className={`flex cursor-pointer items-center gap-1.5 ${L}`}>
      <input type="radio" className="m-0 h-[12px] w-[12px] accent-[#0078d7]" checked={activo} onChange={onClick} />
      {texto}
    </label>
  )
  const nav = 'gw-btn !h-[38px] w-[106px]'

  return (
    <div className="flex min-h-0 flex-col gap-1">
      <div className="grid grid-cols-[minmax(0,690px)_minmax(0,460px)_minmax(0,1fr)] items-stretch gap-x-2">
        <Grupo title="Filtrar Según Fecha" className="grid grid-cols-2 gap-x-2 gap-y-1.5 pb-1.5">
          <GwSelect className={I} value={campoFecha} onChange={(e) => setCampoFecha(e.target.value)}>
            <option value="fecha_hora">Fecha y Hora Mov.</option>
          </GwSelect>
          <GwSelect className={I} value={modoFecha} onChange={(e) => setModoFecha(e.target.value as 'rango' | 'cualquiera')}>
            <option value="rango">Desde / Hasta</option>
            <option value="cualquiera">Cualquiera</option>
          </GwSelect>
          <GwDateTime className={I} value={desde} onChange={setDesde} disabled={modoFecha !== 'rango'} />
          <GwDateTime className={I} value={hasta} onChange={setHasta} disabled={modoFecha !== 'rango'} />
        </Grupo>
        <Grupo title="Tiendas" className="grid grid-cols-[150px_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5 pb-1">
          {radio(modoTienda === 'rango', () => setModoTienda('rango'), 'Desde/Hasta')}
          <span className="flex gap-1">
            <span className="flex">
              <GwInput className={`${I} !w-[56px]`} value={tDesde} disabled={modoTienda !== 'rango'} onChange={(e) => setTDesde(e.target.value)} />
              <GwLookupButton disabled={modoTienda !== 'rango'} onClick={() => setBuscarTienda('desde')} title="Buscar tienda" />
            </span>
            <span className="flex">
              <GwInput className={`${I} !w-[56px]`} value={tHasta} disabled={modoTienda !== 'rango'} onChange={(e) => setTHasta(e.target.value)} />
              <GwLookupButton disabled={modoTienda !== 'rango'} onClick={() => setBuscarTienda('hasta')} title="Buscar tienda" />
            </span>
          </span>
          {radio(modoTienda === 'cualquiera', () => setModoTienda('cualquiera'), 'Cualquiera')}
          <span />
          {radio(modoTienda === 'seleccionar', () => setModoTienda('seleccionar'), 'Seleccionar')}
          <span className="flex">
            <GwInput
              className={`${I} !w-[110px]`}
              value={seleccion.join(', ')}
              disabled={modoTienda !== 'seleccionar'}
              title="Tiendas elegidas, separadas por comas"
              onChange={(e) =>
                setSeleccion(
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
            />
            <GwLookupButton disabled={modoTienda !== 'seleccionar'} onClick={() => setBuscarTienda('sel')} title="Añadir una tienda a la selección" />
          </span>
        </Grupo>
        <button type="button" className="gw-btn !h-[62px] gap-1 self-start !text-[20px]" onClick={aplicar}>
          <Check size={18} strokeWidth={3} className="text-[#127a12]" />
          Aplicar
        </button>
      </div>

      <div ref={tabla} className="h-[300px] overflow-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid table-fixed text-[17px]">
          <thead className="sticky top-0 z-10">
            <tr>
              <th style={{ width: 64 }}>Ti.</th>
              <th style={{ width: 138 }}>Nº Movim.</th>
              <th style={{ width: 148 }}>Fecha</th>
              <th style={{ width: 82 }}>Hora</th>
              <th style={{ width: 150 }}>Documento</th>
              <th style={{ width: 50 }}>IoG</th>
              <th style={{ width: 168 }}>Ingreso</th>
              <th style={{ width: 168 }}>Gasto</th>
              <th style={{ width: 420 }}>Concepto</th>
            </tr>
          </thead>
          <tbody>
            {movs == null && (
              <tr>
                <td colSpan={9}>Cargando…</td>
              </tr>
            )}
            {movs?.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center text-[#6d6d6d]">
                  No hay movimientos con ese filtro. Cambia las fechas o las tiendas y pulsa Aplicar.
                </td>
              </tr>
            )}
            {movs?.map((m, i) => (
              <tr
                key={`${m.tienda_terminal_codigo}-${m.numero}`}
                className={`${i === sel ? 'gw-selected' : ''} ${m.activo ? '' : 'text-[#8a8a8a] line-through'}`}
                onClick={() => setSel(i)}
                onDoubleClick={() => navigate(`/caja/movimientos/${encodeURIComponent(m.tienda_terminal_codigo)}/${m.numero}`)}
                title="Doble clic: abrir el movimiento"
              >
                <td>{m.tienda_terminal_codigo}</td>
                <td className="text-right tabular-nums">{m.numero}</td>
                <td>{fechaGw(m.fecha)}</td>
                <td>{m.hora}</td>
                <td className="truncate">{textoDocumento(m)}</td>
                <td className="text-center">{m.es_ingreso === false ? 'G' : 'I'}</td>
                <td className="text-right tabular-nums">{formatGw(m.ingreso ?? 0, 3)}</td>
                <td className="text-right tabular-nums">{formatGw(m.gasto ?? 0, 3)}</td>
                <td className="truncate" title={m.concepto ?? ''}>
                  {m.concepto}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-0.5">
        <button type="button" className={nav} disabled={!n} onClick={() => setSel(0)} title="Primero">
          <ChevronFirst size={16} />
        </button>
        <button type="button" className={nav} disabled={!n} onClick={() => setSel((s) => Math.max(0, s - 1))} title="Anterior">
          <ChevronLeft size={16} />
        </button>
        <button type="button" className={nav} disabled={!n} onClick={() => setSel((s) => Math.min(n - 1, s + 1))} title="Siguiente">
          <ChevronRight size={16} />
        </button>
        <button type="button" className={nav} disabled={!n} onClick={() => setSel(n - 1)} title="Último">
          <ChevronLast size={16} />
        </button>
        <button
          type="button"
          className={nav}
          disabled={!n}
          onClick={() => movs?.[sel] && navigate(`/caja/movimientos/${encodeURIComponent(movs[sel].tienda_terminal_codigo)}/${movs[sel].numero}`)}
          title="Abrir el movimiento seleccionado"
        >
          <Search size={16} />
        </button>
        <span className="ml-auto flex gap-6 pr-2 text-[16px]">
          {aviso && <span className="text-[#c42b1c]">{aviso}</span>}
          <span>{n} movimientos</span>
          <span>
            Ingresos: <b className="tabular-nums">{formatGw((movs ?? []).reduce((s, m) => s + Number(m.ingreso ?? 0), 0), 3)}</b>
          </span>
          <span>
            Gastos: <b className="tabular-nums">{formatGw((movs ?? []).reduce((s, m) => s + Number(m.gasto ?? 0), 0), 3)}</b>
          </span>
        </span>
      </div>

      {buscarTienda && (
        <GwLookupDialog<Record<string, unknown>>
          title="Tiendas / Terminales"
          table="tienda_terminal"
          columns={[
            { key: 'codigo', label: 'Código', width: 80 },
            { key: 'descripcion', label: 'Descripción' },
          ]}
          searchColumns={['codigo', 'descripcion']}
          orderBy="codigo"
          keyColumn="codigo"
          onPick={(r) => {
            const c = String(r.codigo)
            if (buscarTienda === 'desde') setTDesde(c)
            else if (buscarTienda === 'hasta') setTHasta(c)
            else setSeleccion((s) => (s.includes(c) ? s : [...s, c]))
            setBuscarTienda(null)
          }}
          onClose={() => setBuscarTienda(null)}
        />
      )}
    </div>
  )
}
