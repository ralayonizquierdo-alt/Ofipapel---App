import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { GwDate, GwField, GwGroup, GwInput, GwNumber, GwRadio } from '../../components/gw'
import { Aviso } from './ui'

interface Config {
  longitud_subcuenta: number
  raiz_clientes: string
  raiz_proveedores: string
  raiz_acreedores: string
  cuenta_ventas: string
  cuenta_compras: string
  cuenta_caja: string
  cuenta_bancos: string
  cuenta_tarjetas: string
  cuenta_gastos_varios: string
  cuenta_transportes: string
  cuenta_ingresos_caja: string
  cuenta_gastos_caja: string
  cuenta_retenciones_clientes: string
  cuenta_redondeo: string
  tolerancia_redondeo: number
  agrupar_tickets: 'dia' | 'documento'
  fecha_inicio: string | null
}

interface TipoIgic {
  tipo_pct: number
  descripcion: string
  cuenta_repercutido: string
  cuenta_soportado: string
  activo: boolean
}

const CUENTAS: { k: keyof Config; label: string }[] = [
  { k: 'cuenta_ventas', label: 'Ventas de mercaderías (700)' },
  { k: 'cuenta_compras', label: 'Compras de mercaderías (600)' },
  { k: 'cuenta_caja', label: 'Caja (570)' },
  { k: 'cuenta_bancos', label: 'Bancos (572)' },
  { k: 'cuenta_tarjetas', label: 'Cobros con tarjeta (572)' },
  { k: 'cuenta_gastos_varios', label: 'Pagos de gastos sin cuenta (629)' },
  { k: 'cuenta_transportes', label: 'Transportes (624)' },
  { k: 'cuenta_ingresos_caja', label: 'Entradas de caja manuales (759)' },
  { k: 'cuenta_gastos_caja', label: 'Salidas de caja manuales (629)' },
  { k: 'cuenta_retenciones_clientes', label: 'Retenciones de clientes (473)' },
  { k: 'cuenta_redondeo', label: 'Diferencias de redondeo (659)' },
]

