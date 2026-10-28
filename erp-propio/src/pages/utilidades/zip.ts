// ZIP mínimo para la Copia de Seguridad, sin dependencias: escribe con «deflate» (CompressionStream
// del navegador; si no lo hay, sin comprimir) y lee ZIP con entradas guardadas (0) o deflate (8).
// Sin ZIP64: de sobra para las tablas del ERP (cada fichero < 4 GB, < 65535 ficheros).

const enc = new TextEncoder()

let tablaCrc: Uint32Array | null = null
function crc32(datos: Uint8Array): number {
  if (!tablaCrc) {
    tablaCrc = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      tablaCrc[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (let i = 0; i < datos.length; i++) crc = tablaCrc[(crc ^ datos[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

async function porStream(datos: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const salida = new Blob([datos as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(salida).arrayBuffer())
}

function fechaDos(d: Date) {
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)
  const fecha = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { hora, fecha }
}

export interface FicheroZip {
  nombre: string
  contenido: string | Uint8Array
}

/** Construye un ZIP con los ficheros dados. */
export async function crearZip(ficheros: FicheroZip[], fecha = new Date()): Promise<Blob> {
  const deflate = typeof CompressionStream !== 'undefined'
  const { hora, fecha: dia } = fechaDos(fecha)
  const partes: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const f of ficheros) {
    const nombre = enc.encode(f.nombre)
    const datos = typeof f.contenido === 'string' ? enc.encode(f.contenido) : f.contenido
    const crc = crc32(datos)
    const comp = deflate ? await porStream(datos, new CompressionStream('deflate-raw')) : datos
    const metodo = deflate ? 8 : 0

    const local = new Uint8Array(30 + nombre.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, 0x0800, true) // nombres en UTF-8
    lv.setUint16(8, metodo, true)
    lv.setUint16(10, hora, true)
    lv.setUint16(12, dia, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, comp.length, true)
    lv.setUint32(22, datos.length, true)
    lv.setUint16(26, nombre.length, true)
    local.set(nombre, 30)
    partes.push(local, comp)

    const cen = new Uint8Array(46 + nombre.length)
    const cv = new DataView(cen.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, metodo, true)
    cv.setUint16(12, hora, true)
    cv.setUint16(14, dia, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, comp.length, true)
    cv.setUint32(24, datos.length, true)
    cv.setUint16(28, nombre.length, true)
    cv.setUint32(42, offset, true)
    cen.set(nombre, 46)
    central.push(cen)
    offset += local.length + comp.length
  }
  const tamCentral = central.reduce((s, c) => s + c.length, 0)
  const fin = new Uint8Array(22)
  const fv = new DataView(fin.buffer)
  fv.setUint32(0, 0x06054b50, true)
  fv.setUint16(8, ficheros.length, true)
  fv.setUint16(10, ficheros.length, true)
  fv.setUint32(12, tamCentral, true)
  fv.setUint32(16, offset, true)
  return new Blob([...partes, ...central, fin] as BlobPart[], { type: 'application/zip' })
}

export interface EntradaZip {
  nombre: string
  tamano: number
  /** Lee el contenido descomprimido y comprueba el CRC. */
  leer: () => Promise<Uint8Array>
}

/** Lee el directorio central de un ZIP. Lanza un error si no es un ZIP válido. */
export function leerZip(buf: ArrayBuffer): EntradaZip[] {
  const v = new DataView(buf)
  const bytes = new Uint8Array(buf)
  let fin = -1
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 22 - 65535); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      fin = i
      break
    }
  }
  if (fin < 0) throw new Error('No es un fichero ZIP (no se encuentra el directorio)')
  const total = v.getUint16(fin + 10, true)
  let p = v.getUint32(fin + 16, true)
  const dec = new TextDecoder()
  const entradas: EntradaZip[] = []
  for (let n = 0; n < total; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('Directorio del ZIP dañado')
    const metodo = v.getUint16(p + 10, true)
    const crc = v.getUint32(p + 16, true)
    const tamComp = v.getUint32(p + 20, true)
    const tamano = v.getUint32(p + 24, true)
    const lNombre = v.getUint16(p + 28, true)
    const lExtra = v.getUint16(p + 30, true)
    const lComent = v.getUint16(p + 32, true)
    const offLocal = v.getUint32(p + 42, true)
    const nombre = dec.decode(bytes.subarray(p + 46, p + 46 + lNombre))
    p += 46 + lNombre + lExtra + lComent
    entradas.push({
      nombre,
      tamano,
      leer: async () => {
        if (v.getUint32(offLocal, true) !== 0x04034b50) throw new Error(`${nombre}: cabecera dañada`)
        const ini = offLocal + 30 + v.getUint16(offLocal + 26, true) + v.getUint16(offLocal + 28, true)
        const comp = bytes.subarray(ini, ini + tamComp)
        let datos: Uint8Array
        if (metodo === 0) datos = comp
        else if (metodo === 8) datos = await porStream(comp, new DecompressionStream('deflate-raw'))
        else throw new Error(`${nombre}: método de compresión ${metodo} no admitido`)
        if (crc32(datos) !== crc) throw new Error(`${nombre}: el CRC no coincide (fichero dañado)`)
        return datos
      },
    })
  }
  return entradas
}
