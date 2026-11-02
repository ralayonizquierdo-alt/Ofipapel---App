// Contabilidad → Control y Firmas (Luis, 01/11/2026: «lo que más me preocupa es que alguien pueda falsear
// las cuentas»). Tres controles, que cumplen todos, también los super administradores:
//  · Por firmar: un asiento manual de 3.000 € o más (importe fijado por Acuerdo de Dirección) no se
//    graba hasta que lo aprueba OTRO super administrador (asiento_propuesta).
//  · Meses: un mes cerrado no admite asientos manuales ni anulaciones con fecha de ese mes; reabrirlo
//    pide motivo y queda en la auditoría (contab_mes_cerrado).
//  · Integridad: cada asiento lleva una huella encadenada con la del anterior (como VeriFactu). «Comprobar»
//    dice si alguien ha cambiado, quitado o metido un asiento por fuera del programa.
// Migración 20261102_registro_uso_y_control.

import { Fragment, useCallback, useEffect, useState } from 'react'
import { usePermisos } from '../../lib/PermisosContext'
import { supabase } from '../../lib/supabase'
import { GwTabs } from '../../components/gw'
import { eur0, ejercicioContable } from './contabModel'

interface Propuesta {
  id: number
  empresa?: string
  sustituye?: number
  sustituye_numero?: number
  fecha: string
  concepto?: string
  tienda?: string
  apuntes: { cuenta: string; debe?: number; haber?: number; concepto?: string }[]
  total: number
  creado_por: string
  creado_nombre?: string
  creado_en: string
  estado: 'pendiente' | 'aprobada' | 'rechazada' | 'retirada'
  resuelto_por?: string
  resuelto_en?: string
  motivo?: string
  asiento_numero?: number
  mio: boolean
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const fecha = (v?: string) => (v ? new Date(v.length === 10 ? `${v}T12:00:00` : v).toLocaleDateString('es-ES') : '')

export function ControlContablePage() {
  const { superAdmin } = usePermisos()
  const [tab, setTab] = useState('firmas')
  const tabs = [
    [
      { key: 'firmas', label: superAdmin ? 'Asientos por firmar' : 'Mis asientos por firmar' },
      ...(superAdmin
        ? [
            { key: 'meses', label: 'Meses' },
            { key: 'integridad', label: 'Integridad' },
          ]
        : []),
    ],
  ]
  return (
    <div className="p-2">
      <GwTabs rows={tabs} active={tab} onChange={setTab}>
        <div className="p-2">
          {tab === 'firmas' && <Firmas superAdmin={superAdmin} />}
          {tab === 'meses' && superAdmin && <Meses />}
          {tab === 'integridad' && superAdmin && <Integridad />}
        </div>
      </GwTabs>
    </div>
  )
}

function Firmas({ superAdmin }: { superAdmin: boolean }) {
  const [lista, setLista] = useState<Propuesta[]>([])
  const [abierta, setAbierta] = useState<number | null>(null)
  const [msg, setMsg] = useState<{ texto: string; error: boolean } | null>(null)

  const cargar = useCallback(async () => {
    const { data } = await supabase.rpc('fn_contab_propuestas', { p_todas: false })
    setLista((data ?? []) as Propuesta[])
  }, [])
  useEffect(() => {
    void cargar()
  }, [cargar])

  async function resolver(p: Propuesta, aprobar: boolean) {
    setMsg(null)
    let motivo: string | null = null
    if (!aprobar) {
      motivo = prompt('¿Por qué lo rechazas? (lo verá quien lo hizo)')
      if (!motivo) return
    } else if (!confirm(`¿Aprobar y grabar el asiento de ${eur0(p.total)} «${p.concepto ?? ''}» que hizo ${p.creado_nombre ?? p.creado_por}?`)) return
    const { data, error } = await supabase.rpc('fn_contab_propuesta_resolver', { p_id: p.id, p_aprobar: aprobar, p_motivo: motivo })
    if (error) return setMsg({ texto: error.message, error: true })
    setMsg({ texto: aprobar ? `Aprobado: asiento grabado (id ${data}).` : 'Rechazado.', error: false })
    void cargar()
  }

  async function retirar(p: Propuesta) {
    if (!confirm('¿Retirar este asiento? No se grabará.')) return
    const { error } = await supabase.rpc('fn_contab_propuesta_retirar', { p_id: p.id })
    if (error) return setMsg({ texto: error.message, error: true })
    void cargar()
  }

  return (
    <div className="flex flex-col gap-2 text-[13px]">
      <div className="text-[12px] text-[#555]">
        Los asientos manuales grandes no se graban hasta que los aprueba otro super administrador (nadie puede aprobar los suyos).
        {superAdmin ? '' : ' Aquí ves los tuyos y cómo van.'}
      </div>
      {msg && <div className={`text-[12px] ${msg.error ? 'text-[#c42b1c]' : 'text-[#1a7f37]'}`}>{msg.texto}</div>}
      <table className="gw-grid w-full bg-white">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Concepto</th>
            <th className="text-right">Importe</th>
            <th>Hecho por</th>
            <th>Estado</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lista.map((p) => (
            <Fragment key={p.id}>
              <tr className="cursor-pointer hover:bg-[#e8f0fb]" onClick={() => setAbierta(abierta === p.id ? null : p.id)}>
                <td>{fecha(p.fecha)}</td>
                <td>
                  {p.concepto}
                  {p.sustituye ? <span className="text-[#555]"> (cambia el asiento {p.sustituye_numero ?? p.sustituye})</span> : ''}
                </td>
                <td className="text-right">{eur0(p.total)}</td>
                <td>
                  {p.creado_nombre ?? p.creado_por} · {fecha(p.creado_en)}
                </td>
                <td>
                  {p.estado === 'pendiente'
                    ? '⏳ Pendiente'
                    : p.estado === 'aprobada'
                      ? `✅ Aprobado por ${p.resuelto_por}${p.asiento_numero ? ` (asiento ${p.asiento_numero})` : ''}`
                      : p.estado === 'rechazada'
                        ? `❌ Rechazado por ${p.resuelto_por}: ${p.motivo ?? ''}`
                        : 'Retirado'}
                </td>
                <td className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  {p.estado === 'pendiente' && superAdmin && !p.mio && (
                    <>
                      <button type="button" className="gw-btn" onClick={() => void resolver(p, true)}>
                        Aprobar
                      </button>{' '}
                      <button type="button" className="gw-btn" onClick={() => void resolver(p, false)}>
                        Rechazar
                      </button>
                    </>
                  )}
                  {p.estado === 'pendiente' && p.mio && (
                    <button type="button" className="gw-btn" onClick={() => void retirar(p)}>
                      Retirar
                    </button>
                  )}
                </td>
              </tr>
              {abierta === p.id && (
                <tr>
                  <td colSpan={6} className="bg-[#f7f9fc]">
                    <table className="gw-grid w-full">
                      <thead>
                        <tr>
                          <th>Cuenta</th>
                          <th>Concepto</th>
                          <th className="text-right">Debe</th>
                          <th className="text-right">Haber</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.apuntes.map((a, i) => (
                          <tr key={i}>
                            <td>{a.cuenta}</td>
                            <td>{a.concepto || p.concepto}</td>
                            <td className="text-right">{Number(a.debe) ? eur0(Number(a.debe)) : ''}</td>
                            <td className="text-right">{Number(a.haber) ? eur0(Number(a.haber)) : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {!lista.length && (
            <tr>
              <td colSpan={6} className="p-2 text-center text-[#777]">
                No hay asientos por firmar.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

interface Mes {
  mes: number
  cerrado: boolean
  cerrado_por: string | null
  cerrado_en: string | null
  reabierto_por: string | null
  reabierto_en: string | null
  motivo: string | null
}

function Meses() {
  const [anio, setAnio] = useState(() => ejercicioContable() ?? new Date().getFullYear())
  const [meses, setMeses] = useState<Record<number, Mes>>({})
  const [msg, setMsg] = useState<{ texto: string; error: boolean } | null>(null)

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('contab_mes_cerrado').select('*').eq('anio', anio)
    setMeses(Object.fromEntries(((data ?? []) as Mes[]).map((m) => [m.mes, m])))
  }, [anio])
  useEffect(() => {
    void cargar()
  }, [cargar])

  async function cerrar(m: number) {
    if (!confirm(`¿Cerrar ${MESES[m - 1]} de ${anio}? Ya no se podrán grabar ni anular asientos a mano con fecha de ese mes.`)) return
    const { error } = await supabase.rpc('fn_contab_cerrar_mes', { p_anio: anio, p_mes: m })
    setMsg(error ? { texto: error.message, error: true } : { texto: `${MESES[m - 1]} cerrado.`, error: false })
    void cargar()
  }

  async function reabrir(m: number) {
    const motivo = prompt(`Motivo para reabrir ${MESES[m - 1]} de ${anio} (queda en la auditoría y avisa a los demás super administradores):`)
    if (!motivo) return
    const { error } = await supabase.rpc('fn_contab_reabrir_mes', { p_anio: anio, p_mes: m, p_motivo: motivo })
    setMsg(error ? { texto: error.message, error: true } : { texto: `${MESES[m - 1]} reabierto. Ciérralo otra vez cuando termines.`, error: false })
    void cargar()
  }

  return (
    <div className="flex flex-col gap-2 text-[13px]">
      <div className="flex items-center gap-2">
        <button type="button" className="gw-btn" onClick={() => setAnio((a) => a - 1)}>
          ◀
        </button>
        <b className="text-[15px]">{anio}</b>
        <button type="button" className="gw-btn" onClick={() => setAnio((a) => a + 1)}>
          ▶
        </button>
        <span className="text-[12px] text-[#555]">Cierra cada mes cuando esté revisado (normalmente al presentar el IGIC o al cuadrar con el banco).</span>
      </div>
      {msg && <div className={`text-[12px] ${msg.error ? 'text-[#c42b1c]' : 'text-[#1a7f37]'}`}>{msg.texto}</div>}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
        {MESES.map((nombre, i) => {
          const m = meses[i + 1]
          const cerrado = m?.cerrado
          return (
            <div key={nombre} className={`flex flex-col gap-1 border p-2 ${cerrado ? 'border-[#8c1d12] bg-[#fdecea]' : 'border-[var(--gw-border)] bg-white'}`}>
              <b>
                {cerrado ? '🔒' : '🔓'} {nombre}
              </b>
              <span className="text-[11px] text-[#555]">
                {cerrado
                  ? `Cerrado por ${m.cerrado_por ?? '?'} el ${fecha(m.cerrado_en ?? undefined)}`
                  : m?.reabierto_por
                    ? `Reabierto por ${m.reabierto_por} el ${fecha(m.reabierto_en ?? undefined)}: ${m.motivo ?? ''}`
                    : 'Abierto'}
              </span>
              <button type="button" className="gw-btn self-start" onClick={() => void (cerrado ? reabrir(i + 1) : cerrar(i + 1))}>
                {cerrado ? 'Reabrir…' : 'Cerrar'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface ResultadoIntegridad {
  revisados: number
  sin_huella: number
  correcto: boolean
  fallos: { asiento: number; numero?: number; fecha?: string; motivo: string }[]
}

function Integridad() {
  const [r, setR] = useState<ResultadoIntegridad | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mirando, setMirando] = useState(false)

  async function comprobar() {
    setMirando(true)
    setError(null)
    const { data, error: e } = await supabase.rpc('fn_contab_comprobar_integridad')
    setMirando(false)
    if (e) return setError(e.message)
    setR(data as ResultadoIntegridad)
  }

  return (
    <div className="flex flex-col gap-2 text-[13px]">
      <div className="text-[12px] text-[#555]">
        Cada asiento tiene una huella que depende de su contenido y de la del asiento anterior, como VeriFactu. Si alguien cambia, quita o mete un asiento por
        fuera del programa, la cadena se rompe y aquí se ve cuál.
      </div>
      <button type="button" className="gw-btn self-start" onClick={() => void comprobar()} disabled={mirando}>
        {mirando ? 'Comprobando…' : 'Comprobar integridad'}
      </button>
      {error && <div className="text-[12px] text-[#c42b1c]">{error}</div>}
      {r &&
        (r.correcto ? (
          <div className="border border-[#1a7f37] bg-[#eaf6ec] p-2 text-[#1a7f37]">
            ✅ Todo correcto: {r.revisados} asientos revisados, ninguno tocado por fuera del programa.
          </div>
        ) : (
          <div className="flex flex-col gap-1 border border-[#8c1d12] bg-[#fdecea] p-2">
            <b className="text-[#8c1d12]">
              ⚠ Hay {r.fallos.length} problema{r.fallos.length === 1 ? '' : 's'}
              {r.sin_huella ? ` y ${r.sin_huella} asiento(s) sin huella` : ''}.
            </b>
            {r.fallos.map((f, i) => (
              <div key={i}>
                Asiento {f.numero ?? `id ${f.asiento}`} {f.fecha ? `(${fecha(f.fecha)})` : ''}: {f.motivo}
              </div>
            ))}
            <div className="text-[12px]">
              Qué hacer: no toques nada, mira en Archivo → Auditoría quién y cuándo cambió esos asientos y avisa a Rober (informático). Un asiento sin huella
              aparece un momento justo después de grabarlo; si sigue, también es para revisar.
            </div>
          </div>
        ))}
    </div>
  )
}
