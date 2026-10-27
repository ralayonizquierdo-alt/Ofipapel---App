import { createPortal } from 'react-dom'
import { BloqueVerifactu } from '../../components/VerifactuQr'
import { formatGw } from '../../components/gw'
import {
  TITULO_TIPO,
  fechaEs,
  n,
  numSerie,
  type AlbaranFactura,
  type CobroFactura,
  type FacturaCliente,
  type LineaAlbaran,
  type RegistroVf,
  type Tramo,
} from './facturaModel'

export interface EmpresaFactura {
  nombre: string
  cif: string | null
  direccion: string | null
  codigo_postal: string | null
  poblacion: string | null
  telefono_fijo: string | null
  email: string | null
}

export interface ClienteFactura {
  codigo: string
  nombre: string
  razon_social: string | null
  nif: string | null
  direccion: string | null
  codigo_postal: string | null
  poblacion: string | null
}

/**
 * Factura impresa en A4 (solo sale al imprimir: clase .solo-impresion, ver index.css). Lleva los
 * albaranes con sus líneas, el desglose por tipo de IGIC, los vencimientos y el bloque VeriFactu
 * (QR + leyenda). Si la factura está anulada sale la marca «ANULADA».
 */
export function FacturaImpresa({
  empresa,
  cliente,
  factura,
  albaranes,
  lineas,
  tramos,
  cobros,
  alta,
  anulacion,
  formaPago,
  rectificada,
}: {
  empresa: EmpresaFactura | null
  cliente: ClienteFactura | null
  factura: FacturaCliente
  albaranes: AlbaranFactura[]
  lineas: LineaAlbaran[]
  tramos: Tramo[]
  cobros: CobroFactura[]
  alta: RegistroVf | null
  anulacion: RegistroVf | null
  formaPago: string
  rectificada: string | null
}) {
  const f = factura
  const vencimientos = cobros.filter((c) => c.fecha_vencimiento)
  // En un portal sobre <body>: la ventana MDI tiene overflow oculto y recortaría las páginas.
  return createPortal(
    <div className="solo-impresion text-[10.5pt] leading-snug text-black" style={{ width: '190mm', padding: '6mm 8mm' }}>
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="text-[15pt] font-bold">{empresa?.nombre ?? ''}</div>
          {empresa?.cif && <div>NIF {empresa.cif}</div>}
          {empresa?.direccion && <div>{empresa.direccion}</div>}
          {(empresa?.codigo_postal || empresa?.poblacion) && <div>{[empresa?.codigo_postal, empresa?.poblacion].filter(Boolean).join(' ')}</div>}
          {empresa?.telefono_fijo && <div>Tel. {empresa.telefono_fijo}</div>}
        </div>
        <div className="text-right">
          <div className="text-[16pt] font-bold">{TITULO_TIPO[f.tipo_factura] ?? 'FACTURA'}</div>
          <div>
            Nº <b>{alta?.num_serie_factura ?? numSerie(f)}</b>
          </div>
          <div>Fecha de expedición: {fechaEs(f.fecha_factura)}</div>
          {f.fecha_desde && (
            <div>
              Periodo: {fechaEs(f.fecha_desde)} — {fechaEs(f.fecha_hasta)}
            </div>
          )}
          {rectificada && <div>Rectifica a la factura Nº {rectificada}</div>}
        </div>
      </div>

      <div className="mt-4 border border-black p-2">
        <div className="text-[9pt] uppercase">Cliente ({f.cliente_codigo})</div>
        <div className="font-bold">{f.nombre_cliente ?? cliente?.razon_social ?? cliente?.nombre ?? ''}</div>
        {(f.nif_cliente ?? cliente?.nif) && <div>NIF {f.nif_cliente ?? cliente?.nif}</div>}
        {cliente?.direccion && <div>{cliente.direccion}</div>}
        {(cliente?.codigo_postal || cliente?.poblacion) && <div>{[cliente?.codigo_postal, cliente?.poblacion].filter(Boolean).join(' ')}</div>}
      </div>

      {anulacion && <div className="my-3 border-4 border-black py-1 text-center text-[20pt] font-bold tracking-widest">ANULADA</div>}

      <table className="mt-4 w-full border-collapse text-[9.5pt]">
        <thead>
          <tr className="border-y border-black">
            <th className="py-1 text-left">Código</th>
            <th className="text-left">Descripción</th>
            <th className="text-right">Cant.</th>
            <th className="text-right">Precio</th>
            <th className="text-right">Dto.%</th>
            <th className="text-right">IGIC%</th>
            <th className="text-right">Importe</th>
          </tr>
        </thead>
        <tbody>
          {albaranes.map((a) => {
            const ls = lineas.filter((l) => l.tienda_terminal_codigo === a.tienda_terminal_codigo && Number(l.numero) === a.numero)
            return [
              <tr key={`a${a.tienda_terminal_codigo}-${a.numero}`}>
                <td colSpan={7} className="pt-2 font-bold">
                  Albarán {a.tienda_terminal_codigo}-{a.numero} de {fechaEs(a.fecha)}
                  {a.total_descuento_pie ? ` · Dto. pie ${formatGw(a.total_descuento_pie, 2)}` : ''}
                </td>
              </tr>,
              ...ls.map((l) => (
                <tr key={`l${l.tienda_terminal_codigo}-${l.numero}-${l.numero_linea}`}>
                  <td className="pr-2 align-top">{l.articulo_codigo ?? ''}</td>
                  <td className="pr-2 align-top">{l.descripcion ?? ''}</td>
                  <td className="text-right align-top">{formatGw(n(l.cantidad), 2)}</td>
                  <td className="text-right align-top">{formatGw(n(l.precio), 3)}</td>
                  <td className="text-right align-top">{l.descuento_pct ? formatGw(n(l.descuento_pct), 2) : ''}</td>
                  <td className="text-right align-top">{formatGw(n(l.igic_pct), 1)}</td>
                  <td className="text-right align-top">{formatGw(n(l.subtotal), 2)}</td>
                </tr>
              )),
            ]
          })}
        </tbody>
      </table>

      <div className="mt-4 flex items-start justify-between gap-6" style={{ breakInside: 'avoid' }}>
        <div className="flex-1">
          <table className="w-full border-collapse text-[9.5pt]">
            <thead>
              <tr className="border-y border-black">
                <th className="py-1 text-left">Tipo IGIC</th>
                <th className="text-right">Base imponible</th>
                <th className="text-right">Cuota IGIC</th>
              </tr>
            </thead>
            <tbody>
              {tramos.map((t) => (
                <tr key={t.tramo}>
                  <td>{formatGw(n(t.tipo_pct), 1)} %</td>
                  <td className="text-right">{formatGw(n(t.base_imponible), 2)}</td>
                  <td className="text-right">{formatGw(n(t.cuota_igic), 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3">Forma de pago: {f.forma_pago_codigo ? `${f.forma_pago_codigo} ${formaPago}` : ''}</div>
          {vencimientos.length > 0 && (
            <div>
              Vencimientos:{' '}
              {vencimientos.map((c) => `${fechaEs(c.fecha_vencimiento)} ${formatGw(n(c.cuota), 2)} €`).join(' · ')}
            </div>
          )}
          {f.observaciones && <div className="mt-2 whitespace-pre-wrap">{f.observaciones}</div>}
        </div>
        <div className="w-[70mm]">
          <div className="flex justify-between">
            <span>Base imponible</span>
            <span>{formatGw(n(f.total_base), 2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Total IGIC</span>
            <span>{formatGw(n(f.total_igic), 2)}</span>
          </div>
          {n(f.total_retencion) !== 0 && (
            <div className="flex justify-between">
              <span>Retención</span>
              <span>-{formatGw(n(f.total_retencion), 2)}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t-2 border-black pt-1 text-[13pt] font-bold">
            <span>TOTAL</span>
            <span>{formatGw(n(f.total), 2)} €</span>
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-center" style={{ breakInside: 'avoid' }}>
        {alta?.codigo_qr_contenido ? (
          <BloqueVerifactu contenido={alta.codigo_qr_contenido} numSerie={alta.num_serie_factura} tamano="35mm" />
        ) : (
          <div>Factura sin registro VeriFactu.</div>
        )}
      </div>
    </div>,
    document.body,
  )
}
