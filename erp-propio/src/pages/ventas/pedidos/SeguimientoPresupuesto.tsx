// Seguimiento de un presupuesto (Luis, 29/10/2026): estado, responsable, próximo contacto y, si se
// pierde, el motivo. La base de datos pone sola la fecha de volver a llamar al enviarlo
// (fn_presupuesto_estado_guarda); aquí se propone la misma para verla antes de guardar.
// Aceptado → «Pasar a pedido» (fn_presupuesto_a_pedido).

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GwDate, GwSelect } from '../../../components/gw'
import { supabase } from '../../../lib/supabase'
import { valorParametro } from '../../../lib/parametros'
import { GwOperativa } from '../../../components/gw/GwOperativa'

export type EstadoPresupuesto = 'borrador' | 'enviado' | 'seguimiento' | 'aceptado' | 'perdido'

export const ESTADOS_PRESUPUESTO: { valor: EstadoPresupuesto; texto: string; color: string }[] = [
  { valor: 'borrador', texto: 'Borrador', color: '#6b7280' },
  { valor: 'enviado', texto: 'Enviado', color: '#1d5fb4' },
  { valor: 'seguimiento', texto: 'En seguimiento', color: '#b45309' },
  { valor: 'aceptado', texto: 'Aceptado', color: '#127a12' },
  { valor: 'perdido', texto: 'Perdido', color: '#c42b1c' },
]

export const MOTIVOS_PERDIDA = ['Precio', 'Plazo de entrega', 'Se lo compró a la competencia', 'No contesta', 'Ya no lo necesita', 'Otro']

