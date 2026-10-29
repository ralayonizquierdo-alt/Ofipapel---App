import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { GwSelect, GwWindow, formatGw } from '../../../components/gw'
import { GwOperativa } from '../../../components/gw/GwOperativa'
import { ESTADOS_PRESUPUESTO } from './estadosPresupuesto'

// Relación de seguimientos (Luis, 30/10/2026): todos los presupuestos abiertos con su próximo
// contacto, por fecha y vendedor (fn_relacion_seguimientos). Pulsar una fila abre el presupuesto.

interface Fila {
  tienda: string
  numero: number
  fecha: string | null
  cliente: string | null
  total: number | null
  estado: string
  proximo_contacto: string | null
  valido_hasta: string | null
  responsable: string | null
  responsable_nombre: string | null
  mio: boolean | null
  caducado: boolean
  dias_retraso: number | null
  contactos: number
  ultimo: string | null
}

const fechaEs = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '')

export function RelacionSeguimientos({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vend, setVend] = useState('')
  const [orden, setOrden] = useState<'fecha' | 'vendedor'>('fecha')
  const [ayuda, setAyuda] = useState(false)

  useEffect(() => {
    supabase.rpc('fn_relacion_seguimientos', { p_tienda: null }).then(({ data, error: e }) => {
      if (e) setError(e.message)
      setFilas((data as Fila[]) ?? [])
    })
  }, [])

  const vendedores = useMemo(() => {
    const m = new Map<string, string>()
    for (const f of filas ?? []) if (f.responsable) m.set(f.responsable, f.responsable_nombre ?? '')
    return [...m].sort((a, b) => a[0].localeCompare(b[0], 'es', { numeric: true }))
  }, [filas])

  const lista = useMemo(() => {
    const l = (filas ?? []).filter((f) => !vend || f.responsable === vend)
    if (orden === 'vendedor')
      return [...l].sort(
        (a, b) => (a.responsable ?? '~').localeCompare(b.responsable ?? '~', 'es', { numeric: true }) || (a.proximo_contacto ?? '9').localeCompare(b.proximo_contacto ?? '9'),
      )
    return l
  }, [filas, vend, orden])

  const abrir = (f: Fila) => {
    onClose()
    navigate(`/presupuestos/${encodeURIComponent(f.tienda)}/${f.numero}`)
  }
  const textoEstado = (e: string) => ESTADOS_PRESUPUESTO.find((x) => x.valor === e)?.texto ?? e

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 pt-10" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <GwWindow title="Relación de seguimientos de presupuestos" onClose={onClose} className="w-[1100px] max-w-[97vw]">
        <div className="flex flex-col gap-2 text-[14px]">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col">
              <span className="gw-label">Vendedor</span>
              <GwSelect className="w-[220px]" value={vend} onChange={(e) => setVend(e.target.value)}>
                <option value="">Todos</option>
                {vendedores.map(([n, nombre]) => (
                  <option key={n} value={n}>
                    {n} · {nombre}
                  </option>
                ))}
              </GwSelect>
            </label>
            <label className="flex flex-col">
              <span className="gw-label">Orden</span>
              <GwSelect className="w-[200px]" value={orden} onChange={(e) => setOrden(e.target.value as 'fecha' | 'vendedor')}>
                <option value="fecha">Por fecha de contacto</option>
                <option value="vendedor">Por vendedor</option>
              </GwSelect>
            </label>
            <span className="text-[13px] text-[#555]">{filas ? `${lista.length} abiertos` : 'Cargando…'}</span>
            <span className="flex-1" />
            <button type="button" className="gw-btn" onClick={() => setAyuda((a) => !a)}>
              Operativa
            </button>
          </div>
          {ayuda && (
            <GwOperativa
              bloques={[
                {
                  titulo: 'Relación de seguimientos',
                  pasos: [
                    'Salen todos los presupuestos abiertos (borrador, enviado, en seguimiento) con el día que toca volver a llamar.',
                    'Elige un vendedor o deja «Todos»; ordena por fecha o por vendedor.',
                    'Pulsa una fila para abrir el presupuesto y hacer el SEGUIMIENTO.',
                  ],
                },
                {
                  titulo: 'Colores',
                  notas: ['Rojo: la llamada ya está vencida.', 'Negrita: toca llamar hoy.', 'Caducado: pasó la fecha de validez (renovar o dar por perdido).'],
                },
              ]}
            />
          )}
          {error && <span className="text-[#c42b1c]">{error}</span>}
          <div className="max-h-[60vh] overflow-auto border border-[var(--gw-border)]">
            <table className="gw-grid">
              <thead>
                <tr>
                  <th className="w-[100px]">Próx. contacto</th>
                  <th className="w-[60px]">Vend.</th>
                  <th className="w-[80px]">Nº</th>
                  <th className="w-[90px]">Fecha</th>
                  <th>Cliente</th>
                  <th className="w-[90px] !text-right">Total</th>
                  <th className="w-[110px]">Estado</th>
                  <th className="w-[40px]" title="Contactos hechos">Ct.</th>
                  <th>Último contacto</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((f) => {
                  const vencido = (f.dias_retraso ?? 0) > 0
                  const hoy = f.dias_retraso === 0
                  return (
                    <tr
                      key={`${f.tienda}-${f.numero}`}
                      className={`cursor-pointer hover:bg-[#e5f1fb] ${vencido ? 'text-[#c42b1c]' : ''} ${hoy ? 'font-bold' : ''}`}
                      onClick={() => abrir(f)}
                      title="Abrir el presupuesto"
                    >
                      <td>{fechaEs(f.proximo_contacto) || '—'}</td>
                      <td title={f.responsable_nombre ?? ''}>{f.responsable ?? ''}</td>
                      <td>
                        {f.tienda}-{f.numero}
                      </td>
                      <td>{fechaEs(f.fecha)}</td>
                      <td className="truncate">{f.cliente ?? ''}</td>
                      <td className="text-right">{f.total != null ? formatGw(f.total, 2) : ''}</td>
                      <td>
                        {textoEstado(f.estado)}
                        {f.caducado && <b className="ml-1 text-[#c42b1c]">· Caducado</b>}
                      </td>
                      <td className="text-center">{f.contactos}</td>
                      <td className="truncate">{f.ultimo ?? ''}</td>
                    </tr>
                  )
                })}
                {filas && !lista.length && (
                  <tr>
                    <td colSpan={9} className="text-center text-[#777]">
                      No hay presupuestos abiertos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <button type="button" className="gw-btn" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      </GwWindow>
    </div>
  )
}
