import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ban, Search } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwCheck, GwInput, GwSelect, formatGw } from '../../../components/gw'
import { CodigoBuscar, Grupo, IN, L } from '../../../components/gw/GwInformeArticulos'
import { AvisoSinCaptura, BotonCerrar, ModalGw, msgError, useAlmacenes, useF4 } from './comun'

// Utilidades → Stock A 0 de Familia. SIN CAPTURA de GeminisWin. Pone a 0 el stock de los
// artículos de una familia en un almacén. No toca el stock a pelo: cada artículo recibe un
// movimiento de regularización por su cantidad (fn_stock_cero_familia_aplicar), que queda en
// el listado de movimientos y se puede deshacer con otra regularización. Antes de aplicar se
// enseña la lista (fn_stock_cero_familia_previa) y se pide confirmación con artículos y unidades.

interface Fila {
  articulo_codigo: string
  descripcion: string
  familia_codigo: string
  cantidad: number
}

export function StockCeroFamiliaPage() {
  const navigate = useNavigate()
  const cerrar = useCallback(() => navigate('/'), [navigate])
  useF4(cerrar)
  const almacenes = useAlmacenes()
  const [familia, setFamilia] = useState('')
  const [nombreFamilia, setNombreFamilia] = useState('')
  const [almacen, setAlmacen] = useState('')
  const [subfamilias, setSubfamilias] = useState(false)
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [msg, setMsg] = useState<{ t: string; error?: boolean } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [confirmar, setConfirmar] = useState(false)

  useEffect(() => {
    const f = familia.trim()
    if (!f) return setNombreFamilia('')
    let vivo = true
    supabase
      .from('familia')
      .select('descripcion')
      .eq('codigo', f)
      .maybeSingle()
      .then(({ data }) => vivo && setNombreFamilia(data?.descripcion ?? 'No existe la familia'))
    return () => {
      vivo = false
    }
  }, [familia])

  async function revisar() {
    setMsg(null)
    if (!familia.trim()) return setMsg({ t: 'Indica la familia.', error: true })
    if (!almacen) return setMsg({ t: 'Indica el almacén.', error: true })
    setOcupado(true)
    try {
      const { data, error } = await supabase.rpc('fn_stock_cero_familia_previa', { p_familia: familia.trim(), p_almacen: almacen, p_subfamilias: subfamilias })
      if (error) throw error
      setFilas(((data ?? []) as Fila[]).map((f) => ({ ...f, cantidad: Number(f.cantidad) })))
    } catch (e) {
      setMsg({ t: `Error: ${msgError(e)}`, error: true })
    } finally {
      setOcupado(false)
    }
  }

  async function aplicar() {
    setOcupado(true)
    try {
      const { data, error } = await supabase.rpc('fn_stock_cero_familia_aplicar', {
        p_familia: familia.trim(),
        p_almacen: almacen,
        p_subfamilias: subfamilias,
        p_observaciones: null,
      })
      if (error) throw error
      const r = ((data ?? []) as { articulos: number; unidades_positivas: number; unidades_negativas: number }[])[0]
      setConfirmar(false)
      await revisar()
      setMsg({
        t: `Hecho: ${r?.articulos ?? 0} artículo(s) puestos a 0 en el almacén ${almacen} con movimientos de regularización (${formatGw(Number(r?.unidades_positivas ?? 0), 3)} unidades retiradas, ${formatGw(Number(r?.unidades_negativas ?? 0), 3)} de stock negativo compensadas).`,
      })
    } catch (e) {
      setConfirmar(false)
      setMsg({ t: `Error: ${msgError(e)}`, error: true })
    } finally {
      setOcupado(false)
    }
  }

  const positivas = (filas ?? []).filter((f) => f.cantidad > 0).reduce((s, f) => s + f.cantidad, 0)
  const negativas = (filas ?? []).filter((f) => f.cantidad < 0).reduce((s, f) => s - f.cantidad, 0)
  const nombreAlm = almacenes.find((a) => a.codigo === almacen)?.nombre ?? ''

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <Grupo
        titulo="Poner a 0 el stock de una familia"
        derecha={
          <span className="ml-auto">
            <AvisoSinCaptura />
          </span>
        }
      >
        <div className="grid grid-cols-[170px_minmax(0,1fr)_260px_auto_auto] items-end gap-3">
          <label className="flex flex-col">
            <span className={L}>Familia</span>
            <CodigoBuscar value={familia} lookup="familia" onChange={(v) => (setFamilia(v), setFilas(null))} />
          </label>
          <label className="flex min-w-0 flex-col">
            <span className={L}>Descripción</span>
            <GwInput className={IN} readOnly value={nombreFamilia} />
          </label>
          <label className="flex flex-col">
            <span className={L}>Almacén</span>
            <GwSelect className={IN} value={almacen} onChange={(e) => (setAlmacen(e.target.value), setFilas(null))}>
              <option value=""></option>
              {almacenes.map((a) => (
                <option key={a.codigo} value={a.codigo}>
                  {a.codigo} {a.nombre}
                </option>
              ))}
            </GwSelect>
          </label>
          <GwCheck label={<span className={L}>Incluir subfamilias</span>} checked={subfamilias} onChange={(v) => (setSubfamilias(v), setFilas(null))} />
          <button type="button" className="gw-btn !h-[30px] !w-[140px] !gap-1 !text-[15px]" disabled={ocupado} onClick={revisar}>
            <Search size={15} /> Revisar
          </button>
        </div>
        <p className={`${L} mt-1 text-[#444]`}>
          Cada artículo con stock (positivo o negativo) en el almacén recibe una regularización por su cantidad. Queda en los movimientos del
          artículo; no se edita el stock directamente. Con «Incluir subfamilias» entran las familias cuyo código empieza por el indicado.
        </p>
      </Grupo>

      <div className="min-h-0 flex-1 overflow-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th style={{ width: 150 }}>Cod. Interno</th>
              <th>Descripción</th>
              <th style={{ width: 110 }}>Familia</th>
              <th style={{ width: 130 }} className="!text-right">
                Stock actual
              </th>
              <th style={{ width: 130 }} className="!text-right">
                Regularización
              </th>
            </tr>
          </thead>
          <tbody>
            {(filas ?? []).map((f) => (
              <tr key={f.articulo_codigo}>
                <td>{f.articulo_codigo}</td>
                <td className="max-w-[480px] truncate">{f.descripcion}</td>
                <td>{f.familia_codigo}</td>
                <td className={`text-right ${f.cantidad < 0 ? 'text-[#c42b1c]' : ''}`}>{formatGw(f.cantidad, 3)}</td>
                <td className="text-right">{formatGw(-f.cantidad, 3)}</td>
              </tr>
            ))}
            {filas && !filas.length && (
              <tr>
                <td colSpan={5} className="text-center text-[#6d6d6d]">
                  Ningún artículo de esa familia tiene stock en ese almacén.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 text-[14px]">
        {filas && (
          <span>
            Artículos con stock: <b>{filas.length}</b> · unidades en positivo <b>{formatGw(positivas, 3)}</b> · en negativo <b>{formatGw(negativas, 3)}</b>
          </span>
        )}
        {msg && <span className={msg.error ? 'text-[#c42b1c]' : 'text-[#127a12]'}>{msg.t}</span>}
      </div>
      <div className="flex items-stretch gap-2 border-t border-[var(--gw-border-light)] pr-[64px] pt-1">
        <div className="flex w-[175px] flex-none items-center px-1 text-[16px] leading-[19px]">Pulse F4 para cerrar la ventana</div>
        <span className="flex-1" />
        <button type="button" className="gw-btn !h-[46px] !w-[200px] !gap-1.5 !text-[17px]" disabled={!filas?.length || ocupado} onClick={() => setConfirmar(true)}>
          <Ban size={16} className="text-[#c42b1c]" /> Poner Stock a 0
        </button>
        <BotonCerrar onClick={cerrar} />
      </div>

      {confirmar && filas && (
        <ModalGw titulo="Stock A 0 de Familia" onClose={() => !ocupado && setConfirmar(false)} ancho={480}>
          <div className="flex flex-col gap-2 text-[15px]">
            <p>
              Se pondrá a <b>0</b> el stock de la familia <b>{familia.trim()}</b> {nombreFamilia && `(${nombreFamilia})`}
              {subfamilias ? ' y sus subfamilias' : ''} en el almacén <b>{almacen}</b> {nombreAlm}.
            </p>
            <table className="text-[15px]">
              <tbody>
                <tr>
                  <td className="pr-3">Artículos afectados</td>
                  <td className="text-right font-bold">{filas.length}</td>
                </tr>
                <tr>
                  <td className="pr-3">Unidades que se retiran (stock positivo)</td>
                  <td className="text-right font-bold">{formatGw(positivas, 3)}</td>
                </tr>
                <tr>
                  <td className="pr-3">Unidades que se compensan (stock negativo)</td>
                  <td className="text-right font-bold">{formatGw(negativas, 3)}</td>
                </tr>
              </tbody>
            </table>
            <p className="text-[13px] text-[#444]">Se apunta un movimiento de regularización por artículo. ¿Continuar?</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="gw-btn !h-[30px] !w-[150px]" disabled={ocupado} onClick={aplicar} autoFocus>
                {ocupado ? 'Aplicando…' : 'Sí, poner a 0'}
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
