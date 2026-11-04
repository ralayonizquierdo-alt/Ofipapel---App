import { useEffect, useState, type ReactNode } from 'react'
import { Check, HelpCircle, X } from 'lucide-react'
import { GwInput, GwLookupButton, GwNumber, GwSelect, GwWindow, formatGw } from '../../components/gw'
import { GwOperativa } from '../../components/gw/GwOperativa'
import { GwVentanaFlotante } from '../../components/gw/GwVentanaFlotante'
import { fechaHoraGw, r3, type CajaApertura, type TotalesCaja } from './cajaModel'

// Caja → Cierre de Caja, calcada de la ventana «Cierre de Caja» de GeminisWin (captura ZIP 7, 04/11/2026):
// cabecera azul con la identificación del ejercicio abierto, empleado y fecha/hora del cierre,
// «Procesar Cierre», resumen azul de totales, fila Fondo Apertura · Total Efectivo · Total Arqueo ·
// Efectivo a Retirar · Fondo al Cierre, «Documentos a Imprimir despues del Cierre» y Aceptar/Cancelar.
// Aceptar cierra la caja con fn_caja_cerrar (empleado = el que ha entrado, fecha = la del servidor).

export type DocumentosCierre = { caja: boolean; articulo: boolean; familia: boolean; ventas: boolean }

const CLAVE_DOCS = 'caja.cierre.documentos'
const DOCS_DEFECTO: DocumentosCierre = { caja: true, articulo: false, familia: false, ventas: false }

function leerDocs(): DocumentosCierre {
  try {
    const v = localStorage.getItem(CLAVE_DOCS)
    return v ? { ...DOCS_DEFECTO, ...(JSON.parse(v) as Partial<DocumentosCierre>) } : DOCS_DEFECTO
  } catch {
    return DOCS_DEFECTO
  }
}

function guardarDocs(d: DocumentosCierre) {
  try {
    localStorage.setItem(CLAVE_DOCS, JSON.stringify(d))
  } catch {
    // Sin almacenamiento del navegador: se queda solo para esta vez.
  }
}

const AZUL = 'text-center text-[24px] leading-[31px] text-[#1a1adb]'
const ETQ = 'text-[19px] leading-[22px] whitespace-nowrap'

function Caja5({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className={ETQ}>{label}</span>
      {children}
    </div>
  )
}

/** Botón conmutador ✓/× de GeminisWin, con el texto en dos líneas si no cabe. */
function Marca({ on, onChange, children, className = '' }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" className={`gw-btn !h-[62px] !justify-start !gap-1 !px-1.5 text-left !text-[20px] !leading-[23px] ${className}`} aria-pressed={on} onClick={() => onChange(!on)}>
      {on ? <Check size={16} strokeWidth={3} className="flex-none text-[#127a12]" /> : <X size={16} strokeWidth={3} className="flex-none text-[#c42b1c]" />}
      <span className="whitespace-normal">{children}</span>
    </button>
  )
}

