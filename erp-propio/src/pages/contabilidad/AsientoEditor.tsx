import { useEffect, useState } from 'react'
import { Plus, Save, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { GwDate, GwField, GwGroup, GwInput, GwNumber } from '../../components/gw'
import { eur0, hoy, r2, type Apunte, type Asiento } from './contabModel'
import { Aviso } from './ui'

interface Linea {
  cuenta: string
  descripcion: string
  debe: number | null
  haber: number | null
  concepto: string
  documento: string
}

const lineaVacia = (concepto = ''): Linea => ({ cuenta: '', descripcion: '', debe: null, haber: null, concepto, documento: '' })

/**
 * Edición manual de un asiento (o alta si `asiento` es null). Al guardar llama a
 * fn_contab_guardar_asiento, que comprueba Debe = Haber y que las cuentas existan; modificar
 * anula el asiento anterior y crea uno nuevo con el mismo número.
 */
export function AsientoEditor({
  asiento,
  apuntes,
  onClose,
  onSaved,
}: {
  asiento: Asiento | null
  apuntes: Apunte[]
  onClose: () => void
  onSaved: (id: number) => void
}) {
  const [fecha, setFecha] = useState<string>(asiento?.fecha ?? hoy())
  const [concepto, setConcepto] = useState(asiento?.concepto ?? '')
  const [lineas, setLineas] = useState<Linea[]>(() =>
    apuntes.length
      ? apuntes.map((p) => ({
          cuenta: p.cuenta ?? '',
          descripcion: '',
          debe: Number(p.debe) || null,
          haber: Number(p.haber) || null,
          concepto: p.concepto ?? '',
          documento: p.documento ?? '',
        }))
      : [lineaVacia(), lineaVacia()],
  )
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  // Descripciones de las cuentas
  const codigos = lineas.map((l) => l.cuenta).join(',')
  useEffect(() => {
    const cs = codigos.split(',').filter((c) => /^\d+$/.test(c))
    if (!cs.length) return
    supabase
      .from('cuenta_contable')
      .select('codigo, descripcion')
      .in('codigo', cs)
      .then(({ data }) => {
        const m = new Map((data ?? []).map((c) => [c.codigo, c.descripcion]))
        setLineas((ls) => ls.map((l) => ({ ...l, descripcion: m.get(l.cuenta) ?? (l.cuenta ? '¿No existe en el Plan de Cuentas?' : '') })))
      })
  }, [codigos])

  const td = r2(lineas.reduce((s, l) => s + (l.debe ?? 0), 0))
  const th = r2(lineas.reduce((s, l) => s + (l.haber ?? 0), 0))
  const dif = r2(td - th)

  const set = (i: number, cambios: Partial<Linea>) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...cambios } : l)))

  async function guardar() {
    setError(null)
    if (dif !== 0) return setError(`El asiento no cuadra: diferencia ${eur0(dif)}.`)
    setGuardando(true)
    const { data, error: e } = await supabase.rpc('fn_contab_guardar_asiento', {
      p_id: asiento?.id ?? null,
      p_fecha: fecha,
      p_concepto: concepto,
      p_apuntes: lineas
        .filter((l) => l.cuenta || l.debe || l.haber)
        .map((l) => ({ cuenta: l.cuenta, debe: l.debe ?? 0, haber: l.haber ?? 0, concepto: l.concepto, documento: l.documento })),
    })
    setGuardando(false)
    if (e) return setError(e.message)
    onSaved(data as number)
  }

  return (
    <GwGroup title={asiento ? `Modificar asiento ${asiento.numero ?? '(sin número)'} · ${asiento.origen_referencia ?? asiento.origen_tipo}` : 'Nuevo asiento manual'}>
      {asiento?.error && <p className="mb-1 text-[12px] font-bold text-[#c42b1c]">Motivo del error: {asiento.error}</p>}
      <div className="flex items-end gap-2">
        <GwField label="Fecha">
          <GwDate value={fecha} onChange={(v) => v && setFecha(v)} className="w-[100px]" />
        </GwField>
        <GwField label="Concepto" className="flex-1">
          <GwInput value={concepto} onChange={(e) => setConcepto(e.target.value)} maxLength={200} />
        </GwField>
      </div>
      <div className="mt-1.5 max-h-[calc(100vh-420px)] overflow-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-[110px]">Cuenta</th>
              <th className="w-[220px]">Descripción</th>
              <th className="w-[110px] text-right!">Debe</th>
              <th className="w-[110px] text-right!">Haber</th>
              <th>Concepto</th>
              <th className="w-[110px]">Documento</th>
              <th className="w-[30px]" />
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, i) => (
              <tr key={i}>
                <td>
                  <GwInput
                    value={l.cuenta}
                    maxLength={10}
                    className="w-full font-mono"
                    aria-label={`Cuenta línea ${i + 1}`}
                    onChange={(e) => set(i, { cuenta: e.target.value.replace(/\D/g, '') })}
                  />
                </td>
                <td className="truncate text-[12px]" title={l.descripcion}>
                  {l.descripcion}
                </td>
                <td>
                  <GwNumber value={l.debe} decimals={2} onChange={(v) => set(i, { debe: v, haber: v ? null : l.haber })} className="w-full" />
                </td>
                <td>
                  <GwNumber value={l.haber} decimals={2} onChange={(v) => set(i, { haber: v, debe: v ? null : l.debe })} className="w-full" />
                </td>
                <td>
                  <GwInput value={l.concepto} onChange={(e) => set(i, { concepto: e.target.value })} className="w-full" />
                </td>
                <td>
                  <GwInput value={l.documento} onChange={(e) => set(i, { documento: e.target.value })} className="w-full" />
                </td>
                <td className="text-center">
                  <button type="button" title="Quitar línea" onClick={() => setLineas(lineas.filter((_, j) => j !== i))} className="text-[#c42b1c]">
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <td colSpan={2} className="text-right">
                Totales
              </td>
              <td className="text-right">{eur0(td)}</td>
              <td className="text-right">{eur0(th)}</td>
              <td colSpan={3} className={dif ? 'text-[#c42b1c]' : 'text-[#127a12]'}>
                {dif ? `Descuadre: ${eur0(dif)}` : 'Cuadra'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <button type="button" className="gw-btn" onClick={() => setLineas([...lineas, lineaVacia(concepto)])}>
          <Plus size={14} /> Añadir línea
        </button>
        <button
          type="button"
          className="gw-btn"
          disabled={dif === 0}
          title="Añade una línea con la diferencia para cuadrar"
          onClick={() => setLineas([...lineas, { ...lineaVacia(concepto), debe: dif < 0 ? -dif : null, haber: dif > 0 ? dif : null }])}
        >
          Cuadrar con línea nueva
        </button>
        <button type="button" className="gw-btn font-bold" onClick={guardar} disabled={guardando}>
          <Save size={14} /> {guardando ? 'Guardando…' : 'Aceptar'}
        </button>
        <button type="button" className="gw-btn" onClick={onClose}>
          <X size={14} /> Cancelar
        </button>
        <Aviso error={error} />
      </div>
    </GwGroup>
  )
}
