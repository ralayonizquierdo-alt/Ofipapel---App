/**
 * Saca el texto de un PDF en el propio navegador.
 *
 * Los justificantes de transferencia llegan en PDF, y copiar su texto a mano
 * desde el móvil es un incordio. La librería se carga solo cuando hace falta
 * (import dinámico): pesa bastante y la mayoría de las veces no se usa.
 */
export async function textoDePdf(fichero: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker

  const doc = await pdfjs.getDocument({ data: new Uint8Array(await fichero.arrayBuffer()) }).promise
  const partes: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const pagina = await doc.getPage(i)
    const contenido = await pagina.getTextContent()
    partes.push(contenido.items.map(it => ('str' in it ? it.str : '')).join(' '))
  }
  return partes.join('\n')
}
