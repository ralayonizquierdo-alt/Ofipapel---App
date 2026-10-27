import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Download, FilePen, FilePlus2, ListOrdered, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { GwField, GwInput, GwSelect } from '../../components/gw'
import {
  ORIGEN_LABEL,
  cargarAsientosConApuntes,
  cargarDescripciones,
  descargarCsv,
  eur,
  eur0,
  fechaEs,
  finAnio,
  inicioAnio,
  numCsv,
  type Apunte,
  type Asiento,
} from './contabModel'
import { AsientoEditor } from './AsientoEditor'
import { Aviso, Barra, Rango, Rejilla, Vacio } from './ui'

/**
 * Contabilidad → Diario de Asientos (modo «diario») y Asientos Pendientes / con Errores
 * (modo «errores»). Lista los asientos con sus apuntes, permite alta y modificación manual
 * (Debe = Haber obligatorio), anular, rehacer los erróneos y renumerar el ejercicio.
 */
export function DiarioPage({ modo = 'diario' }: { modo?: 'diario' | 'errores' }) {
  const [params] = useSearchParams()
  const [desde, setDesde] = useState(params.get('desde') ?? (modo === 'errores' ? '2000-01-01' : inicioAnio()))
  const [hasta, setHasta] = useState(params.get('hasta') ?? finAnio())
  const [estado, setEstado] = useState(modo === 'errores' ? 'error' : 'correcto')
  const [buscar, setBuscar] = useState('')
  const [asientos, setAsientos] = useState<Asiento[]>([])
  const [porAsiento, setPorAsiento] = useState<Map<number, Apunte[]>>(new Map())
  const [desc, setDesc] = useState<Map<string, { descripcion: string; nif: string | null }>>(new Map())
  const [sel, setSel] = useState<number | null>(null)
  const [editando, setEditando] = useState<'nuevo' | number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const estados = estado === 'todos' ? ['correcto', 'error', 'anulado'] : estado === 'vigentes' ? ['correcto', 'error'] : [estado]
      const r = await cargarAsientosConApuntes(desde, hasta, estados)
      setAsientos(r.asientos)
      setPorAsiento(r.porAsiento)
      setDesc(await cargarDescripciones([...r.porAsiento.values()].flat().map((p) => p.cuenta ?? '')))
    } catch (e) {
      setError((e as Error).message)
    }
    setCargando(false)
  }, [desde, hasta, estado])

  useEffect(() => {
    cargar()
  }, [cargar])

  const filas = useMemo(() => {
    const b = buscar.trim().toLowerCase()
    if (!b) return asientos
    return asientos.filter(
      (a) =>
        String(a.numero ?? '') === b ||
        a.concepto.toLowerCase().includes(b) ||
        (a.error ?? '').toLowerCase().includes(b) ||
        (porAsiento.get(a.id) ?? []).some((p) => (p.cuenta ?? '').startsWith(b) || (p.documento ?? '').toLowerCase().includes(b)),
    )
  }, [asientos, porAsiento, buscar])

  const tot = useMemo(
    () => filas.filter((a) => a.estado !== 'anulado').reduce((s, a) => ({ d: s.d + Number(a.total_debe), h: s.h + Number(a.total_haber) }), { d: 0, h: 0 }),
    [filas],
  )
  const actual = asientos.find((a) => a.id === sel) ?? null

  async function anular() {
    if (!actual) return
    const motivo = window.prompt(
      `Anular el asiento ${actual.numero ?? '(sin número)'}. Sus documentos volverán a quedar pendientes de contabilizar.\nMotivo:`,
      'Anulado manualmente',
    )
    if (motivo == null) return
    const { error: e } = await supabase.rpc('fn_contab_anular_asiento', { p_id: actual.id, p_motivo: motivo })
    if (e) return setError(e.message)
    setOk('Asiento anulado.')
    cargar()
  }

  async function rehacer() {
    // Rehace los asientos con error del periodo: anula y vuelve a generar sus documentos
    const tipos = [...new Set(filas.filter((a) => a.estado === 'error').map((a) => a.origen_tipo).filter((t) => t !== 'manual'))]
    if (!tipos.length) return setOk('No hay asientos automáticos con error que rehacer.')
    const { data, error: e } = await supabase.rpc('fn_contab_generar', { p_desde: desde, p_hasta: hasta, p_tipos: tipos, p_agrupar: null, p_regenerar: 'errores' })
    if (e) return setError(e.message)
    const r = data as { creados: number; errores: number }
    setOk(`Rehechos: ${r.creados} correctos y ${r.errores} siguen con error.`)
    cargar()
  }

  async function renumerar() {
    const ej = Number(window.prompt('Renumerar por fecha los asientos correctos del ejercicio:', String(new Date(desde).getFullYear())))
    if (!ej) return
    const { data, error: e } = await supabase.rpc('fn_contab_renumerar', { p_ejercicio: ej })
    if (e) return setError(e.message)
    setOk(`Ejercicio ${ej}: ${data} asientos renumerados.`)
    cargar()
  }

  function exportar() {
    const filasCsv: unknown[][] = []
    for (const a of filas) {
      for (const p of porAsiento.get(a.id) ?? []) {
        filasCsv.push([
          fechaEs(a.fecha),
          a.numero ?? '',
          p.cuenta ?? '',
          desc.get(p.cuenta ?? '')?.descripcion ?? '',
          numCsv(p.debe),
          numCsv(p.haber),
          p.concepto ?? a.concepto,
          p.documento ?? '',
          p.nif ?? desc.get(p.cuenta ?? '')?.nif ?? '',
          p.contrapartida ?? '',
          a.estado,
        ])
      }
    }
    descargarCsv(
      `diario_${desde}_${hasta}.csv`,
      ['Fecha', 'Asiento', 'Cuenta', 'Descripción', 'Debe', 'Haber', 'Concepto', 'Documento', 'NIF', 'Contrapartida', 'Estado'],
      filasCsv,
    )
  }

  if (editando != null) {
    const a = editando === 'nuevo' ? null : (asientos.find((x) => x.id === editando) ?? null)
    return (
      <div className="flex min-w-0 flex-col gap-1.5 text-[13px]">
        <AsientoEditor
          asiento={a}
          apuntes={a ? (porAsiento.get(a.id) ?? []) : []}
          onClose={() => setEditando(null)}
          onSaved={(id) => {
            setEditando(null)
            setSel(id)
            setOk('Asiento guardado.')
            if (estado === 'error') setEstado('vigentes')
            else cargar()
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-[13px]">
      <Barra>
        <Rango desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} />
        <GwField label="Estado">
          <GwSelect value={estado} onChange={(e) => setEstado(e.target.value)} className="w-[150px]">
            <option value="correcto">Correctos</option>
            <option value="error">Con errores (pendientes)</option>
            <option value="vigentes">Correctos y con errores</option>
            <option value="todos">Todos (también anulados)</option>
          </GwSelect>
        </GwField>
        <GwField label="Buscar (nº, cuenta, concepto, documento)">
          <GwInput value={buscar} onChange={(e) => setBuscar(e.target.value)} className="w-[200px]" />
        </GwField>
        <button type="button" className="gw-btn" onClick={cargar}>
          <RefreshCw size={14} /> {cargando ? 'Cargando…' : 'Actualizar'}
        </button>
        <button type="button" className="gw-btn" onClick={() => setEditando('nuevo')}>
          <FilePlus2 size={14} /> Nuevo
        </button>
        <button type="button" className="gw-btn" disabled={!actual || actual.estado === 'anulado'} onClick={() => actual && setEditando(actual.id)}>
          <FilePen size={14} /> Modificar
        </button>
        <button type="button" className="gw-btn" disabled={!actual || actual.estado === 'anulado'} onClick={anular}>
          <Trash2 size={14} /> Anular
        </button>
        {modo === 'errores' ? (
          <button type="button" className="gw-btn" onClick={rehacer} title="Vuelve a generar los asientos con error (p. ej. tras dar de alta la cuenta del cliente)">
            <RotateCcw size={14} /> Rehacer con errores
          </button>
        ) : (
          <button type="button" className="gw-btn" onClick={renumerar}>
            <ListOrdered size={14} /> Renumerar
          </button>
        )}
        <button type="button" className="gw-btn" onClick={exportar}>
          <Download size={14} /> Excel (CSV)
        </button>
      </Barra>
      <Aviso error={error} ok={ok} />
      <Rejilla alto="calc(100vh - 290px)">
        <table className="gw-grid">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-[70px]">Asiento</th>
              <th className="w-[85px]">Fecha</th>
              <th className="w-[100px]">Cuenta</th>
              <th className="w-[230px]">Descripción</th>
              <th>Concepto</th>
              <th className="w-[110px]">Documento</th>
              <th className="w-[100px] text-right!">Debe</th>
              <th className="w-[100px] text-right!">Haber</th>
            </tr>
          </thead>
          <tbody>
            {!cargando && filas.length === 0 && <Vacio cols={8} texto={modo === 'errores' ? 'No hay asientos pendientes ni con errores.' : 'Sin asientos en el periodo.'} />}
            {filas.map((a) => {
              const s = sel === a.id
              const cab = a.estado === 'error' ? 'bg-[#fde7e9]' : a.estado === 'anulado' ? 'bg-[#eee] text-[#888] line-through' : 'bg-[#e8eef8]'
              return (
                <Fragment key={a.id}>
                  <tr
                    className={`${s ? 'gw-selected' : cab} font-bold`}
                    onClick={() => setSel(a.id)}
                    onDoubleClick={() => a.estado !== 'anulado' && setEditando(a.id)}
                    title="Doble clic: modificar"
                  >
                    <td className="text-right">{a.numero ?? '—'}</td>
                    <td>{fechaEs(a.fecha)}</td>
                    <td colSpan={2}>
                      {ORIGEN_LABEL[a.origen_tipo] ?? a.origen_tipo}
                      {a.editado_manual ? ' · modificado' : ''}
                    </td>
                    <td className="truncate" title={a.concepto}>
                      {a.concepto}
                    </td>
                    <td className="truncate">{a.origen_referencia}</td>
                    <td className="text-right">{eur0(a.total_debe)}</td>
                    <td className="text-right">{eur0(a.total_haber)}</td>
                  </tr>
                  {a.error && (
                    <tr onClick={() => setSel(a.id)}>
                      <td />
                      <td colSpan={7} className="font-bold text-[#c42b1c]">
                        ⚠ {a.error}
                      </td>
                    </tr>
                  )}
                  {(porAsiento.get(a.id) ?? []).map((p) => (
                    <tr key={p.id} onClick={() => setSel(a.id)} className={a.estado === 'anulado' ? 'text-[#888]' : ''}>
                      <td />
                      <td />
                      <td className={`font-mono ${p.cuenta ? '' : 'bg-[#fde7e9]'}`}>{p.cuenta ?? '(sin cuenta)'}</td>
                      <td className="truncate" title={desc.get(p.cuenta ?? '')?.descripcion}>
                        {desc.get(p.cuenta ?? '')?.descripcion ?? (p.cuenta ? '¿?' : p.error)}
                      </td>
                      <td className="truncate" title={p.concepto ?? ''}>
                        {p.concepto}
                        {p.igic_tipo != null ? ` (base ${eur0(p.igic_base)} al ${String(p.igic_tipo).replace('.', ',')} %)` : ''}
                      </td>
                      <td className="truncate">{p.documento}</td>
                      <td className="text-right">{eur(p.debe)}</td>
                      <td className="text-right">{eur(p.haber)}</td>
                    </tr>
                  ))}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </Rejilla>
      <div className="flex gap-4 text-[13px]">
        <span>
          {filas.length} asientos · Total Debe <b>{eur0(tot.d)}</b> · Total Haber <b>{eur0(tot.h)}</b>
        </span>
        {Math.abs(tot.d - tot.h) > 0.005 && <b className="text-[#c42b1c]">Diferencia {eur0(tot.d - tot.h)}</b>}
      </div>
    </div>
  )
}
