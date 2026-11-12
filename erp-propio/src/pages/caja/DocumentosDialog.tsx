// Ventana «Documentos» de GeminisWin (tabla DOCUMENT.DBF; capturas 11, 12/11/2026): código,
// descripción y cuenta contable. Una sola tabla (`concepto_gasto_compra`) que usan el campo Documento
// del movimiento de caja y el «Documento y/o Concepto» de los gastos adicionales de compras.
// Como en GeminisWin, desde la propia ventana se elige y también se da de alta, se modifica y se
// da de baja (Rober, 12/11/2026). La cuenta contable es solo un dato: no genera asientos.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { GwField, GwInput, GwWindow } from '../../components/gw'

export interface Documento {
  id: number
  codigo: string | null
  descripcion: string
  cuenta_contable: string | null
  cuenta_partida: string | null
  cuenta_contrapartida: string | null
  orden: number | null
  actualizado_en: string
}
const COLS = 'id, codigo, descripcion, cuenta_contable, cuenta_partida, cuenta_contrapartida, orden, actualizado_en'
const th = 'border border-[var(--gw-border-light)] bg-[var(--gw-face)] px-1.5 py-0.5 text-left font-bold'
const td = 'border border-[var(--gw-border-light)] px-1.5 py-0.5'
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'medium' })

export function DocumentosDialog({ onPick, onClose }: { onPick: (d: Documento) => void; onClose: () => void }) {
  const [filas, setFilas] = useState<Documento[]>([])
  const [sel, setSel] = useState<number | null>(null)
  const [editando, setEditando] = useState<{ id: number | null; codigo: string; descripcion: string; cuenta: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.from('concepto_gasto_compra').select(COLS).order('orden', { nullsFirst: false }).order('descripcion')
    if (e) setError(e.message)
    setFilas((data ?? []) as Documento[])
  }, [])
  useEffect(() => void cargar(), [cargar])

  const actual = filas.find((f) => f.id === sel) ?? null

  async function guardar() {
    if (!editando) return
    const descripcion = editando.descripcion.trim()
    if (!descripcion) return setError('Escribe la descripción del documento.')
    setError(null)
    setOcupado(true)
    const datos = { codigo: editando.codigo.trim() || null, descripcion, cuenta_contable: editando.cuenta.trim() || null, actualizado_en: new Date().toISOString() }
    const r =
      editando.id == null
        ? await supabase
            .from('concepto_gasto_compra')
            .insert({ ...datos, orden: Math.max(0, ...filas.map((f) => f.orden ?? 0)) + 1 })
            .select('id')
            .single()
        : await supabase.from('concepto_gasto_compra').update(datos).eq('id', editando.id).select('id').single()
    setOcupado(false)
    if (r.error) return setError(r.error.code === '23505' ? 'Ya hay un documento con esa descripción.' : r.error.code === '42501' || r.error.code === 'PGRST116' ? 'No tienes permiso para cambiar la tabla de documentos.' : r.error.message)
    setEditando(null)
    await cargar()
    setSel((r.data as { id: number }).id)
  }

  async function borrar() {
    if (!actual || !confirm(`¿Dar de baja el documento «${actual.descripcion}»?`)) return
    setError(null)
    setOcupado(true)
    const { error: e, count } = await supabase.from('concepto_gasto_compra').delete({ count: 'exact' }).eq('id', actual.id)
    setOcupado(false)
    if (e) return setError(e.code === '23503' ? 'Este documento ya está usado en alguna compra: no se puede dar de baja.' : e.message)
    if (!count) return setError('Solo un administrador puede dar de baja documentos.')
    setSel(null)
    void cargar()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-auto bg-black/20 p-3">
      <GwWindow title="Documentos" onClose={onClose} className="w-[760px] max-w-full">
        <div className="flex flex-col gap-1.5 p-1 text-[13px]">
          <div className="max-h-[52vh] overflow-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0">
                <tr>
                  <th className={th}>Documento</th>
                  <th className={th}>Descrip</th>
                  <th className={th}>Ctacont</th>
                  <th className={th}>Ultmod</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id} className={`cursor-pointer ${sel === f.id ? 'bg-[#91c9f7]' : 'hover:bg-[#eef6ff]'}`} onClick={() => setSel(f.id)} onDoubleClick={() => onPick(f)}>
                    <td className={`${td} whitespace-nowrap`}>{f.codigo}</td>
                    <td className={td}>{f.descripcion}</td>
                    <td className={`${td} whitespace-nowrap`}>{f.cuenta_contable}</td>
                    <td className={`${td} whitespace-nowrap`}>{fechaHora(f.actualizado_en)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {editando && (
            <div className="flex flex-wrap items-end gap-2 border border-[var(--gw-border)] bg-white p-1.5">
              <GwField label="Documento (código)">
                <GwInput className="w-[110px]" value={editando.codigo} maxLength={12} onChange={(e) => setEditando({ ...editando, codigo: e.target.value })} />
              </GwField>
              <GwField label="Descrip">
                <GwInput className="w-[300px]" autoFocus value={editando.descripcion} maxLength={60} onChange={(e) => setEditando({ ...editando, descripcion: e.target.value })} />
              </GwField>
              <GwField label="Ctacont (cuenta contable)">
                <GwInput className="w-[130px]" value={editando.cuenta} maxLength={12} onChange={(e) => setEditando({ ...editando, cuenta: e.target.value })} />
              </GwField>
              <button type="button" className="gw-btn h-[26px] font-bold" disabled={ocupado} onClick={() => void guardar()}>
                Guardar
              </button>
              <button type="button" className="gw-btn h-[26px]" disabled={ocupado} onClick={() => setEditando(null)}>
                Cancelar
              </button>
            </div>
          )}
          {error && <div className="font-bold text-[#c42b1c]">{error}</div>}

          <div className="flex flex-wrap items-center gap-1">
            <button type="button" className="gw-btn h-[28px]" disabled={ocupado || !!editando} title="Nuevo documento" onClick={() => (setError(null), setEditando({ id: null, codigo: '', descripcion: '', cuenta: '' }))}>
              Nuevo
            </button>
            <button
              type="button"
              className="gw-btn h-[28px]"
              disabled={ocupado || !!editando || !actual}
              title="Modificar el documento marcado"
              onClick={() => actual && (setError(null), setEditando({ id: actual.id, codigo: actual.codigo ?? '', descripcion: actual.descripcion, cuenta: actual.cuenta_contable ?? '' }))}
            >
              Modificar
            </button>
            <button type="button" className="gw-btn h-[28px] text-[#c42b1c]" disabled={ocupado || !!editando || !actual} title="Dar de baja el documento marcado" onClick={() => void borrar()}>
              Eliminar
            </button>
            <span className="flex-1" />
            <button type="button" className="gw-btn h-[28px] w-[110px] font-bold" disabled={!actual || !!editando} onClick={() => actual && onPick(actual)}>
              ✔ Aceptar
            </button>
            <button type="button" className="gw-btn h-[28px] w-[110px]" onClick={onClose}>
              ✘ Cancelar
            </button>
          </div>
        </div>
      </GwWindow>
    </div>
  )
}
