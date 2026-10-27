import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { GwSelect, GwWindow, formatGw } from '../../components/gw'
import { cajaAbiertaDe, cargarMaestrosCaja, errorTexto, recordarTiendaPuesto, tiendaPuesto, type TiendaCaja } from './cajaModel'

// Caja → Entrada en caja / Salida de caja: el diálogo pequeño «GéminisWin» de la captura
// (importe seleccionado + concepto, Aceptar / Cancelar). Crea un movimiento «USU» de contado
// en efectivo en la caja abierta de la tienda/terminal de este puesto (fn_caja_entrada_salida).
// Se muestra sin ventana detrás, sobre el escritorio, como en GeminisWin.

export function EntradaSalidaCajaPage({ tipo }: { tipo: 'entrada' | 'salida' }) {
  const navigate = useNavigate()
  const titulo = tipo === 'entrada' ? 'Entrada en caja' : 'Salida de caja'
  const [tiendas, setTiendas] = useState<TiendaCaja[]>([])
  const [tienda, setTienda] = useState('')
  const [importe, setImporte] = useState(formatGw(0, 3))
  const [concepto, setConcepto] = useState(titulo)
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const refImporte = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setImporte(formatGw(0, 3))
    setConcepto(titulo)
    setMensaje(null)
    cargarMaestrosCaja().then(({ tiendas: t }) => {
      setTiendas(t)
      setTienda(tiendaPuesto(t))
      setTimeout(() => refImporte.current?.select(), 0)
    })
  }, [titulo])

  function cerrar() {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate('/')
  }

  async function aceptar() {
    const n = Number(importe.trim().replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) {
      setMensaje({ texto: 'Escribe un importe mayor que 0.', error: true })
      refImporte.current?.select()
      return
    }
    setGuardando(true)
    setMensaje(null)
    if ((await cajaAbiertaDe(tienda)) == null) {
      setGuardando(false)
      setMensaje({ texto: `No hay caja abierta en la tienda ${tienda}: ábrela en Caja → Apertura de Caja.`, error: true })
      return
    }
    const { data, error } = await supabase.rpc('fn_caja_entrada_salida', {
      p_tienda: tienda,
      p_importe: Math.round(n * 1000) / 1000,
      p_concepto: concepto,
      p_entrada: tipo === 'entrada',
    })
    setGuardando(false)
    if (error) {
      setMensaje({ texto: errorTexto(new Error(error.message)), error: true })
      return
    }
    recordarTiendaPuesto(tienda)
    setMensaje({ texto: `Movimiento de caja ${tienda}-${data} guardado.`, error: false })
    setTimeout(cerrar, 900)
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center"
      onKeyDown={(e) => {
        if (e.key === 'Escape') cerrar()
        else if (e.altKey && e.key.toLowerCase() === 'a') {
          e.preventDefault()
          aceptar()
        } else if (e.altKey && e.key.toLowerCase() === 'c') {
          e.preventDefault()
          cerrar()
        }
      }}
    >
      <GwWindow title="Ofipapel ERP" onClose={cerrar} className="w-[832px] max-w-[96vw]">
        <div className="flex flex-col">
          <fieldset className="mx-1 border border-[var(--gw-border)] px-2 pb-2 pt-0">
            <legend className="px-1 text-[21px] leading-[24px]">{titulo}:</legend>
            <div className="flex items-center gap-4">
              <input
                ref={refImporte}
                autoFocus
                className="gw-input gw-num !h-[38px] !w-[176px] flex-none !text-[21px] selection:bg-[#0078d7] selection:text-white"
                value={importe}
                title="Importe"
                onFocus={(e) => e.target.select()}
                onChange={(e) => setImporte(e.target.value)}
                onBlur={() => {
                  const n = Number(importe.trim().replace(/\./g, '').replace(',', '.'))
                  if (Number.isFinite(n)) setImporte(formatGw(n, 3))
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    ;(e.currentTarget.parentElement?.querySelector('input[title="Concepto"]') as HTMLInputElement | null)?.focus()
                  }
                }}
              />
              <input
                className="gw-input !h-[38px] min-w-0 flex-1 !text-[21px]"
                value={concepto}
                title="Concepto"
                maxLength={250}
                onChange={(e) => setConcepto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    aceptar()
                  }
                }}
              />
            </div>
          </fieldset>
          <div className="mt-8 flex items-center gap-2 border-t border-[var(--gw-border)] px-1 pt-1.5">
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="gw-label">Tienda</span>
              <GwSelect
                className="!h-[26px] !w-[70px]"
                value={tienda}
                title="Tienda/terminal de este puesto (la misma del TPV)"
                onChange={(e) => setTienda(e.target.value)}
              >
                {tiendas.map((t) => (
                  <option key={t.codigo} value={t.codigo}>
                    {t.codigo}
                  </option>
                ))}
              </GwSelect>
              {mensaje && <span className={`gw-label truncate ${mensaje.error ? '!text-[#c42b1c]' : '!text-[#127a12]'}`}>{mensaje.texto}</span>}
            </span>
            <button type="button" disabled={guardando} onClick={aceptar} className="flex h-[48px] w-[200px] items-center justify-center gap-1 border border-[var(--gw-border)] bg-[#f3f3f3] text-[21px] hover:bg-[#e5f1fb]">
              <Check size={18} strokeWidth={3} className="text-[#2a9d2a]" />
              <span>
                <u>A</u>ceptar
              </span>
            </button>
            <button type="button" onClick={cerrar} className="flex h-[48px] w-[200px] items-center justify-center gap-1 border border-[var(--gw-border)] bg-[#f3f3f3] text-[21px] hover:bg-[#e5f1fb]">
              <X size={18} strokeWidth={3} className="text-[#c42b1c]" />
              <span>
                <u>C</u>ancelar
              </span>
            </button>
          </div>
        </div>
      </GwWindow>
    </div>
  )
}