/** Contabilidad → Configuración Contable: cuentas por defecto de los asientos automáticos. */
export function ConfiguracionContablePage() {
  const [cfg, setCfg] = useState<Config | null>(null)
  const [igic, setIgic] = useState<TipoIgic[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('configuracion_contable')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data, error: e }) => (e ? setError(e.message) : setCfg(data as Config)))
    supabase
      .from('configuracion_contable_igic')
      .select('*')
      .order('tipo_pct')
      .then(({ data }) => setIgic((data ?? []) as TipoIgic[]))
  }, [])

  async function guardar() {
    if (!cfg) return
    setError(null)
    setOk(null)
    const todas = [...CUENTAS.map((c) => String(cfg[c.k])), ...igic.flatMap((t) => [t.cuenta_repercutido, t.cuenta_soportado])]
    const malas = todas.filter((c) => !/^\d{4,10}$/.test(c))
    if (malas.length) return setError(`Cuenta(s) no válidas: ${malas.join(', ')}`)
    const { data: existen } = await supabase.from('cuenta_contable').select('codigo').in('codigo', todas)
    const faltan = [...new Set(todas.filter((c) => !(existen ?? []).some((x) => x.codigo === c)))]
    if (faltan.length) return setError(`No existen en el Plan de Cuentas: ${faltan.join(', ')}. Créalas antes en Plan de Cuentas.`)
    const { error: e } = await supabase
      .from('configuracion_contable')
      .update({ ...cfg, actualizado_en: new Date().toISOString() })
      .eq('id', 1)
    if (e) return setError(e.message)
    for (const t of igic) {
      const { error: e2 } = await supabase
        .from('configuracion_contable_igic')
        .update({ cuenta_repercutido: t.cuenta_repercutido, cuenta_soportado: t.cuenta_soportado, activo: t.activo })
        .eq('tipo_pct', t.tipo_pct)
      if (e2) return setError(e2.message)
    }
    setOk('Configuración guardada.')
  }

  if (!cfg) return <Aviso error={error} ok={null} />
  const set = <K extends keyof Config>(k: K, v: Config[K]) => setCfg({ ...cfg, [k]: v })

  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-[13px]">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <GwGroup title="Subcuentas de clientes y proveedores">
          <div className="grid grid-cols-4 gap-2">
            <GwField label="Longitud subcuenta">
              <GwNumber value={cfg.longitud_subcuenta} decimals={0} onChange={(v) => set('longitud_subcuenta', v ?? 8)} />
            </GwField>
            <GwField label="Raíz clientes">
              <GwInput value={cfg.raiz_clientes} onChange={(e) => set('raiz_clientes', e.target.value.replace(/\D/g, ''))} />
            </GwField>
            <GwField label="Raíz proveedores">
              <GwInput value={cfg.raiz_proveedores} onChange={(e) => set('raiz_proveedores', e.target.value.replace(/\D/g, ''))} />
            </GwField>
            <GwField label="Raíz acreedores">
              <GwInput value={cfg.raiz_acreedores} onChange={(e) => set('raiz_acreedores', e.target.value.replace(/\D/g, ''))} />
            </GwField>
          </div>
          <p className="mt-1 text-[12px] text-[#555]">
            Si la ficha del cliente/proveedor tiene cuenta contable (430/400) se usa esa; si no, raíz + código con ceros (cliente 00125 →{' '}
            {cfg.raiz_clientes}
            {'125'.padStart(Math.max(cfg.longitud_subcuenta - cfg.raiz_clientes.length, 3), '0')}). La subcuenta se crea sola en el Plan de Cuentas.
          </p>
        </GwGroup>
        <GwGroup title="Generación automática">
          <div className="flex flex-wrap items-end gap-3">
            <GwField label="Tickets de contado">
              <div className="flex gap-3 pt-0.5">
                <GwRadio name="agr" label="Un asiento por día y tienda" checked={cfg.agrupar_tickets === 'dia'} onChange={() => set('agrupar_tickets', 'dia')} />
                <GwRadio name="agr" label="Uno por ticket" checked={cfg.agrupar_tickets === 'documento'} onChange={() => set('agrupar_tickets', 'documento')} />
              </div>
            </GwField>
            <GwField label="Tolerancia redondeo (€)">
              <GwNumber value={cfg.tolerancia_redondeo} decimals={2} onChange={(v) => set('tolerancia_redondeo', v ?? 0)} className="w-[90px]" />
            </GwField>
            <GwField label="No contabilizar antes de">
              <GwDate value={cfg.fecha_inicio} onChange={(v) => set('fecha_inicio', v)} className="w-[100px]" />
            </GwField>
          </div>
          <p className="mt-1 text-[12px] text-[#555]">
            Diferencias de céntimos hasta la tolerancia van a la cuenta de redondeo; más, el asiento queda en «Pendientes / con errores».
          </p>
        </GwGroup>
      </div>
      <GwGroup title="Cuentas por defecto">
        <div className="grid grid-cols-4 gap-x-3 gap-y-1">
          {CUENTAS.map((c) => (
            <GwField key={c.k} label={c.label}>
              <GwInput value={String(cfg[c.k] ?? '')} maxLength={10} className="font-mono" onChange={(e) => set(c.k, e.target.value.replace(/\D/g, '') as never)} />
            </GwField>
          ))}
        </div>
      </GwGroup>
      <GwGroup title="IGIC por tipo (Canarias)">
        <table className="gw-grid max-w-[760px]">
          <thead>
            <tr>
              <th className="w-[70px]">Tipo</th>
              <th>Descripción</th>
              <th className="w-[150px]">IGIC repercutido (477)</th>
              <th className="w-[150px]">IGIC soportado (472)</th>
              <th className="w-[60px]">Activo</th>
            </tr>
          </thead>
          <tbody>
            {igic.map((t, i) => (
              <tr key={t.tipo_pct}>
                <td className="text-right">{String(t.tipo_pct).replace('.', ',')} %</td>
                <td>{t.descripcion}</td>
                <td>
                  <GwInput
                    value={t.cuenta_repercutido}
                    className="w-full font-mono"
                    onChange={(e) => setIgic(igic.map((x, j) => (j === i ? { ...x, cuenta_repercutido: e.target.value.replace(/\D/g, '') } : x)))}
                  />
                </td>
                <td>
                  <GwInput
                    value={t.cuenta_soportado}
                    className="w-full font-mono"
                    onChange={(e) => setIgic(igic.map((x, j) => (j === i ? { ...x, cuenta_soportado: e.target.value.replace(/\D/g, '') } : x)))}
                  />
                </td>
                <td className="text-center">
                  <input type="checkbox" checked={t.activo} onChange={(e) => setIgic(igic.map((x, j) => (j === i ? { ...x, activo: e.target.checked } : x)))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </GwGroup>
      <div className="flex items-center gap-2">
        <button type="button" className="gw-btn" onClick={guardar}>
          <Save size={14} /> Guardar configuración
        </button>
        <Aviso error={error} ok={ok} />
      </div>
    </div>
  )
}
