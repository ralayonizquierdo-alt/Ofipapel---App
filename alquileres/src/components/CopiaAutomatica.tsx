import { useEffect, useRef, useState } from 'react'
import { HardDriveDownload, X } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { DIAS_ENTRE_COPIAS, diasDesde, ultimaCopia } from '../lib/copia'
import { datosDeCopia, haceCopia, useEstadoCopia } from '../lib/copiaAutomatica'

/**
 * La copia de seguridad sola, cada 15 días (Luis, 16/11/2026: «las podemos
 * actualizar automáticamente cada 15 días?» y «me la puedes enviar por correo?»).
 *
 * Al abrir la app, si la última copia (la de Firestore, que vale para todos los
 * ordenadores) tiene 15 días o más, se hace sin pulsar nada: se descarga y se
 * manda por correo. Abajo sale un aviso pequeño con lo que ha pasado, que se
 * quita solo o con la ✕. Una vez por apertura, como mucho.
 */
export default function CopiaAutomatica() {
  const datos = useData()
  const estado = useEstadoCopia()
  const hecha = useRef(false)
  const [aviso, setAviso] = useState<{ texto: string; bien: boolean } | null>(null)

  useEffect(() => {
    // En las pruebas en local no se hace: escribiría la fecha en los datos de
    // verdad y la copia de la app publicada no saldría en 15 días.
    if (import.meta.env.DEV) return
    if (hecha.current || datos.loading || estado === undefined) return
    // Sin datos todavía (primer pintado) no hay nada que copiar.
    if (datos.reservations.length === 0) return
    const ultima = estado?.ultima ?? ultimaCopia()
    const dias = diasDesde(ultima)
    if (dias !== null && dias < DIAS_ENTRE_COPIAS) return
    hecha.current = true
    haceCopia(datosDeCopia(datos)).then(r => {
      setAviso({
        bien: r.enviada,
        texto: r.enviada
          ? `Copia de seguridad guardada en Descargas y ${r.correo}.`
          : `Copia de seguridad guardada en Descargas, pero ${r.correo}`,
      })
    })
  }, [datos, estado])

  useEffect(() => {
    if (!aviso?.bien) return
    const t = setTimeout(() => setAviso(null), 15_000)
    return () => clearTimeout(t)
  }, [aviso])

  if (!aviso) return null
  return (
    <div className={`fixed bottom-4 left-4 z-50 max-w-md flex items-start gap-3 rounded-xl shadow-xl border px-4 py-3 text-sm print:hidden ${
      aviso.bien ? 'bg-green-50 border-green-300 text-green-900' : 'bg-amber-50 border-amber-300 text-amber-900'}`}>
      <HardDriveDownload size={20} className="shrink-0 mt-0.5" />
      <p className="flex-1">{aviso.texto}</p>
      <button onClick={() => setAviso(null)} aria-label="Cerrar" className="shrink-0 opacity-60 hover:opacity-100">
        <X size={16} />
      </button>
    </div>
  )
}