export function CierreCajaDialog({
  caja,
  tot,
  empleado,
  nombreEmpleado,
  fondoPropuesto,
  guardando,
  onAceptar,
  onCancelar,
}: {
  caja: CajaApertura
  tot: TotalesCaja
  empleado: string | null
  nombreEmpleado: string
  fondoPropuesto: number
  guardando: boolean
  onAceptar: (arqueo: number, fondoCierre: number, docs: DocumentosCierre) => void
  onCancelar: () => void
}) {
  const [ahora, setAhora] = useState(() => new Date())
  const [procesar, setProcesar] = useState(false)
  const [arqueo, setArqueo] = useState<number | null>(r3(tot.efectivo_teorico))
  const [fondo, setFondo] = useState<number | null>(fondoPropuesto)
  const [docs, setDocs] = useState<DocumentosCierre>(leerDocs)
  const [predeterminar, setPredeterminar] = useState(false)
  const [ayuda, setAyuda] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onCancelar()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onCancelar])

  // Sin «Procesar Cierre» no se teclea el arqueo: se toma el efectivo que debe haber en el cajón.
  const vArqueo = procesar ? Number(arqueo ?? 0) : r3(tot.efectivo_teorico)
  const vFondo = Number(fondo ?? 0)
  const retirar = r3(vArqueo - vFondo)
  const sobrante = r3(vArqueo - tot.efectivo_teorico)
  const efectivoNeto = r3(tot.ing_efectivo - tot.gas_efectivo)
  const ingresos = tot.ing_total
  const gastos = tot.gas_total
  const f3 = (v: number) => formatGw(v, 3)

  function aceptar() {
    if (predeterminar) guardarDocs(docs)
    onAceptar(vArqueo, vFondo, docs)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-14">
      <GwWindow title="Cierre de Caja" onClose={onCancelar} className="w-[1100px] max-w-[96vw]">
        <div className="flex flex-col gap-1.5 text-[19px]">
          {/* Identificación del Ejercicio Abierto */}
          <div className="h-[158px] overflow-y-auto border border-[var(--gw-border)] bg-[var(--gw-face)] px-2 py-1">
            <p className={AZUL}>Identificación del Ejercicio Abierto:</p>
            <p className={AZUL}>
              Tienda: {caja.tienda_terminal_codigo}&nbsp;&nbsp;&nbsp;Número: {caja.ejercicio}
            </p>
            <p className={AZUL}>Empleado que efectuó la Apertura de Caja: {caja.empleado_apertura_codigo ?? ''}</p>
            <p className={AZUL}>Fecha y hora de la Apertura: {fechaHoraGw(caja.fecha_apertura)}</p>
            <p className={AZUL}>Fecha y hora del Cierre de Caja: {fechaHoraGw(ahora.toISOString())}</p>
          </div>

          {/* Empleado · Fecha y hora del Cierre · Procesar Cierre */}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,370px)_220px] items-end gap-x-3">
            <div className="flex min-w-0 flex-col">
              <span className={ETQ}>Empleado que efectúa el Cierre:</span>
              <span className="flex">
                <GwSelect className="!h-[34px] !text-[20px]" value={empleado ?? ''} disabled title="Cierra la caja el empleado que ha entrado en el programa. Para cerrar con otro empleado, que entre él (Archivo → Cambiar de usuario).">
                  <option value={empleado ?? ''}>{nombreEmpleado || empleado || ''}</option>
                </GwSelect>
                <GwLookupButton disabled title="Cierra la caja el empleado que ha entrado en el programa" />
              </span>
            </div>
            <div className="flex min-w-0 flex-col">
              <span className={ETQ}>Fecha y hora del Cierre:</span>
              <span className="flex">
                <GwInput className="!h-[34px] !text-[20px]" readOnly value={fechaHoraGw(ahora.toISOString())} title="La fecha y hora del cierre son las del momento de pulsar Aceptar (las pone el servidor)" />
                <GwLookupButton disabled title="La fecha y hora del cierre son las del momento de pulsar Aceptar" />
              </span>
            </div>
            <button
              type="button"
              className="gw-btn !h-[62px] !gap-1 !text-[20px]"
              aria-pressed={procesar}
              title="Marcado: cuentas el efectivo del cajón y tecleas el Total Arqueo y el Fondo al Cierre. Sin marcar: el arqueo es el efectivo que debe haber."
              onClick={() => setProcesar((p) => !p)}
            >
              {procesar ? <Check size={16} strokeWidth={3} className="text-[#127a12]" /> : <X size={16} strokeWidth={3} className="text-[#c42b1c]" />}
              Procesar Cierre
            </button>
          </div>

          {/* Resumen */}
          <div className="h-[158px] overflow-y-auto border border-[var(--gw-border)] bg-[var(--gw-face)] px-2 py-1">
            <p className={AZUL}>
              Bancos: {f3(r3(tot.ing_bancos - tot.gas_bancos))} Efectos: {f3(r3(tot.ing_efectos - tot.gas_efectos))} Credito: {f3(r3(tot.ing_credito - tot.gas_credito))} Contado:{' '}
              {f3(r3(tot.ing_contado - tot.gas_contado))}
            </p>
            <p className={AZUL}>
              Total Ejercicio: {f3(r3(ingresos - gastos))} Ingresos: {f3(ingresos)} Gastos: {f3(gastos)}
            </p>
            <p className={AZUL}>
              Efectivo: {f3(efectivoNeto)} Cheques: {f3(r3(tot.ing_cheque - tot.gas_cheque))} Tarjetas: {f3(r3(tot.ing_tarjeta - tot.gas_tarjeta))}
            </p>
            <p className={AZUL}>
              Fondo Apertura: {f3(tot.fondo_inicial)} Total Caja: {f3(r3(tot.efectivo_teorico))}
            </p>
            <p className={`${AZUL} ${sobrante ? '!text-[#c42b1c]' : ''}`}>
              Arqueo: {f3(vArqueo)} Sobrante: {f3(sobrante)}
            </p>
          </div>

          {/* Fondo Apertura · Total Efectivo · Total Arqueo · Efectivo a Retirar · Fondo al Cierre */}
          <div className="grid grid-cols-5 gap-x-1.5">
            <Caja5 label="Fondo Apertura">
              <GwNumber className="!h-[34px] !text-[20px]" value={tot.fondo_inicial} decimals={3} emptyAsZero disabled />
            </Caja5>
            <Caja5 label="Total Efectivo">
              <GwNumber className="!h-[34px] !text-[20px]" value={efectivoNeto} decimals={3} emptyAsZero disabled />
            </Caja5>
            <Caja5 label="Total Arqueo">
              <span title={procesar ? 'Efectivo contado en el cajón' : 'Marca «Procesar Cierre» para teclear el efectivo contado'}>
                <GwNumber className="!h-[34px] !text-[20px]" value={vArqueo} decimals={3} emptyAsZero disabled={!procesar} onChange={setArqueo} />
              </span>
            </Caja5>
            <Caja5 label="Efectivo a Retirar">
              <span title={procesar ? 'Lo que se saca del cajón: arqueo − fondo al cierre' : 'Marca «Procesar Cierre» para cambiarlo'}>
                <GwNumber className="!h-[34px] !text-[20px]" value={retirar} decimals={3} emptyAsZero disabled={!procesar} onChange={(v) => setFondo(r3(vArqueo - Number(v ?? 0)))} />
              </span>
            </Caja5>
            <Caja5 label="Fondo al Cierre">
              <span title={procesar ? 'Lo que se deja en el cajón para la próxima apertura' : 'Marca «Procesar Cierre» para cambiarlo'}>
                <GwNumber className="!h-[34px] !text-[20px]" value={vFondo} decimals={3} emptyAsZero disabled={!procesar} onChange={setFondo} />
              </span>
            </Caja5>
          </div>

          {/* Documentos a Imprimir despues del Cierre */}
          <fieldset className="border border-[var(--gw-border-light)] px-1.5 pb-1.5 pt-0">
            <legend className="px-1 text-[21px]">Documentos a Imprimir despues del Cierre</legend>
            <div className="grid grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,0.9fr)] gap-x-0.5">
              <Marca on={docs.caja} onChange={(v) => setDocs({ ...docs, caja: v })}>
                Listado de Caja
              </Marca>
              <Marca on={docs.articulo} onChange={(v) => setDocs({ ...docs, articulo: v })}>
                List. ventas por Artículo
              </Marca>
              <Marca on={docs.familia} onChange={(v) => setDocs({ ...docs, familia: v })}>
                List. ventas por Familia
              </Marca>
              <Marca on={docs.ventas} onChange={(v) => setDocs({ ...docs, ventas: v })}>
                Listado de Ventas
              </Marca>
              <span />
              <Marca className="col-span-4 mt-0.5 !h-[44px] !justify-center" on={predeterminar} onChange={setPredeterminar}>
                Guardar éstos valores como predeterminados
              </Marca>
            </div>
          </fieldset>

          <div className="flex items-center justify-between gap-2 border-t border-[var(--gw-border-light)] pt-1.5">
            <button type="button" className="gw-btn !h-[40px] gap-1 !text-[16px]" onClick={() => setAyuda(true)} title="Cómo se usa esta ventana">
              <HelpCircle size={16} /> Operativa
            </button>
            <span className="flex gap-1.5">
              <button type="button" className="gw-btn !h-[50px] w-[200px] gap-1 !text-[22px]" disabled={guardando} onClick={aceptar}>
                <Check size={18} strokeWidth={3} className="text-[#127a12]" />
                <span>
                  <u>A</u>ceptar
                </span>
              </button>
              <button type="button" className="gw-btn !h-[50px] w-[200px] gap-1 !text-[22px]" onClick={onCancelar}>
                <X size={18} strokeWidth={3} className="text-[#c42b1c]" />
                <span>
                  <u>C</u>ancelar
                </span>
              </button>
            </span>
          </div>
        </div>
      </GwWindow>
      {ayuda && (
        <GwVentanaFlotante titulo="Operativa — Cierre de Caja" onCerrar={() => setAyuda(false)} ancho={560}>
          <OperativaCierre />
        </GwVentanaFlotante>
      )}
    </div>
  )
}

