import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Trash2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwInput, formatGw } from '../../../components/gw'
import { CodigoBuscar, Grupo, IN, L } from '../../../components/gw/GwInformeArticulos'
import { AvisoSinCaptura, BotonCerrar, msgError, useF4 } from './comun'

// Almacén → Eliminación de Artículos. SIN CAPTURA de GeminisWin. No borra nada: da de BAJA
// (activo = no, fecha de baja hoy, fuera de la web) solo los artículos sin movimientos de stock,
// sin stock y sin líneas en ventas o pedidos (fn_articulos_eliminacion_baja). Los demás se ven
// con el motivo. Confirmar con Luis si GeminisWin borra de verdad y con qué condiciones.

interface Fila {
  codigo_interno: string
  descripcion: string
  familia_codigo: string | null
  activo: boolean
  movimientos: number
  stock_total: number
  documentos: number
  total: number
}
const motivo = (f: Fila) =>
  !f.activo ? 'Ya está de baja' : f.movimientos ? 'Tiene movimientos de stock' : Number(f.stock_total) ? 'Tiene stock' : f.documentos ? 'Está en ventas o pedidos' : ''

export function EliminacionArticulosPage() {
  const navigate = useNavigate()
  const cerrar = useCallback(() => navigate('/'), [navigate])
  useF4(cerrar)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [familia, setFamilia] = useState('')
  const [texto, setTexto] = useState('')
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function revisar() {
    setMsg(null)
    if (!desde && !hasta && !familia && !texto) return setMsg('Indica algún filtro (rango de códigos, familia o texto).')
    setOcupado(true)
    try {
      const { data, error } = await supabase.rpc('fn_articulos_eliminacion_revisar', {
        p_desde: desde || null,
        p_hasta: hasta || null,
        p_texto: texto || null,
        p_familia: familia || null,
        p_limite: 500,
      })
      if (error) throw error
      setFilas((data ?? []) as Fila[])
      setMarcados(new Set())
    } catch (e) {
      setMsg(`Error: ${msgError(e)}`)
    } finally {
      setOcupado(false)
    }
  }

  async function darDeBaja() {
    const cods = [...marcados]
    if (!cods.length) return
    if (!confirm(`¿Dar de baja ${cods.length} artículo(s)?\n\nNo se borran: quedan anulados con la fecha de hoy y fuera de la web.`)) return
    setOcupado(true)
    try {
      const { data, error } = await supabase.rpc('fn_articulos_eliminacion_baja', { p_codigos: cods })
      if (error) throw error
      const r = (data ?? []) as { codigo_interno: string; resultado: string }[]
      const ok = r.filter((x) => x.resultado === 'Dado de baja').length
      await revisar()
      setMsg(
        `${ok} artículo(s) dado(s) de baja${
          r.length - ok
            ? `; ${r.length - ok} no: ${r
                .filter((x) => x.resultado !== 'Dado de baja')
                .map((x) => `${x.codigo_interno} (${x.resultado})`)
                .join(', ')}`
            : ''
        }.`,
      )
    } catch (e) {
      setMsg(`Error: ${msgError(e)}`)
    } finally {
      setOcupado(false)
    }
  }

  const elegibles = (filas ?? []).filter((f) => !motivo(f))
  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <Grupo
        titulo="Artículos a revisar"
        derecha={
          <span className="ml-auto">
            <AvisoSinCaptura />
          </span>
        }
      >
        <div className="grid grid-cols-[190px_190px_170px_minmax(0,1fr)_auto] items-end gap-3">
          <label className="flex flex-col">
            <span className={L}>Artículo desde</span>
            <CodigoBuscar value={desde} lookup="articulo" onChange={setDesde} />
          </label>
          <label className="flex flex-col">
            <span className={L}>Artículo hasta</span>
            <CodigoBuscar value={hasta} lookup="articulo" onChange={setHasta} />
          </label>
          <label className="flex flex-col">
            <span className={L}>Familia</span>
            <CodigoBuscar value={familia} lookup="familia" onChange={setFamilia} />
          </label>
          <label className="flex flex-col">
            <span className={L}>Código o descripción contiene</span>
            <GwInput className={IN} value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && revisar()} />
          </label>
          <button type="button" className="gw-btn !h-[30px] !w-[150px] !gap-1 !text-[15px]" disabled={ocupado} onClick={revisar}>
            <Search size={15} /> Revisar
          </button>
        </div>
        <p className={`${L} mt-1 text-[#444]`}>
          Solo se pueden dar de baja los artículos sin movimientos de stock, sin stock y que no estén en ventas ni pedidos. No se borra ninguno.
        </p>
      </Grupo>
      <div className="min-h-0 flex-1 overflow-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th style={{ width: 30 }}>
                <input
                  type="checkbox"
                  title="Marcar todos los que se pueden dar de baja"
                  checked={elegibles.length > 0 && elegibles.every((f) => marcados.has(f.codigo_interno))}
                  onChange={(e) => setMarcados(e.target.checked ? new Set(elegibles.map((f) => f.codigo_interno)) : new Set())}
                />
              </th>
              <th>Cod. Interno</th>
              <th>Descripción</th>
              <th>Familia</th>
              <th className="!text-right">Movimientos</th>
              <th className="!text-right">Stock</th>
              <th className="!text-right">Documentos</th>
              <th>Motivo para no darlo de baja</th>
            </tr>
          </thead>
          <tbody>
            {(filas ?? []).map((f) => {
              const m = motivo(f)
              return (
                <tr key={f.codigo_interno} className={m ? 'text-[#6d6d6d]' : ''}>
                  <td className="text-center">
                    <input
                      type="checkbox"
                      disabled={!!m}
                      checked={marcados.has(f.codigo_interno)}
                      onChange={(e) =>
                        setMarcados((s) => {
                          const n = new Set(s)
                          if (e.target.checked) n.add(f.codigo_interno)
                          else n.delete(f.codigo_interno)
                          return n
                        })
                      }
                    />
                  </td>
                  <td>{f.codigo_interno}</td>
                  <td className="max-w-[380px] truncate">{f.descripcion}</td>
                  <td>{f.familia_codigo}</td>
                  <td className="text-right">{f.movimientos}</td>
                  <td className="text-right">{formatGw(f.stock_total, 3)}</td>
                  <td className="text-right">{f.documentos}</td>
                  <td>{m}</td>
                </tr>
              )
            })}
            {filas && !filas.length && (
              <tr>
                <td colSpan={8} className="text-center text-[#6d6d6d]">
                  Ningún artículo con esos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 text-[14px]">
        {filas && (
          <span>
            Revisados <b>{filas.length}</b>
            {Number(filas[0]?.total ?? 0) > filas.length ? ` de ${Number(filas[0].total).toLocaleString('es-ES')} (se ven los 500 primeros)` : ''} · se pueden dar de baja{' '}
            <b>{elegibles.length}</b> · marcados <b>{marcados.size}</b>
          </span>
        )}
        {msg && <span className={`${msg.startsWith('Error') || msg.startsWith('Indica') ? 'text-[#c42b1c]' : 'text-[#127a12]'}`}>{msg}</span>}
      </div>
      <div className="flex items-stretch gap-2 border-t border-[var(--gw-border-light)] pr-[64px] pt-1">
        <div className="flex w-[175px] flex-none items-center px-1 text-[16px] leading-[19px]">Pulse F4 para cerrar la ventana</div>
        <span className="flex-1" />
        <button type="button" className="gw-btn !h-[46px] !w-[210px] !gap-1.5 !text-[17px]" disabled={!marcados.size || ocupado} onClick={darDeBaja}>
          <Trash2 size={16} className="text-[#c42b1c]" /> Dar de baja marcados
        </button>
        <BotonCerrar onClick={cerrar} />
      </div>
    </div>
  )
}