export interface DatosSeguimiento {
  presupuesto_estado: EstadoPresupuesto | null
  proximo_contacto: string | null
  responsable_codigo: string | null
  enviado_en: string | null
  motivo_perdida: string | null
  pedido_generado_tienda: string | null
  pedido_generado_numero: number | null
  fecha_fin: string | null
}

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Atlantic/Canary' }).format(new Date())
const masDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function SeguimientoPresupuesto({
  d,
  editando,
  consulta,
  tienda,
  numero,
  onChange,
}: {
  d: DatosSeguimiento
  editando: boolean
  /** En consulta y con número: se puede pasar a pedido. */
  consulta: boolean
  tienda: string | null
  numero: number | null
  onChange: (p: Partial<DatosSeguimiento>) => void
}) {
  const navigate = useNavigate()
  const [empleados, setEmpleados] = useState<{ codigo: string; nombre: string; numero_operario: string | null }[]>([])
  const [pasando, setPasando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ayuda, setAyuda] = useState(false)
  useEffect(() => {
    supabase
      .from('empleado')
      .select('codigo, nombre, numero_operario')
      .eq('activo', true)
      .order('codigo')
      .then(({ data }) => setEmpleados((data ?? []) as typeof empleados))
  }, [])

  const estado = d.presupuesto_estado ?? 'borrador'
  const abierto = estado === 'borrador' || estado === 'enviado' || estado === 'seguimiento'
  const vencido = abierto && !!d.proximo_contacto && d.proximo_contacto < hoy()
  const caducado = abierto && !!d.fecha_fin && d.fecha_fin < hoy()
  const color = ESTADOS_PRESUPUESTO.find((e) => e.valor === estado)?.color

  function cambiarEstado(e: EstadoPresupuesto) {
    const p: Partial<DatosSeguimiento> = { presupuesto_estado: e }
    if ((e === 'enviado' || e === 'seguimiento') && !d.proximo_contacto) {
      const dias = Number(valorParametro('pre.dias_seguimiento') ?? 3) || 3
      p.proximo_contacto = masDias(hoy(), dias)
    }
    if (e === 'aceptado' || e === 'perdido') p.proximo_contacto = null
    if (e !== 'perdido') p.motivo_perdida = null
    onChange(p)
  }

  async function pasarAPedido() {
    if (!tienda || numero == null) return
    if (!confirm(`¿Pasar el presupuesto ${tienda}-${numero} a un pedido nuevo con las mismas líneas?`)) return
    setPasando(true)
    setError(null)
    const { data, error: e } = await supabase.rpc('fn_presupuesto_a_pedido', { p_tienda: tienda, p_numero: numero })
    setPasando(false)
    if (e) return setError(e.message)
    const r = data as { tienda: string; numero: number }
    navigate(`/pedidos/${encodeURIComponent(r.tienda)}/${r.numero}`)
  }

  return (
    <fieldset className="gw-group flex flex-wrap items-end gap-x-3 gap-y-1 !pt-0" style={{ borderColor: color }}>
      <legend className="font-bold" style={{ color }}>
        Seguimiento del presupuesto
      </legend>
      <label className="flex flex-col">
        <span className="gw-label">Estado</span>
        <GwSelect className="w-[160px] font-bold" style={{ color }} value={estado} disabled={!editando} onChange={(e) => cambiarEstado(e.target.value as EstadoPresupuesto)}>
          {ESTADOS_PRESUPUESTO.map((e) => (
            <option key={e.valor} value={e.valor}>
              {e.texto}
            </option>
          ))}
        </GwSelect>
      </label>
      <label className="flex flex-col">
        <span className="gw-label">Responsable (Nº Empl.)</span>
        <GwSelect className="w-[200px]" value={d.responsable_codigo ?? ''} disabled={!editando} onChange={(e) => onChange({ responsable_codigo: e.target.value || null })}>
          <option value="">—</option>
          {empleados.map((e) => (
            <option key={e.codigo} value={e.codigo}>
              {e.numero_operario ?? e.codigo} · {e.nombre}
            </option>
          ))}
        </GwSelect>
      </label>
      {abierto && (
        <label className="flex flex-col">
          <span className="gw-label" style={vencido ? { color: '#c42b1c', fontWeight: 700 } : undefined}>{vencido ? 'Próximo contacto (¡vencido!)' : 'Próximo contacto'}</span>
          <div className="w-[130px]">
            <GwDate value={d.proximo_contacto} disabled={!editando} onChange={(v) => onChange({ proximo_contacto: v ?? null })} />
          </div>
        </label>
      )}
      {estado === 'perdido' && (
        <label className="flex flex-col">
          <span className="gw-label">Motivo</span>
          <GwSelect className="w-[230px]" value={d.motivo_perdida ?? ''} disabled={!editando} onChange={(e) => onChange({ motivo_perdida: e.target.value || null })}>
            <option value="">— elige el motivo —</option>
            {MOTIVOS_PERDIDA.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </GwSelect>
        </label>
      )}
      <span className="flex flex-col text-[12px] text-[#555]">
        {d.enviado_en && <span>Enviado el {new Date(d.enviado_en).toLocaleDateString('es-ES')}</span>}
        {caducado && <span className="font-bold text-[#c42b1c]">Caducado: venció el {d.fecha_fin!.split('-').reverse().join('/')}</span>}
      </span>
      <span className="flex-1" />
      {d.pedido_generado_numero != null ? (
        <button type="button" className="gw-btn" onClick={() => navigate(`/pedidos/${encodeURIComponent(d.pedido_generado_tienda ?? '')}/${d.pedido_generado_numero}`)}>
          Ver pedido {d.pedido_generado_tienda}-{d.pedido_generado_numero}
        </button>
      ) : (
        estado === 'aceptado' && (
          <button type="button" className="gw-btn font-bold" disabled={!consulta || pasando || numero == null} onClick={pasarAPedido} title={consulta ? '' : 'Guarda primero el presupuesto'}>
            {pasando ? 'Creando pedido…' : '➜ Pasar a pedido'}
          </button>
        )
      )}
      <button type="button" className="gw-btn" onClick={() => setAyuda((a) => !a)}>
        Operativa
      </button>
      {error && <span className="w-full text-[#c42b1c]">{error}</span>}
      {ayuda && (
        <div className="w-full border-t border-[var(--gw-border-light)] pt-1">
          <GwOperativa
            bloques={[
              {
                titulo: 'Seguimiento de un presupuesto',
                pasos: [
                  'Al mandarlo al cliente: Modificar → Estado «Enviado» → Aceptar. Se pone sola la fecha de volver a llamar (a los 3 días).',
                  'Cuando llames: cambia el Próximo contacto (o el estado a «En seguimiento»).',
                  'Si lo acepta: Estado «Aceptado» y luego «➜ Pasar a pedido».',
                  'Si no: Estado «Perdido» y elige el motivo (es obligatorio).',
                ],
              },
              {
                titulo: 'Bueno es saber',
                notas: [
                  'Un presupuesto abierto siempre tiene fecha de próximo contacto: nunca se queda en el limbo.',
                  'Los que toca llamar hoy (y los vencidos, en rojo) salen en el Panel de Control → tarjeta Presupuestos.',
                  'Caducado = ya pasó la fecha final del «Periodo de Validez».',
                  'Responsable: el empleado que hace el seguimiento (por defecto, quien lo crea).',
                ],
              },
            ]}
          />
        </div>
      )}
    </fieldset>
  )
}
