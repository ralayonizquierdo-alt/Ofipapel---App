import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cog, ListChecks, TriangleAlert } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { GwCheck, GwField, GwGroup, GwRadio, GwSelect } from '../../components/gw'
import { TIPOS_DOC, eur0, inicioMes, hoy } from './contabModel'
import { Aviso, Rango } from './ui'

interface Resumen {
  estado: string
  n: number
  debe: number
}

/** Contabilidad → Generar Asientos Automáticos (fn_contab_generar en la base de datos). */
export function GenerarAsientosPage() {
  const navigate = useNavigate()
  const [desde, setDesde] = useState(inicioMes())
  const [hasta, setHasta] = useState(hoy())
  const [tipos, setTipos] = useState<string[]>(TIPOS_DOC.map((t) => t.value))
  const [agrupar, setAgrupar] = useState<'dia' | 'documento'>('dia')
  const [regenerar, setRegenerar] = useState<'no' | 'errores' | 'todos'>('no')
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [resumen, setResumen] = useState<Resumen[]>([])

  useEffect(() => {
    supabase
      .from('configuracion_contable')
      .select('agrupar_tickets')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => data && setAgrupar(data.agrupar_tickets))
  }, [])

  async function cargarResumen() {
    const { data } = await supabase.from('asiento').select('estado, total_debe').gte('fecha', desde).lte('fecha', hasta).neq('estado', 'anulado')
    const m = new Map<string, Resumen>()
    for (const a of data ?? []) {
      const x = m.get(a.estado) ?? { estado: a.estado, n: 0, debe: 0 }
      x.n += 1
      x.debe += Number(a.total_debe)
      m.set(a.estado, x)
    }
    setResumen([...m.values()])
  }

  useEffect(() => {
    cargarResumen()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta])

  async function generar() {
    if (!tipos.length) return setError('Marca al menos un tipo de documento.')
    if (regenerar === 'todos' && !window.confirm('Se anularán y volverán a crear todos los asientos automáticos del periodo (los modificados a mano se respetan). ¿Seguir?'))
      return
    setTrabajando(true)
    setError(null)
    setOk(null)
    const { data, error: e } = await supabase.rpc('fn_contab_generar', {
      p_desde: desde,
      p_hasta: hasta,
      p_tipos: tipos,
      p_agrupar: agrupar,
      p_regenerar: regenerar,
    })
    setTrabajando(false)
    if (e) return setError(e.message)
    const r = data as { creados: number; errores: number; anulados: number }
    setOk(
      `Asientos creados: ${r.creados} correctos, ${r.errores} con errores${r.anulados ? `; ${r.anulados} anulados para regenerar` : ''}.` +
        (r.creados + r.errores === 0 ? ' No había documentos pendientes de contabilizar en el periodo.' : ''),
    )
    cargarResumen()
  }

  const errores = resumen.find((r) => r.estado === 'error')?.n ?? 0

  return (
    <div className="flex min-w-0 max-w-[980px] flex-col gap-1.5 text-[13px]">
      <GwGroup title="Periodo">
        <div className="flex flex-wrap items-end gap-2">
          <Rango desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} />
          <span className="mb-1 text-[12px] text-[#555]">Se contabilizan los documentos con fecha dentro del periodo que aún no tengan asiento.</span>
        </div>
      </GwGroup>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <GwGroup title="Documentos a contabilizar">
          <div className="flex flex-col gap-1">
            {TIPOS_DOC.map((t) => (
              <GwCheck
                key={t.value}
                label={t.label}
                checked={tipos.includes(t.value)}
                onChange={(v) => setTipos(v ? [...tipos, t.value] : tipos.filter((x) => x !== t.value))}
              />
            ))}
          </div>
          <div className="mt-1 flex gap-2">
            <button type="button" className="gw-btn" onClick={() => setTipos(TIPOS_DOC.map((t) => t.value))}>
              Todos
            </button>
            <button type="button" className="gw-btn" onClick={() => setTipos([])}>
              Ninguno
            </button>
          </div>
        </GwGroup>
        <GwGroup title="Opciones">
          <GwField label="Tickets de contado">
            <div className="flex flex-col gap-0.5 pt-0.5">
              <GwRadio name="agrupar" label="Un asiento por día y tienda" checked={agrupar === 'dia'} onChange={() => setAgrupar('dia')} />
              <GwRadio name="agrupar" label="Un asiento por ticket" checked={agrupar === 'documento'} onChange={() => setAgrupar('documento')} />
            </div>
          </GwField>
          <GwField label="Si ya hay asientos del periodo" className="mt-1.5">
            <GwSelect value={regenerar} onChange={(e) => setRegenerar(e.target.value as typeof regenerar)}>
              <option value="no">Solo contabilizar lo pendiente (no duplica)</option>
              <option value="errores">Rehacer los que tienen errores</option>
              <option value="todos">Rehacer todos (anular y volver a crear)</option>
            </GwSelect>
          </GwField>
          <p className="mt-1 text-[12px] leading-snug text-[#555]">
            Los albaranes a crédito no se contabilizan: entran con su factura mensual. Se respeta «No pasar a contabilidad» de pedidos, facturas y pagos de
            proveedor. Ventas anuladas (VeriFactu) y aplazadas no se contabilizan.
          </p>
        </GwGroup>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="gw-btn font-bold" onClick={generar} disabled={trabajando}>
          <Cog size={14} /> {trabajando ? 'Generando…' : 'Generar asientos'}
        </button>
        <button type="button" className="gw-btn" onClick={() => navigate(`/contabilidad/diario?desde=${desde}&hasta=${hasta}`)}>
          <ListChecks size={14} /> Ver Diario
        </button>
        <button type="button" className="gw-btn" onClick={() => navigate('/contabilidad/pendientes')} disabled={!errores}>
          <TriangleAlert size={14} /> Pendientes / con errores ({errores})
        </button>
        <Aviso error={error} ok={ok} />
      </div>
      <GwGroup title="Asientos del periodo">
        <table className="gw-grid max-w-[520px]">
          <thead>
            <tr>
              <th>Estado</th>
              <th className="text-right!">Asientos</th>
              <th className="text-right!">Importe (Debe)</th>
            </tr>
          </thead>
          <tbody>
            {resumen.length === 0 && (
              <tr>
                <td colSpan={3} className="text-[#555]">
                  Ningún asiento en el periodo.
                </td>
              </tr>
            )}
            {resumen.map((r) => (
              <tr key={r.estado} className={r.estado === 'error' ? 'font-bold text-[#c42b1c]' : ''}>
                <td>{r.estado === 'correcto' ? 'Correctos' : 'Con errores (pendientes)'}</td>
                <td className="text-right">{r.n}</td>
                <td className="text-right">{eur0(r.debe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </GwGroup>
    </div>
  )
}
