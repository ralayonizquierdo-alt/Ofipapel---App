import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { LEYENDA_VERIFACTU } from '../lib/verifactu'

/**
 * QR VeriFactu como SVG. La AEAT pide ISO/IEC 18004, corrección de errores nivel M y un tamaño
 * impreso de 30×30 a 40×40 mm; en papel se fija con `mm` (prop `tamano`).
 */
export function VerifactuQr({ contenido, tamano = '32mm' }: { contenido: string; tamano?: string }) {
  const [svg, setSvg] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    QRCode.toString(contenido, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 })
      .then((s) => vivo && setSvg(s))
      .catch(() => vivo && setSvg(null))
    return () => {
      vivo = false
    }
  }, [contenido])
  if (!svg) return null
  return (
    <div
      className="[&>svg]:h-full [&>svg]:w-full"
      style={{ width: tamano, height: tamano }}
      title={contenido}
      // SVG generado localmente por la librería qrcode a partir de la URL de cotejo
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

/** Bloque legal: «VERI*FACTU» + QR + leyenda, tal como va en el ticket o la factura. */
export function BloqueVerifactu({ contenido, numSerie, tamano }: { contenido: string; numSerie?: string; tamano?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <span className="text-[13px] font-bold tracking-wide">VERI*FACTU</span>
      <VerifactuQr contenido={contenido} tamano={tamano} />
      {numSerie && <span className="font-mono text-[11px]">{numSerie}</span>}
      <span className="max-w-[60mm] text-[11px] leading-tight">{LEYENDA_VERIFACTU}</span>
    </div>
  )
}
