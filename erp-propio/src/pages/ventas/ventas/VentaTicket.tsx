import { BloqueVerifactu } from '../../../components/VerifactuQr'
import { formatGw } from '../../../components/gw'
import { subtotalLinea, type CabeceraVenta, type LineaVenta, type VerifactuVenta } from './ventaModel'
import { decimalesPrecio } from '../../../lib/parametros'

export interface EmpresaTicket {
  nombre: string
  cif: string | null
  direccion: string | null
  poblacion: string | null
}

const TITULO: Record<string, string> = {
  F1: 'FACTURA',
  F2: 'FACTURA SIMPLIFICADA',
  R1: 'FACTURA RECTIFICATIVA',
  R5: 'FACTURA RECTIFICATIVA (SIMPLIFICADA)',
}

/**
 * Ticket / factura impresa (80 mm). Solo aparece al imprimir (clase .solo-impresion, ver index.css):
 * F2 o «Imprimir» sacan esto y no la pantalla. Lleva el QR y la leyenda VeriFactu cuando la venta
 * está emitida; si no, avisa de que no es un documento fiscal.
 */
export function VentaTicket({
  empresa,
  cab,
  lineas,
  pie,
  verifactu,
}: {
  empresa: EmpresaTicket | null
  cab: CabeceraVenta
  lineas: LineaVenta[]
  pie: { base: number; igic: number; total: number }
  verifactu: VerifactuVenta | null
}) {
  const alta = verifactu?.alta ?? null
  const utiles = lineas.filter((l) => l.articulo_codigo || l.descripcion.trim())
  return (
    <div className="solo-impresion font-mono text-[11px] leading-tight">
      <div className="text-center">
        <div className="text-[13px] font-bold">{empresa?.nombre ?? ''}</div>
        {empresa?.cif && <div>NIF {empresa.cif}</div>}
        {empresa?.direccion && <div>{empresa.direccion}</div>}
        {empresa?.poblacion && <div>{empresa.poblacion}</div>}
      </div>
      <div className="my-1 border-t border-dashed border-black" />
      <div className="text-center font-bold">{alta ? (TITULO[alta.tipo_factura ?? ''] ?? 'FACTURA') : 'DOCUMENTO NO EMITIDO'}</div>
      <div>Nº {alta?.num_serie_factura ?? (cab.numero != null ? `${cab.tienda}-${cab.numero}` : '')}</div>
      <div>
        Fecha {cab.fecha ? new Date(`${cab.fecha}T00:00:00`).toLocaleDateString('es-ES') : ''} {cab.hora}
      </div>
      {alta?.rectificada_num_serie && <div>Rectifica a la factura Nº {alta.rectificada_num_serie}</div>}
      {cab.cliente_nif ? (
        <div>
          Cliente: {cab.cliente_nombre} · NIF {cab.cliente_nif}
        </div>
      ) : null}
      {verifactu?.anulacion && <div className="text-center text-[14px] font-bold">*** ANULADA ***</div>}
      <div className="my-1 border-t border-dashed border-black" />
      {utiles.map((l) => (
        <div key={l.key}>
          <div className="truncate">{l.descripcion}</div>
          <div className="flex justify-between">
            <span>
              {formatGw(l.cantidad, 2)} x {formatGw(l.precio, decimalesPrecio())}
              {l.descuento_pct ? ` -${formatGw(l.descuento_pct, 2)}%` : ''}
            </span>
            <span>{formatGw(subtotalLinea(l), 2)}</span>
          </div>
        </div>
      ))}
      <div className="my-1 border-t border-dashed border-black" />
      <div className="flex justify-between">
        <span>Base imponible</span>
        <span>{formatGw(pie.base, 2)}</span>
      </div>
      <div className="flex justify-between">
        <span>IGIC</span>
        <span>{formatGw(pie.igic, 2)}</span>
      </div>
      <div className="flex justify-between text-[14px] font-bold">
        <span>TOTAL</span>
        <span>{formatGw(pie.total, 2)} €</span>
      </div>
      <div className="my-1 border-t border-dashed border-black" />
      {alta?.codigo_qr_contenido ? (
        <div className="flex justify-center pt-1">
          <BloqueVerifactu contenido={alta.codigo_qr_contenido} tamano="32mm" />
        </div>
      ) : (
        <div className="text-center">Documento sin valor fiscal (venta no emitida).</div>
      )}
    </div>
  )
}
