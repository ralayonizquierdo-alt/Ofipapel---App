import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check, KeyRound, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwNumber, GwWindow, formatGw } from '../../../components/gw'
import { BloqueVerifactu } from '../../../components/VerifactuQr'
import { NIVELES, r2, type VerifactuVenta } from './ventaModel'

function Modal({ title, onClose, width = 720, children }: { title: string; onClose: () => void; width?: number; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/10 pt-40" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <GwWindow title={title} onClose={onClose} className="max-w-[95vw]">
        <div style={{ width }}>{children}</div>
      </GwWindow>
    </div>
  )
}

const btnGrande =
  'flex h-[66px] items-center justify-center gap-1.5 border border-[var(--gw-border)] bg-[#e1e1e1] text-[22px] hover:border-[var(--gw-select)] hover:bg-[#e5f1fb] disabled:text-[#8a8a8a] disabled:hover:border-[var(--gw-border)] disabled:hover:bg-[#e1e1e1]'

/**
 * «Introducir Empleado y contraseña» al entrar en el TPV. En el ERP propio la identidad es el
 * usuario de la sesión (Supabase Auth): se confirma con su propia contraseña de acceso; no hay
 * contraseñas paralelas. Para vender como otro empleado hay que cambiar de usuario.
 */
export function EmpleadoDialog({
  empleado,
  email,
  onOk,
  onCancel,
  onCambiarEmpleado,
}: {
  empleado: { codigo: string; nombre: string } | null
  email: string | null
  onOk: () => void
  onCancel: () => void
  onCambiarEmpleado: () => void
}) {
  const [pass, setPass] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [comprobando, setComprobando] = useState(false)

  async function aceptar() {
    if (!email) return
    setComprobando(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({ email, password: pass })
    setComprobando(false)
    if (err) {
      setError('Contraseña incorrecta.')
      return
    }
    onOk()
  }

  return (
    <Modal title="Introducir Empleado y contraseña" onClose={onCancel} width={720}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          aceptar()
        }}
        className="flex flex-col"
      >
        <fieldset className="gw-group mx-1.5 mt-1 px-2 pb-2">
          <legend className="text-[28px] font-bold leading-[30px]">Empleado</legend>
          <div className="flex items-center gap-2">
            <input className="gw-input !h-[40px] !w-[90px] !text-[28px] !font-bold" readOnly value={empleado?.codigo ?? ''} />
            <select className="gw-input !h-[40px] !flex-1 !text-[28px] !font-bold" disabled value={empleado?.codigo ?? ''}>
              <option value={empleado?.codigo ?? ''}>{empleado?.nombre ?? 'Usuario sin empleado asociado'}</option>
            </select>
            <button
              type="button"
              className="gw-btn !h-[40px] !w-[90px] !text-[24px] !font-bold"
              title="Para vender como otro empleado, usa «Cambiar Empleado»"
              onClick={onCambiarEmpleado}
            >
              ···
            </button>
          </div>
        </fieldset>
        <div className="flex items-center gap-4 px-6 py-5">
          <span className="w-[280px] text-[28px] font-bold">Contraseña:</span>
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            className="gw-input !h-[44px] !w-[300px] !text-[22px]"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
          />
          <KeyRound size={28} className="text-[#c99a1c]" />
        </div>
        {error && <p className="px-6 pb-2 text-[16px] text-[#c42b1c]">{error}</p>}
        {!empleado && (
          <p className="px-6 pb-2 text-[14px] text-[#c42b1c]">
            Este usuario no está asociado a ningún empleado: las ventas se guardarán sin empleado.
          </p>
        )}
        <div className="grid grid-cols-[240px_1fr_200px_200px] gap-1.5 border-t border-[var(--gw-border-light)] p-1.5">
          <button type="button" className={btnGrande} disabled title="La contraseña es la de tu usuario del ERP">
            <KeyRound size={22} className="text-[#c99a1c]" /> Cambiar Contraseña
          </button>
          <span />
          <button type="submit" className={btnGrande} disabled={comprobando || !pass}>
            <Check size={20} className="text-[#127a12]" /> Aceptar
          </button>
          <button type="button" className={btnGrande} onClick={onCancel}>
            <X size={20} className="text-[#c42b1c]" /> Cancelar
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** Cobro de la venta: efectivo, tarjeta y lo que queda pendiente (crédito). */
export function PagoDialog({
  titulo,
  pendiente,
  onOk,
  onCancel,
}: {
  titulo: string
  pendiente: number
  onOk: (cobro: { efectivo: number; tarjeta: number }) => void
  onCancel: () => void
}) {
  const [efectivo, setEfectivo] = useState<number | null>(pendiente)
  const [tarjeta, setTarjeta] = useState<number | null>(0)
  const [entregado, setEntregado] = useState<number | null>(null)
  const cobrado = r2((efectivo ?? 0) + (tarjeta ?? 0))
  const quedaPendiente = Math.max(r2(pendiente - cobrado), 0)
  const cambio = entregado != null && efectivo != null ? Math.max(r2(entregado - efectivo), 0) : 0
  const excede = cobrado > r2(pendiente) + 0.001
  const aceptar = useRef<HTMLButtonElement>(null)

  // Intro en Efectivo o Tarjeta pasa al campo siguiente; en Entregado (el último) cobra, como
  // Aceptar. Se pulsa el botón tras pintar, para que cuente el importe recién tecleado.
  function teclaCampo(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey || !(e.target instanceof HTMLInputElement)) return
    const campos = Array.from(e.currentTarget.querySelectorAll('input'))
    const i = campos.indexOf(e.target)
    if (i < 0) return
    e.preventDefault()
    if (i < campos.length - 1) campos[i + 1].focus()
    else window.setTimeout(() => aceptar.current?.click(), 0)
  }

  return (
    <Modal title={titulo} onClose={onCancel} width={520}>
      <div className="flex flex-col gap-2 p-2 text-[18px]" onKeyDown={teclaCampo}>
        <div className="flex items-center justify-between">
          <span>Importe a cobrar:</span>
          <span className="text-[30px] font-bold text-[#1a3fd0]">{formatGw(pendiente, 3)} €</span>
        </div>
        {[
          ['Efectivo:', efectivo, setEfectivo],
          ['Tarjeta:', tarjeta, setTarjeta],
          ['Entregado:', entregado, setEntregado],
        ].map(([label, value, set]) => (
          <label key={label as string} className="flex items-center justify-between gap-3">
            <span>{label as string}</span>
            <span className="w-[200px]">
              <GwNumber
                value={value as number | null}
                decimals={2}
                onChange={set as (v: number | null) => void}
                className="!h-[32px] !text-[20px]"
              />
            </span>
          </label>
        ))}
        <div className="flex justify-between">
          <span>Cambio:</span>
          <span className="font-bold">{formatGw(cambio, 2)} €</span>
        </div>
        <div className="flex justify-between">
          <span>Queda pendiente (crédito):</span>
          <span className={`font-bold ${quedaPendiente > 0 ? 'text-[#c42b1c]' : ''}`}>{formatGw(quedaPendiente, 3)} €</span>
        </div>
        {excede && <p className="text-[14px] text-[#c42b1c]">Lo cobrado supera el importe: usa «Entregado» para calcular el cambio.</p>}
        <div className="flex justify-end gap-1.5 pt-1">
          <button
            ref={aceptar}
            type="button"
            data-gw-aceptar
            className="gw-btn !h-[34px] !px-6 !text-[16px]"
            disabled={excede}
            onClick={() => onOk({ efectivo: efectivo ?? 0, tarjeta: tarjeta ?? 0 })}
          >
            <Check size={16} className="text-[#127a12]" /> Aceptar
          </button>
          <button type="button" className="gw-btn !h-[34px] !px-6 !text-[16px]" onClick={onCancel}>
            <X size={16} className="text-[#c42b1c]" /> Cancelar
          </button>
        </div>
      </div>
    </Modal>
  )
}