export function OperativaCierre() {
  return (
    <GwOperativa
      bloques={[
        {
          titulo: 'Cerrar la caja',
          pasos: [
            'Caja → Cierre de Caja (Ctrl+F6). Arriba sale la caja abierta de tu tienda: número, quién la abrió y cuándo.',
            'Comprueba el resumen azul: bancos, efectos, crédito, contado, efectivo, cheques y tarjetas del ejercicio.',
            'Cuenta el dinero del cajón. Si coincide con el «Total Caja», pulsa Aceptar directamente.',
            'Si no coincide, marca «Procesar Cierre» y teclea el Total Arqueo (lo contado) y el Fondo al Cierre (lo que dejas para mañana). El Efectivo a Retirar se calcula solo, y si lo cambias se ajusta el fondo.',
            'Marca los documentos que quieres sacar después del cierre y pulsa Aceptar.',
          ],
        },
        {
          titulo: 'A tener en cuenta',
          notas: [
            'Cierra la caja el empleado que ha entrado en el programa, con la fecha y hora del momento de Aceptar.',
            'Sobrante = arqueo − (fondo de apertura + efectivo del ejercicio). Si sale distinto de 0 se ve en rojo.',
            '«Guardar éstos valores como predeterminados» recuerda en este ordenador qué documentos marcar la próxima vez.',
            'Una caja cerrada ya no admite movimientos: para seguir vendiendo, abre otra en Caja → Apertura de Caja.',
          ],
        },
      ]}
    />
  )
}
