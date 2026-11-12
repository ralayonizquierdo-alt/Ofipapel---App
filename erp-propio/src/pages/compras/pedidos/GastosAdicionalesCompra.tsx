import { useEffect, useRef, useState, type ReactNode } from 'react'
import { GwInput, GwLookupButton, GwNumber, GwSelect, GwWindow, formatGw } from '../../../components/gw'
import { GwSalir } from '../../../components/gw/GwIconos'
import { GwLookupDialog, type GwLookupColumn } from '../../../components/gw/GwLookupDialog'
import { r2, totalesGastos, type ConceptoGasto, type GastoCompra } from './compras'

// Ventana «Gastos adicionales - Compras» de GeminisWin (botón «Otros gastos adicionales» del pie de
// la compra): tres bloques «Documento y/o Concepto» con su nº de factura, importe, IGIC, total y
// cuentas contables. Los totales pasan a la fila «Otros gastos adicionales» del pie. Las cuentas
// contables se guardan como dato: NO generan asientos.

const LOOKUP_CONCEPTO: GwLookupColumn[] = [
  { key: 'codigo', label: 'Código', width: 90 },
  { key: 'descripcion', label: 'Descripción' },
]
const LOOKUP_FORMA_PAGO: GwLookupColumn[] = [
  { key: 'codigo', label: 'Código', width: 90 },
  { key: 'descripcion', label: 'Descripción' },
]

// Columnas de la derecha: Nº Factura · Importe · IGIC · Total · Partida · Contra Part.
const COLUMNAS = 'grid grid-cols-[minmax(0,4.3fr)_minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,0.65fr)_minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-1.5'