interface Aplazada {
  numero: number
  fecha: string | null
  hora: string | null
  cliente_codigo: string
  nombre_cliente: string | null
  total: number | null
}

/** Ctrl+F11: ventas dejadas en espera en esta tienda. */
export function AplazadasDialog({ tienda, onPick, onClose }: { tienda: string; onPick: (numero: number) => void; onClose: () => void }) {
  const [rows, setRows] = useState<Aplazada[] | null>(null)
  const [sel, setSel] = useState(0)
  useEffect(() => {
    supabase
      .from('venta')
      .select('numero, fecha, hora, cliente_codigo, nombre_cliente, total')
      .eq('tienda_terminal_codigo', tienda)
      .eq('aplazada', true)
      .order('numero', { ascending: false })
      .limit(100)
      .then(({ data }) => setRows((data ?? []) as Aplazada[]))
  }, [tienda])
  return (
    <Modal title="Ventas aplazadas" onClose={onClose} width={640}>
      <div className="flex flex-col gap-1.5">
        <div className="max-h-[320px] overflow-y-auto border border-[var(--gw-border)] bg-white">
          <table className="gw-grid">
            <thead>
              <tr>
                <th>Número</th>
                <th>Fecha</th>
                <th>Hora</th>
                <th>Cliente</th>
                <th className="text-right!">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-[#6d6d6d]">
                    No hay ventas aplazadas.
                  </td>
                </tr>
              )}
              {(rows ?? []).map((r, i) => (
                <tr key={r.numero} className={i === sel ? 'gw-selected' : ''} onClick={() => setSel(i)} onDoubleClick={() => onPick(r.numero)}>
                  <td>{r.numero}</td>
                  <td>{r.fecha ? new Date(`${r.fecha}T00:00:00`).toLocaleDateString('es-ES') : ''}</td>
                  <td>{r.hora}</td>
                  <td>
                    {r.cliente_codigo} {r.nombre_cliente}
                  </td>
                  <td className="text-right">{formatGw(r.total ?? 0, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-1.5">
          <button type="button" className="gw-btn" disabled={!rows?.[sel]} onClick={() => rows?.[sel] && onPick(rows[sel].numero)}>
            Recuperar
          </button>
          <button type="button" className="gw-btn" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </Modal>
  )
}

/** F12: stock del artículo de la línea en cada almacén. */
export function StockDialog({ articulo, descripcion, onClose }: { articulo: string; descripcion: string; onClose: () => void }) {
  const [rows, setRows] = useState<{ almacen: string; nombre: string; stock: number; reservado: number }[] | null>(null)
  useEffect(() => {
    Promise.all([
      supabase.from('almacen').select('codigo, nombre').order('codigo'),
      supabase.from('articulo_almacen_stock').select('almacen_codigo, cantidad_actual, cantidad_reservada').eq('articulo_codigo', articulo),
    ]).then(([a, s]) => {
      const st = new Map((s.data ?? []).map((x) => [x.almacen_codigo, x]))
      setRows(
        (a.data ?? []).map((al) => ({
          almacen: al.codigo,
          nombre: al.nombre,
          stock: Number(st.get(al.codigo)?.cantidad_actual ?? 0),
          reservado: Number(st.get(al.codigo)?.cantidad_reservada ?? 0),
        })),
      )
    })
  }, [articulo])
  const total = (rows ?? []).reduce((a, r) => a + r.stock, 0)
  return (
    <Modal title={`Stock de ${articulo} ${descripcion}`} onClose={onClose} width={520}>
      <div className="flex flex-col gap-1.5">
        <table className="gw-grid">
          <thead>
            <tr>
              <th>Almacén</th>
              <th>Descripción</th>
              <th className="text-right!">Stock</th>
              <th className="text-right!">Reservado</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.almacen}>
                <td>{r.almacen}</td>
                <td>{r.nombre}</td>
                <td className="text-right">{formatGw(r.stock, 3)}</td>
                <td className="text-right">{formatGw(r.reservado, 3)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={2} className="font-bold">
                Total
              </td>
              <td className="text-right font-bold">{formatGw(total, 3)}</td>
              <td />
            </tr>
          </tbody>
        </table>
        <div className="flex justify-end">
          <button type="button" className="gw-btn" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </Modal>
  )
}

/** Botón «Tarifa»: elige la tarifa con la que se calcula el precio de la línea. */
export function TarifaDialog({ actual, onPick, onClose }: { actual: number; onPick: (nivel: number) => void; onClose: () => void }) {
  return (
    <Modal title="Tarifa de la línea" onClose={onClose} width={320}>
      <div className="flex flex-col gap-1">
        {NIVELES.map((n, i) => (
          <button
            key={n}
            type="button"
            className={`gw-btn justify-start ${i === actual ? 'border-[var(--gw-select)] bg-[#e5f1fb] font-bold' : ''}`}
            onClick={() => onPick(i)}
          >
            {i} · {n}
          </button>
        ))}
      </div>
    </Modal>
  )
}

/** Aviso al vender a un cliente (mensaje de la ficha del cliente). */
export function AvisoDialog({ titulo, texto, onClose }: { titulo: string; texto: string; onClose: () => void }) {
  return (
    <Modal title={titulo} onClose={onClose} width={480}>
      <div className="flex flex-col gap-2 p-2">
        <p className="whitespace-pre-wrap text-[16px] text-[#1a3fd0]">{texto}</p>
        <div className="flex justify-end">
          <button type="button" autoFocus className="gw-btn" onClick={onClose}>
            Aceptar
          </button>
        </div>
      </div>
    </Modal>
  )
}

const NOMBRE_TIPO_FACTURA: Record<string, string> = {
  F1: 'F1 · Factura completa',
  F2: 'F2 · Factura simplificada (ticket)',
  F3: 'F3 · Factura en sustitución de simplificadas',
  R1: 'R1 · Rectificativa (art. 80.1, 80.2 y error fundado)',
  R5: 'R5 · Rectificativa de factura simplificada',
}

/** Datos VeriFactu de la venta: QR, tipo, huella y estado del envío. */
export function VerifactuDialog({ verifactu, onClose }: { verifactu: VerifactuVenta; onClose: () => void }) {
  const a = verifactu.alta
  if (!a) return null
  const fila = 'grid grid-cols-[150px_1fr] gap-2 text-[14px]'
  return (
    <Modal title={`VeriFactu · ${a.num_serie_factura}`} onClose={onClose} width={640}>
      <div className="flex gap-4 p-2">
        {a.codigo_qr_contenido && <BloqueVerifactu contenido={a.codigo_qr_contenido} tamano="150px" />}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className={fila}>
            <span className="text-[#555]">Nº serie factura</span>
            <span className="font-mono">{a.num_serie_factura}</span>
          </div>
          <div className={fila}>
            <span className="text-[#555]">Tipo</span>
            <span>{NOMBRE_TIPO_FACTURA[a.tipo_factura ?? ''] ?? a.tipo_factura}</span>
          </div>
          {a.rectificada_num_serie && (
            <div className={fila}>
              <span className="text-[#555]">Rectifica a</span>
              <span className="font-mono">{a.rectificada_num_serie}</span>
            </div>
          )}
          <div className={fila}>
            <span className="text-[#555]">Emisor</span>
            <span className="font-mono">{a.id_emisor}</span>
          </div>
          <div className={fila}>
            <span className="text-[#555]">Cuota / Importe</span>
            <span>
              {formatGw(Number(a.cuota_total), 2)} / {formatGw(Number(a.importe_total), 2)} €
            </span>
          </div>
          <div className={fila}>
            <span className="text-[#555]">Generado</span>
            <span className="font-mono">{a.fecha_hora_huso_texto}</span>
          </div>
          <div className={fila}>
            <span className="text-[#555]">Huella</span>
            <span className="break-all font-mono text-[12px]">{a.huella}</span>
          </div>
          <div className={fila}>
            <span className="text-[#555]">Huella anterior</span>
            <span className="break-all font-mono text-[12px]">{a.huella_anterior ?? '(primer registro)'}</span>
          </div>
          <div className={fila}>
            <span className="text-[#555]">Envío AEAT</span>
            <span>{a.estado_envio_aeat}</span>
          </div>
          {verifactu.anulacion && (
            <p className="text-[14px] font-bold text-[#d01c1c]">
              ANULADA el {new Date(verifactu.anulacion.creado_en).toLocaleString('es-ES')}
              {verifactu.anulacion.motivo ? ` — ${verifactu.anulacion.motivo}` : ''}
            </p>
          )}
          <div className="mt-1 flex justify-end">
            <button type="button" autoFocus className="gw-btn" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

/** Confirmación de «Eliminar» una venta emitida: no se borra, se anula (registro VeriFactu de anulación). */
export function AnularVentaDialog({ venta, onOk, onCancel }: { venta: string; onOk: (motivo: string) => void; onCancel: () => void }) {
  const [motivo, setMotivo] = useState('')
  return (
    <Modal title={`Anular la venta ${venta}`} onClose={onCancel} width={560}>
      <div className="flex flex-col gap-2 p-2 text-[15px]">
        <p>
          La venta está emitida (VeriFactu): <b>no se borra</b>. Se genera un <b>registro de anulación</b> encadenado, la venta queda
          marcada como anulada y se devuelve el stock al almacén.
        </p>
        <p className="text-[#d01c1c]">
          Anular es solo para documentos expedidos por error. Si la venta fue real y hay que corregirla o devolver, usa «Rectificar».
          Los cobros y la caja no se tocan.
        </p>
        <label className="flex flex-col gap-0.5">
          <span>Motivo</span>
          <input className="gw-input" autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="gw-btn" disabled={!motivo.trim()} onClick={() => onOk(motivo.trim())}>
            Anular venta
          </button>
          <button type="button" className="gw-btn" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </Modal>
  )
}
