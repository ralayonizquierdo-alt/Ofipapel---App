import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react'
import { Plus, Trash2, Calculator, Save } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { FormField, TextInput, SelectInput } from '../../../components/FormField'
import { Toggle } from '../../../components/Toggle'
import { type Articulo, type ArticuloPrecioNivel, type ArticuloCodigoBarras, NIVELES_TARIFA } from '../types'

type Patch = Partial<Articulo>

function toNum(v: string): number | null {
  if (v === '') return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function fmtDate(v: string | null) {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function Section({ title, children, cols = 'sm:grid-cols-2 lg:grid-cols-4' }: { title: string; children: ReactNode; cols?: string }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      <div className={`grid grid-cols-1 gap-3 ${cols}`}>{children}</div>
    </section>
  )
}

function emptyNiveles(codigo: string): ArticuloPrecioNivel[] {
  return NIVELES_TARIFA.map((n) => ({
    articulo_codigo: codigo,
    nivel_tarifa: n.nivel,
    pvp: 0,
    incremento_pct: null,
    modo_calculo: n.nivel >= 4 ? 'D' : 'P',
    permite_descuento_linea: true,
  }))
}

export function TabCaracteristicas({
  articulo,
  editing,
  onChange,
  plantillas,
}: {
  articulo: Articulo
  editing: boolean
  onChange: (patch: Patch) => void
  plantillas: { codigo: string; nombre: string }[]
}) {
  const codigo = articulo.codigo_interno
  const disabled = !editing

  const [niveles, setNiveles] = useState<ArticuloPrecioNivel[]>(() => emptyNiveles(codigo))
  const [preciosCargados, setPreciosCargados] = useState(false)
  const [savingPrecios, setSavingPrecios] = useState(false)
  const [preciosMsg, setPreciosMsg] = useState<string | null>(null)
  const [barras, setBarras] = useState<ArticuloCodigoBarras[]>([])
  const [nuevoBarra, setNuevoBarra] = useState({ codigo_barras: '', unidades_por_codigo: '', unidad_descripcion: '' })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!codigo) return
    setPreciosCargados(false)
    supabase
      .from('articulo_precio_nivel')
      .select('*')
      .eq('articulo_codigo', codigo)
      .then(({ data }) => {
        const base = emptyNiveles(codigo)
        for (const row of (data ?? []) as ArticuloPrecioNivel[]) {
          const i = base.findIndex((b) => b.nivel_tarifa === row.nivel_tarifa)
          if (i >= 0) base[i] = { ...row, pvp: Number(row.pvp), incremento_pct: row.incremento_pct == null ? null : Number(row.incremento_pct) }
        }
        setNiveles(base)
        setPreciosCargados(true)
      })
    loadBarras()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo])

  async function loadBarras() {
    const { data } = await supabase.from('articulo_codigo_barras').select('*').eq('articulo_codigo', codigo).order('id')
    setBarras((data ?? []) as ArticuloCodigoBarras[])
  }

  function num<K extends keyof Articulo>(key: K) {
    return {
      type: 'number' as const,
      step: 'any',
      value: (articulo[key] ?? '') as string | number,
      onChange: (e: ChangeEvent<HTMLInputElement>) => onChange({ [key]: toNum(e.target.value) } as Patch),
      disabled,
    }
  }

  function text<K extends keyof Articulo>(key: K) {
    return {
      value: (articulo[key] ?? '') as string,
      onChange: (e: ChangeEvent<HTMLInputElement>) => onChange({ [key]: e.target.value === '' ? null : e.target.value } as Patch),
      disabled,
    }
  }

  function bool<K extends keyof Articulo>(key: K, label: string, extraDisabled = false) {
    return <Toggle label={label} checked={Boolean(articulo[key])} disabled={disabled || extraDisabled} onChange={(v) => onChange({ [key]: v } as Patch)} />
  }

  function setNivel(nivel: number, patch: Partial<ArticuloPrecioNivel>) {
    setNiveles((prev) => prev.map((n) => (n.nivel_tarifa === nivel ? { ...n, ...patch } : n)))
    if (nivel === 0 && patch.pvp !== undefined) onChange({ pvp: patch.pvp })
  }

  function calcularDesdeCoste() {
    const base = Number(articulo.coste_neto ?? articulo.coste_puro ?? 0)
    const general = niveles.find((n) => n.nivel_tarifa === 0)
    let pvpGeneral = general?.pvp ?? 0
    if (general && general.modo_calculo !== 'D' && general.incremento_pct != null)
      pvpGeneral = round2(base * (1 + Number(general.incremento_pct) / 100))
    const next = niveles.map((n) => {
      if (n.nivel_tarifa === 0) return { ...n, pvp: pvpGeneral }
      // Sin margen indicado se respeta el PVP actual: recalcular con 0 % dejaría la tarifa a precio de coste.
      if (n.incremento_pct == null) return n
      const inc = Number(n.incremento_pct)
      if (n.modo_calculo === 'D') return { ...n, pvp: round2(pvpGeneral * (1 - inc / 100)) }
      return { ...n, pvp: round2(base * (1 + inc / 100)) }
    })
    setNiveles(next)
    onChange({ pvp: pvpGeneral })
  }

  async function guardarPrecios() {
    setSavingPrecios(true)
    setPreciosMsg(null)
    const rows = niveles.map((n) => ({ ...n, articulo_codigo: codigo, pvp: n.pvp ?? 0 }))
    const { error: err } = await supabase.from('articulo_precio_nivel').upsert(rows, { onConflict: 'articulo_codigo,nivel_tarifa' })
    setSavingPrecios(false)
    setPreciosMsg(err ? err.message : 'Precios guardados.')
  }

  async function addBarra() {
    if (!nuevoBarra.codigo_barras.trim()) return
    setError(null)
    const { error: err } = await supabase.from('articulo_codigo_barras').insert({
      articulo_codigo: codigo,
      codigo_barras: nuevoBarra.codigo_barras.trim(),
      unidades_por_codigo: toNum(nuevoBarra.unidades_por_codigo),
      unidad_descripcion: nuevoBarra.unidad_descripcion || null,
      digitos_barras: nuevoBarra.codigo_barras.trim().length,
    })
    if (err) {
      setError(err.code === '23505' ? `El código de barras ${nuevoBarra.codigo_barras.trim()} ya está asignado a otro artículo.` : err.message)
      return
    }
    setNuevoBarra({ codigo_barras: '', unidades_por_codigo: '', unidad_descripcion: '' })
    loadBarras()
  }

  async function deleteBarra(id?: number) {
    if (id == null) return
    const { error: err } = await supabase.from('articulo_codigo_barras').delete().eq('id', id)
    if (err) setError(err.message)
    else loadBarras()
  }

  const igic = Number(articulo.igic_pct ?? 0)
  const modificaPvp = Boolean(articulo.permite_modificar_pvp_al_vender)

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <Section title="Costes" cols="sm:grid-cols-3 lg:grid-cols-7">
        <FormField label="Coste puro proveedor" hint="COSTE_PURO"><TextInput {...num('coste_puro')} /></FormField>
        <FormField label="Coste neto" hint="COSTE_NETO"><TextInput {...num('coste_neto')} /></FormField>
        <FormField label="Coste bruto" hint="COSTE_BRUT"><TextInput {...num('coste_bruto')} /></FormField>
        <FormField label="Precio líquido" hint="PRECIO_LIQ"><TextInput {...num('precio_liquidado')} /></FormField>
        <FormField label="Precio líquido medio" hint="PM_COMPRA"><TextInput {...num('precio_medio_compra')} /></FormField>
        <FormField label="Coste proveedor local" hint="COST_LOCAL"><TextInput {...num('coste_local')} /></FormField>
        <div className="flex items-end pb-2">{bool('calcular_coste_automatico', 'Calcular coste automático')}</div>
      </Section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tarifas de venta (7 PVP)</h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={calcularDesdeCoste}
              disabled={disabled || !preciosCargados}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <Calculator size={14} /> Calcular desde coste
            </button>
            <button
              type="button"
              disabled={disabled || savingPrecios || !preciosCargados}
              onClick={guardarPrecios}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              <Save size={14} /> {savingPrecios ? 'Guardando…' : 'Guardar precios'}
            </button>
          </div>
        </div>
        {preciosMsg && <p className="text-xs text-slate-500">{preciosMsg}</p>}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Tarifa</th>
                <th className="px-3 py-2">Modo</th>
                <th className="px-3 py-2">Margen / Dto %</th>
                <th className="px-3 py-2">PVP sin impuesto</th>
                <th className="px-3 py-2">PVP con IGIC</th>
                <th className="px-3 py-2">Dto. en línea</th>
              </tr>
            </thead>
            <tbody>
              {niveles.map((n) => {
                const nombre = NIVELES_TARIFA.find((t) => t.nivel === n.nivel_tarifa)?.nombre
                return (
                  <tr key={n.nivel_tarifa} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-1.5 font-medium text-slate-700">
                      {nombre} <span className="text-xs text-slate-400">PVP_{n.nivel_tarifa}</span>
                    </td>
                    <td className="px-3 py-1.5">
                      <SelectInput
                        disabled={disabled || !preciosCargados}
                        value={n.modo_calculo ?? 'P'}
                        onChange={(e) => setNivel(n.nivel_tarifa, { modo_calculo: e.target.value })}
                        className="py-1"
                      >
                        <option value="P">P — % sobre coste</option>
                        <option value="D">D — % dto. sobre General</option>
                      </SelectInput>
                    </td>
                    <td className="px-3 py-1.5">
                      <TextInput
                        type="number"
                        step="any"
                        disabled={disabled || !preciosCargados}
                        value={n.incremento_pct ?? ''}
                        onChange={(e) => setNivel(n.nivel_tarifa, { incremento_pct: toNum(e.target.value) })}
                        className="w-24 py-1"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <TextInput
                        type="number"
                        step="0.01"
                        disabled={disabled || !preciosCargados}
                        value={n.pvp ?? ''}
                        onChange={(e) => setNivel(n.nivel_tarifa, { pvp: toNum(e.target.value) ?? 0 })}
                        className="w-28 py-1"
                      />
                    </td>
                    <td className="px-3 py-1.5 tabular-nums text-slate-600">{round2((n.pvp ?? 0) * (1 + igic / 100)).toFixed(2)} €</td>
                    <td className="px-3 py-1.5">
                      <Toggle
                        label=""
                        checked={n.permite_descuento_linea}
                        disabled={disabled || !preciosCargados}
                        onChange={(v) => setNivel(n.nivel_tarifa, { permite_descuento_linea: v })}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <Section title="Plantilla de tarifa" cols="sm:grid-cols-2 lg:grid-cols-4">
        <FormField label="Plantilla de tarifa" hint="CODARTTAR">
          <SelectInput
            disabled={disabled}
            value={articulo.plantilla_tarifa_codigo ?? ''}
            onChange={(e) => onChange({ plantilla_tarifa_codigo: e.target.value || null })}
          >
            <option value="">— (la de la familia)</option>
            {plantillas.map((p) => (
              <option key={p.codigo} value={p.codigo}>
                {p.codigo} — {p.nombre}
              </option>
            ))}
          </SelectInput>
        </FormField>
        <FormField label="Descuento máximo %" hint="DTOMAXCLI"><TextInput {...num('descuento_maximo_cliente_pct')} /></FormField>
      </Section>

      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Códigos de barras adicionales (ARTBARRA)</h3>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Código de barras</th>
                <th className="px-3 py-2">Unidades</th>
                <th className="px-3 py-2">Unidad</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {barras.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-center text-xs text-slate-400">Sin códigos adicionales.</td>
                </tr>
              )}
              {barras.map((b) => (
                <tr key={b.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-1.5 font-mono text-xs">{b.codigo_barras}</td>
                  <td className="px-3 py-1.5">{b.unidades_por_codigo ?? '—'}</td>
                  <td className="px-3 py-1.5">{b.unidad_descripcion ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => deleteBarra(b.id)}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {editing && (
                <tr className="bg-slate-50/50">
                  <td className="px-3 py-1.5">
                    <TextInput value={nuevoBarra.codigo_barras} onChange={(e) => setNuevoBarra({ ...nuevoBarra, codigo_barras: e.target.value })} placeholder="EAN…" className="py-1" />
                  </td>
                  <td className="px-3 py-1.5">
                    <TextInput type="number" step="any" value={nuevoBarra.unidades_por_codigo} onChange={(e) => setNuevoBarra({ ...nuevoBarra, unidades_por_codigo: e.target.value })} className="w-24 py-1" />
                  </td>
                  <td className="px-3 py-1.5">
                    <TextInput value={nuevoBarra.unidad_descripcion} onChange={(e) => setNuevoBarra({ ...nuevoBarra, unidad_descripcion: e.target.value })} placeholder="Caja, unidad…" className="py-1" />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <button type="button" onClick={addBarra} className="rounded p-1 text-indigo-600 hover:bg-indigo-50">
                      <Plus size={16} />
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Section title="Impuestos">
        <FormField label="% IGIC" hint="IGIC">
          <TextInput {...num('igic_pct')} list="igic-opciones" />
          <datalist id="igic-opciones">
            {[0, 3, 7, 9.5, 15, 20].map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </FormField>
        <FormField label="Tipo de IGIC" hint="TIPOIGIC, confirmar significado con Luis">
          <SelectInput
            disabled={disabled}
            value={articulo.tipo_igic_codigo ?? 0}
            onChange={(e) => onChange({ tipo_igic_codigo: Number(e.target.value) })}
          >
            <option value={0}>Repercutido</option>
            <option value={1}>Soportado</option>
          </SelectInput>
        </FormField>
        <FormField label="Canon / impuesto 2 (IMPU2)" hint="IMPU2"><TextInput {...num('impuesto2_pct')} /></FormField>
        <FormField label="Impuesto 3" hint="IMPU3"><TextInput {...num('impuesto3_pct')} /></FormField>
      </Section>

      <Section title="Unidad de medida y embalaje">
        <FormField label="Unidad de medida" hint="UNI_MEDIDA"><TextInput {...text('unidad_medida')} /></FormField>
        <FormField label="Unidad básica" hint="UNI_MEDBAS"><TextInput {...text('unidad_medida_base')} /></FormField>
        <FormField label="Valor unidad de medida" hint="UNI_MEDVAL"><TextInput {...num('unidad_medida_valor')} /></FormField>
        <FormField label="Meses de garantía" hint="GARANTIA"><TextInput {...num('garantia_meses')} /></FormField>
        <FormField label="Unidades por caja" hint="UNI_CAJA"><TextInput {...num('unidades_por_caja')} /></FormField>
        <FormField label="Cajas por bulto" hint="CAJ_BULTO"><TextInput {...num('cajas_por_bulto')} /></FormField>
        <FormField label="Control de lotes" hint="CTRLLOTES">
          <SelectInput disabled={disabled} value={articulo.control_lotes ?? 0} onChange={(e) => onChange({ control_lotes: Number(e.target.value) })}>
            <option value={0}>Sin control</option>
            <option value={1}>Con control de lotes</option>
          </SelectInput>
        </FormField>
        <div className="flex items-end pb-2">{bool('vende_por_caja', 'Vender cajas')}</div>
      </Section>

      <Section title="Opciones" cols="sm:grid-cols-2 lg:grid-cols-3">
        {bool('no_ver_en_venta', 'No mostrar en ventas')}
        {bool('no_ver_en_compra', 'No mostrar en compras')}
        {bool('vende_por_horario', 'Vender por horas y minutos')}
        {bool('pesar_en_tpv', 'Pesar al vender')}
        {bool('no_calcular_pvp_auto', 'No calcular PVP automáticamente')}
        <FormField label="Tipo de artículo" hint="TIPO_ART (código GeminisWin)"><TextInput {...num('tipo_articulo')} /></FormField>
        <div className="flex flex-col gap-2 rounded-lg border border-slate-100 p-3 sm:col-span-2 lg:col-span-3">
          {bool('permite_modificar_pvp_al_vender', 'Permitir modificar el PVP al vender')}
          <div className="flex flex-wrap gap-4 pl-11">
            {bool('permite_modificar_pvp_solo_si_es_cero', 'Solo si PVP = 0', !modificaPvp)}
            {bool('modificar_pvp_actualiza_articulo', 'Reemplazar en artículos', !modificaPvp)}
            {bool('modificar_pvp_pide_precio_coste', 'Pedir precio de coste', !modificaPvp)}
          </div>
        </div>
      </Section>

      <Section title="Fechas" cols="sm:grid-cols-3 lg:grid-cols-6">
        {(
          [
            ['Última compra', 'ULTCOMPRA', articulo.ultima_compra_fecha],
            ['Última venta', 'ULTVENTA', articulo.ultima_venta_fecha],
            ['Última modif. PVP', 'F_MODPREC', articulo.fecha_ultima_modificacion_pvp],
            ['Alta', 'F_ALTA', articulo.fecha_alta],
            ['Baja', 'F_BAJA', articulo.fecha_baja],
            ['Previsión de entrada de pedido', 'FECPREVENT', articulo.fecha_prevista_venta],
          ] as const
        ).map(([label, hint, value]) => (
          <FormField key={hint} label={label} hint={hint}>
            <span className="rounded-lg bg-slate-50 px-3 py-2 text-sm tabular-nums text-slate-700">{fmtDate(value)}</span>
          </FormField>
        ))}
      </Section>
    </div>
  )
}