export function GastosAdicionalesCompra({
  gastos,
  conceptos,
  formasPago,
  importeBloqueado,
  onChange,
  onCerrar,
}: {
  gastos: GastoCompra[]
  conceptos: ConceptoGasto[]
  formasPago: { codigo: string; nombre: string }[]
  /** Compra ya Actualizada: el gasto ya se repartió en los costes, los importes no se cambian. */
  importeBloqueado: boolean
  onChange: (bloque: number, cambios: Partial<GastoCompra>) => void
  onCerrar: () => void
}) {
  const [buscar, setBuscar] = useState<null | { bloque: number; que: 'concepto' | 'forma_pago' }>(null)
  const tot = totalesGastos(gastos)
  const buscando = useRef(false)
  useEffect(() => {
    buscando.current = !!buscar
  })

  // Cerrar confirma primero el número que se esté tecleando (los importes se aceptan al salir del campo).
  const cerrar = () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    window.setTimeout(onCerrar, 0)
  }
  const cerrarRef = useRef(cerrar)
  useEffect(() => {
    cerrarRef.current = cerrar
  })

  // «Pulse F4 para cerrar la ventana».
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F4' || e.altKey || e.ctrlKey || buscando.current) return
      e.preventDefault()
      e.stopPropagation()
      cerrarRef.current()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  function elegirConcepto(bloque: number, id: number | null) {
    const c = conceptos.find((x) => x.id === id)
    // Al elegir concepto, su descripción y sus cuentas (si las tiene) pasan al bloque.
    onChange(bloque, {
      concepto_id: c?.id ?? null,
      descripcion: c?.descripcion ?? null,
      ...(c?.cuenta_partida ? { cuenta_partida: c.cuenta_partida } : {}),
      ...(c?.cuenta_contrapartida ? { cuenta_contrapartida: c.cuenta_contrapartida } : {}),
    })
  }

  const avisoBloqueo = importeBloqueado ? 'La compra ya está Actualizada: el gasto ya se repartió en el coste de los artículos y su importe no se cambia.' : undefined

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-[150px]">
      <GwWindow title="Gastos adicionales - Compras" onClose={cerrar} className="w-[1240px] max-w-[98vw]">
        <div className="flex flex-col [&_.gw-input]:h-[27px] [&_.gw-input]:text-[16px]" data-gastos-adicionales>
          <div className="flex flex-col gap-[6px] px-2 pb-1 pt-2 text-[17px]">
            <div className={`${COLUMNAS} items-end leading-[19px]`}>
              <span>Descripción Conceptos</span>
              <span>Nº Factura</span>
              <span className="pr-4 text-right">Importe</span>
              <span className="pl-4">IGIC</span>
              <span className="pr-4 text-right">Total</span>
              <span className="col-span-2 text-center">Cuentas Contables</span>
            </div>
            {gastos.map((g, i) => {
              const bloque = i + 1
              return (
                <div key={bloque} className={`${COLUMNAS} items-start`}>
                  <fieldset className="gw-group flex flex-col gap-[5px] !pt-0">
                    <legend className="!text-[17px]">Documento y/o Concepto</legend>
                    <div className="flex gap-1">
                      <GwSelect
                        className="!w-[156px] shrink-0"
                        title="Concepto del gasto"
                        value={g.concepto_id ?? ''}
                        onChange={(e) => elegirConcepto(bloque, e.target.value ? Number(e.target.value) : null)}
                      >
                        <option value="" />
                        {conceptos.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.codigo ? `${c.codigo}  ${c.descripcion}` : c.descripcion}
                          </option>
                        ))}
                      </GwSelect>
                      <GwInput title="Descripción del documento o concepto" value={g.descripcion ?? ''} onChange={(e) => onChange(bloque, { descripcion: e.target.value || null })} />
                      <GwLookupButton onClick={() => setBuscar({ bloque, que: 'concepto' })} title="Buscar concepto" />
                    </div>
                    <div className="flex items-center gap-1">
                      <label className="flex w-[272px] shrink-0 items-center gap-1 text-[17px]">
                        <input type="checkbox" checked={g.pagado} onChange={(e) => onChange(bloque, { pagado: e.target.checked })} />
                        <span>
                          <u>P</u>agado. Forma de Pago:
                        </span>
                      </label>
                      <GwSelect title="Forma de pago del gasto" value={g.forma_pago_codigo ?? ''} onChange={(e) => onChange(bloque, { forma_pago_codigo: e.target.value || null })}>
                        <option value="" />
                        {formasPago.map((f) => (
                          <option key={f.codigo} value={f.codigo}>
                            {f.nombre}
                          </option>
                        ))}
                      </GwSelect>
                      <GwLookupButton onClick={() => setBuscar({ bloque, que: 'forma_pago' })} title="Buscar forma de pago" />
                    </div>
                  </fieldset>
                  {/* Los campos de la derecha van a la altura de la primera fila del bloque. */}
                  <Derecha primera={i === 0}>
                    <GwInput title="Nº de factura del gasto" value={g.numero_factura ?? ''} onChange={(e) => onChange(bloque, { numero_factura: e.target.value || null })} />
                  </Derecha>
                  <Derecha primera={i === 0}>
                    <span title={avisoBloqueo}>
                      <GwNumber decimals={2} disabled={importeBloqueado} value={g.importe || null} onChange={(v) => onChange(bloque, { importe: v ?? 0 })} />
                    </span>
                  </Derecha>
                  <Derecha primera={i === 0}>
                    <span title={avisoBloqueo ?? 'Importe de IGIC del documento'}>
                      <GwNumber decimals={2} disabled={importeBloqueado} value={g.igic || null} onChange={(v) => onChange(bloque, { igic: v ?? 0 })} />
                    </span>
                  </Derecha>
                  <Derecha primera={i === 0}>
                    <GwNumber decimals={2} value={g.importe || g.igic ? r2((g.importe || 0) + (g.igic || 0)) : null} />
                  </Derecha>
                  <Derecha primera={i === 0} rotulo="Partida">
                    <GwInput title="Cuenta contable de partida (solo se guarda: no genera asientos)" value={g.cuenta_partida ?? ''} onChange={(e) => onChange(bloque, { cuenta_partida: e.target.value || null })} />
                  </Derecha>
                  <Derecha primera={i === 0} rotulo="Contra Part.">
                    <GwInput
                      title="Cuenta contable de contrapartida (solo se guarda: no genera asientos)"
                      value={g.cuenta_contrapartida ?? ''}
                      onChange={(e) => onChange(bloque, { cuenta_contrapartida: e.target.value || null })}
                    />
                    <GwInput disabled className="mt-[5px]" value="" readOnly />
                  </Derecha>
                </div>
              )
            })}
            {/* Totales: importe, IGIC y total de los tres bloques */}
            <div className={`${COLUMNAS} items-end font-bold`}>
              <span />
              <span />
              <span className="pr-2 text-right" title="Total importe">
                {formatGw(tot.importe, 2)}
              </span>
              <span className="-translate-y-[10px] pr-2 text-right" title="Total IGIC">
                {formatGw(tot.igic, 2)}
              </span>
              <span className="pr-2 text-right" title="Total de los gastos adicionales">
                {formatGw(tot.total, 2)}
              </span>
              <span />
              <span />
            </div>
          </div>
          <div className="flex items-end justify-between border-t border-[var(--gw-border)] px-2 pb-1.5 pt-3">
            <span className="text-[17px]">Pulse F4 para cerrar la ventana</span>
            <button type="button" className="gw-btn !h-[38px] w-[160px] gap-1 !text-[18px]" onClick={cerrar}>
              <GwSalir />
              <span>
                <u>C</u>errar
              </span>
            </button>
          </div>
        </div>
      </GwWindow>

      {buscar?.que === 'concepto' && (
        <GwLookupDialog
          title="Conceptos de gastos adicionales"
          table="concepto_gasto_compra"
          columns={LOOKUP_CONCEPTO}
          searchColumns={['codigo', 'descripcion']}
          orderBy="descripcion"
          keyColumn="descripcion"
          onClose={() => setBuscar(null)}
          onPick={(r) => {
            const b = buscar.bloque
            setBuscar(null)
            elegirConcepto(b, conceptos.find((c) => c.descripcion === String(r.descripcion))?.id ?? null)
          }}
        />
      )}
      {buscar?.que === 'forma_pago' && (
        <GwLookupDialog
          title="Formas de pago"
          table="forma_pago"
          columns={LOOKUP_FORMA_PAGO}
          searchColumns={['codigo', 'descripcion']}
          orderBy="descripcion"
          keyColumn="codigo"
          onClose={() => setBuscar(null)}
          onPick={(r) => {
            const b = buscar.bloque
            setBuscar(null)
            onChange(b, { forma_pago_codigo: String(r.codigo) })
          }}
        />
      )}
    </div>
  )
}

/** Celda de la derecha: baja lo que ocupa la leyenda del bloque; en el primero cabe el rótulo de la cuenta. */
function Derecha({ primera, rotulo, children }: { primera: boolean; rotulo?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="h-[21px] text-center text-[17px] leading-[19px]">{primera ? rotulo : ''}</span>
      {children}
    </div>
  )
}
