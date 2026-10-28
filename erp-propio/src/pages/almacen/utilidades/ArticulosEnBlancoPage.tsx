import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Trash2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { formatGw } from '../../../components/gw'
import { Grupo, L } from '../../../components/gw/GwInformeArticulos'
import { AvisoSinCaptura, BotonCerrar, ModalGw, fechaEs, msgError, useF4 } from './comun'

// Utilidades → Elimina ArtiEnBlanco. SIN CAPTURA de GeminisWin. Localiza los artículos «en
// blanco» (activos, sin descripción o sin datos mínimos: sin familia, PVP, coste ni código de
// barras) que además no tienen movimientos, stock, ventas, pedidos, traspasos, inventarios,
// peticiones ni lotes (fn_articulos_en_blanco). Tras confirmar con la lista, los da de BAJA
// LÓGICA (fn_articulos_en_blanco_baja, que vuelve a comprobarlo uno a uno); no se borra nada.

interface Fila {
  codigo_interno: string
  descripcion: string
  familia_codigo: string | null
  pvp: number | null
  fecha_alta: string | null
  motivo: string
}

export function ArticulosEnBlancoPage() {
  const navigate = useNavigate()
  const cerrar = useCallback(() => navigate('/'), [navigate])
  useF4(cerrar)
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState<{ t: string; error?: boolean } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [confirmar, setConfirmar] = useState(false)

  const buscar = useCallback(async () => {
    setOcupado(true)
    try {
      const { data, error } = await supabase.rpc('fn_articulos_en_blanco', { p_limite: 2000 })
      if (error) throw error
      const f = (data ?? []) as Fila[]
      setFilas(f)
      setMarcados(new Set(f.map((x) => x.codigo_interno)))
    } catch (e) {
      setMsg({ t: `Error: ${msgError(e)}`, error: true })
    } finally {
      setOcupado(false)
    }
  }, [])

  useEffect(() => {
    buscar()
  }, [buscar])

  async function darDeBaja() {
    setOcupado(true)
    try {
      const { data, error } = await supabase.rpc('fn_articulos_en_blanco_baja', { p_codigos: [...marcados] })
      if (error) throw error
      const r = (data ?? []) as { codigo_interno: string; resultado: string }[]
      const ok = r.filter((x) => x.resultado === 'Dado de baja').length
      const no = r.filter((x) => x.resultado !== 'Dado de baja')
      setConfirmar(false)
      await buscar()
      setMsg({ t: `${ok} artículo(s) dado(s) de baja.${no.length ? ` ${no.length} no: ${no.map((x) => `${x.codigo_interno} (${x.resultado})`).join(', ')}.` : ''}` })
    } catch (e) {
      setConfirmar(false)
      setMsg({ t: `Error: ${msgError(e)}`, error: true })
    } finally {
      setOcupado(false)
    }
  }

  const lista = (filas ?? []).filter((f) => marcados.has(f.codigo_interno))
  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <Grupo
        titulo="Artículos en blanco"
        derecha={
          <span className="ml-auto">
            <AvisoSinCaptura />
          </span>
        }
      >
        <p className={`${L} text-[#444]`}>
          Artículos activos sin descripción, o sin familia, PVP, coste ni código de barras, que no tienen movimientos de stock, stock, ventas,
          pedidos, traspasos, inventarios, peticiones ni lotes. Se dan de baja (anulados con fecha de hoy y fuera de la web); no se borra ninguno.
        </p>
      </Grupo>
      <div className="min-h-0 flex-1 overflow-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th style={{ width: 30 }}>
                <input
                  type="checkbox"
                  title="Marcar todos"
                  checked={!!filas?.length && filas.every((f) => marcados.has(f.codigo_interno))}
                  onChange={(e) => setMarcados(e.target.checked ? new Set((filas ?? []).map((f) => f.codigo_interno)) : new Set())}
                />
              </th>
              <th style={{ width: 160 }}>Cod. Interno</th>
              <th>Descripción</th>
              <th style={{ width: 110 }}>Familia</th>
              <th style={{ width: 100 }} className="!text-right">
                PVP
              </th>
              <th style={{ width: 100 }}>F. Alta</th>
              <th style={{ width: 300 }}>Motivo</th>
            </tr>
          </thead>
          <tbody>
            {(filas ?? []).map((f) => (
              <tr key={f.codigo_interno}>
                <td className="text-center">
                  <input
                    type="checkbox"
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
                <td className="max-w-[380px] truncate">{f.descripcion.trim() ? `«${f.descripcion}»` : '(vacía)'}</td>
                <td>{f.familia_codigo}</td>
                <td className="text-right">{formatGw(Number(f.pvp ?? 0), 3)}</td>
                <td>{fechaEs(f.fecha_alta)}</td>
                <td>{f.motivo}</td>
              </tr>
            ))}
            {filas && !filas.length && (
              <tr>
                <td colSpan={7} className="text-center text-[#6d6d6d]">
                  No hay artículos en blanco.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 text-[14px]">
        {filas && (
          <span>
            Encontrados <b>{filas.length}</b> · marcados <b>{marcados.size}</b>
          </span>
        )}
        {msg && <span className={msg.error ? 'text-[#c42b1c]' : 'text-[#127a12]'}>{msg.t}</span>}
      </div>
      <div className="flex items-stretch gap-2 border-t border-[var(--gw-border-light)] pr-[64px] pt-1">
        <div className="flex w-[175px] flex-none items-center px-1 text-[16px] leading-[19px]">Pulse F4 para cerrar la ventana</div>
        <span className="flex-1" />
        <button type="button" className="gw-btn !h-[46px] !w-[150px] !gap-1.5 !text-[17px]" disabled={ocupado} onClick={buscar}>
          <RefreshCw size={15} /> Buscar
        </button>
        <button type="button" className="gw-btn !h-[46px] !w-[250px] !gap-1.5 !text-[17px]" disabled={!marcados.size || ocupado} onClick={() => setConfirmar(true)}>
          <Trash2 size={16} className="text-[#c42b1c]" /> Dar de baja marcados
        </button>
        <BotonCerrar onClick={cerrar} />
      </div>

      {confirmar && (
        <ModalGw titulo="Elimina ArtiEnBlanco" onClose={() => !ocupado && setConfirmar(false)} ancho={560}>
          <div className="flex flex-col gap-2 text-[15px]">
            <p>
              Se darán de baja <b>{lista.length}</b> artículo(s) en blanco:
            </p>
            <div className="max-h-[260px] overflow-auto border border-[var(--gw-border)] bg-white px-1.5 py-1 text-[14px]">
              {lista.map((f) => (
                <div key={f.codigo_interno} className="flex gap-2">
                  <span className="w-[150px] flex-none">{f.codigo_interno}</span>
                  <span className="truncate text-[#444]">{f.motivo}</span>
                </div>
              ))}
            </div>
            <p className="text-[13px] text-[#444]">No se borran: quedan anulados con la fecha de hoy. Se vuelve a comprobar cada uno antes de darlo de baja.</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="gw-btn !h-[30px] !w-[150px]" disabled={ocupado} onClick={darDeBaja} autoFocus>
                {ocupado ? 'Dando de baja…' : 'Sí, dar de baja'}
              </button>
              <button type="button" className="gw-btn !h-[30px] !w-[110px]" disabled={ocupado} onClick={() => setConfirmar(false)}>
                No
              </button>
            </div>
          </div>
        </ModalGw>
      )}
    </div>
  )
}
