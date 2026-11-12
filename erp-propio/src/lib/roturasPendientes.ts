// Roturas registradas SIN COBERTURA (Rober, 11/11/2026): en el almacén a veces no hay señal, así que
// la rotura y sus fotos se guardan en el propio móvil (IndexedDB) y se envían solas cuando vuelve la
// conexión. Cada rotura lleva una «clave_cliente»: si el envío se repite, el servidor no la duplica.
// Límite honesto: esto guarda lo que se registra con la pantalla YA ABIERTA; el ERP no se puede abrir
// desde cero sin conexión (eso es la tarea 33, modo sin conexión).

import { crearRotura, subirDocumentoRotura, type NuevaRotura } from './roturas'

const BD = 'erp-roturas'
const ALMACEN = 'pendientes'

export interface RoturaPendiente {
  clave: string
  datos: NuevaRotura
  /** Texto que se enseña en la lista de pendientes (artículo y cantidad). */
  resumen: string
  fotos: File[]
  guardada_en: string
  /** Último error del servidor al intentar enviarla (p. ej. el artículo no existe). */
  error?: string
  /** Ya creada en el servidor: solo faltan fotos por subir. */
  expediente_id?: number
  numero?: string
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, mal) => {
    const p = indexedDB.open(BD, 1)
    p.onupgradeneeded = () => p.result.createObjectStore(ALMACEN, { keyPath: 'clave' })
    p.onsuccess = () => ok(p.result)
    p.onerror = () => mal(p.error ?? new Error('No se puede usar el almacenamiento del navegador.'))
  })
}

function operar<T>(modo: IDBTransactionMode, hacer: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return abrir().then(
    (bd) =>
      new Promise<T>((ok, mal) => {
        const t = bd.transaction(ALMACEN, modo)
        const r = hacer(t.objectStore(ALMACEN))
        r.onsuccess = () => ok(r.result)
        r.onerror = () => mal(r.error ?? new Error('Error del almacenamiento del navegador.'))
        t.oncomplete = () => bd.close()
      }),
  )
}

export const pendientesRotura = () => operar<RoturaPendiente[]>('readonly', (s) => s.getAll() as IDBRequest<RoturaPendiente[]>)
export const guardarPendienteRotura = (p: RoturaPendiente) => operar('readwrite', (s) => s.put(p))
export const quitarPendienteRotura = (clave: string) => operar('readwrite', (s) => s.delete(clave))

/** ¿El fallo es de conexión (se reintenta) o del servidor (hay que corregir algo)? */
export const esFalloDeRed = (e: unknown) =>
  !navigator.onLine || /failed to fetch|networkerror|load failed|network request failed|fetch/i.test(e instanceof Error ? e.message : String(e))

/**
 * Envía una rotura: la crea y sube sus fotos. Si se corta a medias, lo que falte queda guardado.
 * Devuelve el número de expediente.
 */
export async function enviarRotura(p: RoturaPendiente): Promise<string> {
  let pendiente = p
  if (!pendiente.expediente_id) {
    const r = await crearRotura({ ...pendiente.datos, clave_cliente: pendiente.clave })
    pendiente = { ...pendiente, expediente_id: r.id, numero: r.numero, error: undefined }
    if (pendiente.fotos.length) await guardarPendienteRotura(pendiente)
  }
  while (pendiente.fotos.length) {
    await subirDocumentoRotura(pendiente.expediente_id!, pendiente.fotos[0], 'FOTO')
    pendiente = { ...pendiente, fotos: pendiente.fotos.slice(1) }
    if (pendiente.fotos.length) await guardarPendienteRotura(pendiente)
  }
  await quitarPendienteRotura(pendiente.clave)
  return pendiente.numero!
}

/** Intenta enviar todo lo pendiente. Devuelve cuántas se enviaron y cuántas siguen guardadas. */
export async function sincronizarRoturas(): Promise<{ enviadas: string[]; quedan: number }> {
  const enviadas: string[] = []
  for (const p of await pendientesRotura()) {
    try {
      enviadas.push(await enviarRotura(p))
    } catch (e) {
      if (esFalloDeRed(e)) break // sigue sin conexión: ya se reintentará
      await guardarPendienteRotura({ ...((await pendientesRotura()).find((x) => x.clave === p.clave) ?? p), error: e instanceof Error ? e.message : String(e) })
    }
  }
  return { enviadas, quedan: (await pendientesRotura()).length }
}
