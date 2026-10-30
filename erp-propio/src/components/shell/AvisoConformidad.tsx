import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

// Aviso legal al entrar (Luis, 30/10/2026). «Ahora no» queda registrado como denegado. Mientras el empleado no haya dado su conformidad a la
// versión vigente del texto legal de la auditoría (Archivo → Textos legales → Documentos,
// «requiere conformidad»), le sale al entrar. «Doy mi conformidad» la registra con día y hora
// (fn_dar_conformidad). Si el texto cambia, sale otra vez.
// Sin conformidad no puede modificar nada (la base de datos lo impide: fn_auditoria_trigger), salvo
// que un super administrador le deje (Archivo → Textos legales → Por empleado). «Ahora no» cierra el aviso y deja
// una franja roja «Solo consulta» que lo vuelve a abrir; los botones de alta, modificar y borrar se
// apagan (clase gw-sin-conformidad, index.css). Los super administradores ven quién la ha dado.

interface Pendiente {
  id: number
  titulo: string
  contenido: string | null
  version: string
  bloquea: boolean
}

const CLAVE_AHORA_NO = 'erp.conformidad.ahoraNo'

/** `uid`: usuario conectado; al cambiar de empleado se vuelve a mirar. */
export function AvisoConformidad({ uid }: { uid: string | null }) {
  const [pendientes, setPendientes] = useState<Pendiente[]>([])
  const [abierto, setAbierto] = useState(false)
  const [leido, setLeido] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPendientes([])
    if (!uid) return
    let ahoraNo = false
    try {
      ahoraNo = sessionStorage.getItem(`${CLAVE_AHORA_NO}.${uid}`) != null
    } catch {
      /* sin almacenamiento: se enseña */
    }
    supabase.rpc('fn_conformidad_pendiente').then(({ data }) => {
      setPendientes((data as Pendiente[]) ?? [])
      setAbierto(!ahoraNo)
    })
  }, [uid])

  const doc = pendientes[0]
  const bloqueado = pendientes.some((p) => p.bloquea)
  useEffect(() => {
    document.body.classList.toggle('gw-sin-conformidad', bloqueado)
    return () => document.body.classList.remove('gw-sin-conformidad')
  }, [bloqueado])

  if (!doc) return null

  const aceptar = async () => {
    setGuardando(true)
    setError(null)
    const { error: e } = await supabase.rpc('fn_dar_conformidad', { p_documento: doc.id, p_version: doc.version })
    setGuardando(false)
    if (e) return setError(e.message)
    setLeido(false)
    setPendientes((p) => p.slice(1))
  }
  const ahoraNo = () => {
    // Queda como «denegado» en Archivo → Textos legales (con día y hora).
    for (const p of pendientes) void supabase.rpc('fn_denegar_conformidad', { p_documento: p.id, p_version: p.version })
    try {
      sessionStorage.setItem(`${CLAVE_AHORA_NO}.${uid}`, '1')
    } catch {
      /* solo hasta recargar */
    }
    setAbierto(false)
  }

  if (!abierto)
    return bloqueado ? (
      <button
        type="button"
        className="fixed left-1/2 top-[2px] z-[250] -translate-x-1/2 border border-[#8c1d12] bg-[#c42b1c] px-3 py-[2px] text-[13px] font-bold text-white shadow"
        onClick={() => setAbierto(true)}
        title="Pulsa para leer el aviso y dar tu conformidad"
      >
        🔒 Solo consulta: falta tu conformidad al aviso legal · Leer y aceptar
      </button>
    ) : null

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[92vh] w-[760px] max-w-full flex-col border border-[var(--gw-border)] bg-[var(--gw-face)] shadow-xl">
        <div className="bg-[#1d3a8a] px-3 py-1.5 font-bold text-white">Aviso legal · {doc.titulo}</div>
        <pre className="m-2 flex-1 overflow-auto whitespace-pre-wrap border border-[var(--gw-border)] bg-white p-3 font-[inherit] text-[13px] leading-[19px]">
          {doc.contenido}
        </pre>
        <label className="mx-2 flex items-center gap-2 text-[14px]">
          <input type="checkbox" checked={leido} onChange={(e) => setLeido(e.target.checked)} />
          He leído esta información y doy mi conformidad.
        </label>
        {doc.bloquea && (
          <div className="mx-2 mt-1 text-[12px] font-bold text-[#c42b1c]">
            Mientras no des tu conformidad, solo podrás consultar: no podrás modificar nada en el programa.
          </div>
        )}
        {error && <div className="mx-2 font-bold text-[#c42b1c]">{error}</div>}
        <div className="flex justify-end gap-2 p-2">
          <button type="button" className="gw-btn" onClick={ahoraNo} title="Puedes leerlo después pulsando la franja roja de arriba">
            Ahora no
          </button>
          <button type="button" className="gw-btn h-[30px] font-bold" disabled={!leido || guardando} onClick={() => void aceptar()}>
            {guardando ? 'Registrando…' : '✔ Doy mi conformidad'}
          </button>
        </div>
      </div>
    </div>
  )
}
