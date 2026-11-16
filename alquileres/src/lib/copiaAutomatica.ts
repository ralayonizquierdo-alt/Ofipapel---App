import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { auth, db } from './firebase'
import { usuarioActual } from './auth'
import {
  apuntaCopia, construyeCopia, descargaTexto, DOC_COPIA, enviaCopiaPorCorreo, nombreCopia,
  registrosDe, type DatosCopia, type EstadoCopia,
} from './copia'

/**
 * Hace la copia de seguridad entera: la descarga en este ordenador, la manda
 * por correo y apunta en Firestore cuándo se hizo y cómo fue el correo. La usan
 * el botón de Apartamentos y la copia automática de cada 15 días.
 *
 * Si el correo falla, la copia sigue descargada y se dice por qué.
 */
export async function haceCopia(datos: DatosCopia): Promise<{ nombre: string; correo: string; enviada: boolean }> {
  const nombre = nombreCopia()
  const texto = JSON.stringify(construyeCopia(datos), null, 2)
  descargaTexto(nombre, texto)

  let correo: string
  let enviada = false
  try {
    const token = await auth.currentUser?.getIdToken()
    if (!token) throw new Error('No hay sesión abierta.')
    const para = await enviaCopiaPorCorreo(nombre, texto, registrosDe(datos), token)
    correo = `enviada a ${para}`
    enviada = true
  } catch (e) {
    correo = `no enviada por correo: ${e instanceof Error ? e.message : String(e)}`
  }

  const ultima = new Date().toISOString()
  apuntaCopia(ultima)
  const estado: EstadoCopia = { ultima, por: usuarioActual() ?? '', correo }
  await setDoc(doc(db, DOC_COPIA.coleccion, DOC_COPIA.id), estado).catch(() => { /* sin red: queda en el navegador */ })
  return { nombre, correo, enviada }
}

/** La última copia, compartida. `undefined` mientras llega; `null` si no hay ninguna. */
export function useEstadoCopia(): EstadoCopia | null | undefined {
  const [estado, setEstado] = useState<EstadoCopia | null | undefined>(undefined)
  useEffect(() => onSnapshot(doc(db, DOC_COPIA.coleccion, DOC_COPIA.id),
    s => setEstado(s.exists() ? s.data() as EstadoCopia : null),
    () => setEstado(null)), [])
  return estado
}

/** Los datos de la copia, sacados del contexto de datos de la app. */
export function datosDeCopia(d: DatosCopia): DatosCopia {
  return {
    apartments: d.apartments, prices: d.prices, reservations: d.reservations, payments: d.payments,
    repairs: d.repairs, deletedRepairs: d.deletedRepairs, expenses: d.expenses, offerPrices: d.offerPrices,
    incomes: d.incomes, occupancies: d.occupancies, repairTotals: d.repairTotals, importLogs: d.importLogs,
  }
}
