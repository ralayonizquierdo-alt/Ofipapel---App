// Parámetros → Contadores y Definición de Impuestos.

import { useCallback, useEffect, useState } from 'react'
import { GwInput, GwNumber, GwSelect } from '../../../components/gw'
import { supabase } from '../../../lib/supabase'
import { Mensaje } from '../../utilidades/comun'
import type { Opcion } from './ParametrosAvatarPage'

/** Contadores de numeración de cada tienda (se cambian en la ficha de la tienda). */
export function ContadoresVista({ tiendas }: { tiendas: Opcion[] }) {
  const [tienda, setTienda] = useState('')
  const [filas, setFilas] = useState<{ tipo_documento_codigo: string; serie: string; siguiente_numero: number }[]>([])
  useEffect(() => {
    if (!tienda && tiendas[0]) setTienda(tiendas[0].codigo)
  }, [tiendas, tienda])
  useEffect(() => {
    if (!tienda) return
    supabase
      .from('secuencia_numeracion')
      .select('tipo_documento_codigo, serie, siguiente_numero')
      .eq('tienda_terminal_codigo', tienda)
      .order('tipo_documento_codigo')
      .then(({ data }) => setFilas((data ?? []) as typeof filas))
  }, [tienda])
  return (
    <div className="flex max-w-[640px] flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="gw-label">Tienda / terminal:</span>
        <GwSelect value={tienda} onChange={(e) => setTienda(e.target.value)} className="w-[320px]">
          {tiendas.map((t) => (
            <option key={t.codigo} value={t.codigo}>
              {t.codigo} · {t.nombre}
            </option>
          ))}
        </GwSelect>
      </div>
      <div className="max-h-[300px] overflow-y-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th>Documento</th>
              <th className="w-[80px]">Serie</th>
              <th className="w-[130px] text-right!">Siguiente nº</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={`${f.tipo_documento_codigo}|${f.serie}`}>
                <td>{f.tipo_documento_codigo}</td>
                <td>{f.serie}</td>
                <td className="text-right">{f.siguiente_numero}</td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr>
                <td colSpan={3} className="text-[#777]">
                  Esta tienda aún no ha numerado ningún documento.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <span className="text-[13px] text-[#555]">Para cambiar un contador: Archivo → Tiendas → la tienda → Contadores.</span>
    </div>
  )
}

interface TipoIgic {
  tipo_pct: number
  descripcion: string | null
  cuenta_repercutido: string | null
  cuenta_soportado: string | null
  activo: boolean
}

/** Tipos de IGIC con sus cuentas contables (tabla configuracion_contable_igic). */
export function ImpuestosVista({ admin }: { admin: boolean }) {
  const [filas, setFilas] = useState<TipoIgic[]>([])
  const [edit, setEdit] = useState<TipoIgic[]>([])
  const [nuevo, setNuevo] = useState<number | null>(null)
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null)
  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('configuracion_contable_igic').select('tipo_pct, descripcion, cuenta_repercutido, cuenta_soportado, activo').order('tipo_pct')
    if (error) return setMensaje({ texto: error.message, error: true })
    const l = ((data ?? []) as TipoIgic[]).map((r) => ({ ...r, tipo_pct: Number(r.tipo_pct) }))
    setFilas(l)
    setEdit(l)
  }, [])
  useEffect(() => {
    cargar()
  }, [cargar])
  const set = (i: number, p: Partial<TipoIgic>) => setEdit((l) => l.map((r, j) => (j === i ? { ...r, ...p } : r)))
  async function guardar() {
    setMensaje(null)
    for (const r of edit) {
      const antes = filas.find((f) => f.tipo_pct === r.tipo_pct)
      if (antes && JSON.stringify(antes) === JSON.stringify(r)) continue
      const { error } = await supabase.from('configuracion_contable_igic').upsert(r)
      if (error) return setMensaje({ texto: `IGIC ${r.tipo_pct} %: ${error.message}`, error: true })
    }
    setMensaje({ texto: 'Impuestos guardados.' })
    cargar()
  }
  const cambiado = JSON.stringify(filas) !== JSON.stringify(edit)
  return (
    <div className="flex max-w-[820px] flex-col gap-2">
      <div className="max-h-[300px] overflow-y-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th className="w-[80px] text-right!">IGIC %</th>
              <th>Descripción</th>
              <th className="w-[140px]">Cuenta repercutido</th>
              <th className="w-[140px]">Cuenta soportado</th>
              <th className="w-[60px]">Activo</th>
            </tr>
          </thead>
          <tbody>
            {edit.map((r, i) => (
              <tr key={r.tipo_pct}>
                <td className="text-right">{r.tipo_pct.toLocaleString('es-ES')}</td>
                <td>
                  <GwInput value={r.descripcion ?? ''} disabled={!admin} onChange={(e) => set(i, { descripcion: e.target.value || null })} />
                </td>
                <td>
                  <GwInput value={r.cuenta_repercutido ?? ''} disabled={!admin} onChange={(e) => set(i, { cuenta_repercutido: e.target.value.replace(/\D/g, '') || null })} />
                </td>
                <td>
                  <GwInput value={r.cuenta_soportado ?? ''} disabled={!admin} onChange={(e) => set(i, { cuenta_soportado: e.target.value.replace(/\D/g, '') || null })} />
                </td>
                <td className="text-center">
                  <input type="checkbox" checked={r.activo} disabled={!admin} onChange={(e) => set(i, { activo: e.target.checked })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {admin && (
        <div className="flex items-center gap-2">
          <span className="gw-label">Nuevo tipo (%):</span>
          <div className="w-[90px]">
            <GwNumber value={nuevo} decimals={2} onChange={setNuevo} />
          </div>
          <button
            type="button"
            className="gw-btn"
            disabled={nuevo == null || edit.some((r) => r.tipo_pct === nuevo)}
            onClick={() => {
              if (nuevo == null) return
              setEdit((l) => [...l, { tipo_pct: nuevo, descripcion: `IGIC ${nuevo.toLocaleString('es-ES')} %`, cuenta_repercutido: null, cuenta_soportado: null, activo: true }].sort((a, b) => a.tipo_pct - b.tipo_pct))
              setNuevo(null)
            }}
          >
            Añadir
          </button>
          <span className="flex-1" />
          <button type="button" className="gw-btn" disabled={!cambiado} onClick={guardar}>
            Guardar impuestos
          </button>
        </div>
      )}
      {mensaje && <Mensaje {...mensaje} />}
    </div>
  )
}
