import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { useAuth } from './AuthContext'
import { opcionPermitida, rutaPermitida } from './permisos'
import type { MenuItem } from '../components/shell/menus'

interface PermisosState {
  /** Todavía cargando los permisos del empleado conectado. */
  cargando: boolean
  /** Grupo administrador: lo puede todo. */
  admin: boolean
  codigos: ReadonlySet<string>
  /** ¿Puede abrir esta ruta? (bloqueo de URL, QuickBar, Panel, NEXA). */
  puedeRuta: (ruta: string) => boolean
  /** ¿Puede usar esta opción de menú? */
  puedeOpcion: (i: MenuItem) => boolean
  /** ¿Tiene este permiso concreto? (acciones como «accion:generar-peticion»). */
  tiene: (codigo: string) => boolean
  recargar: () => void
}

const PermisosContext = createContext<PermisosState | null>(null)
const VACIO: ReadonlySet<string> = new Set()

/**
 * Carga al iniciar sesión los permisos del empleado conectado (fn_mis_permisos, por su
 * auth_user_id) y si su grupo es administrador. Sin empleado o sin grupo: ningún permiso, solo
 * lo libre (Panel de Control y Cambiar Contraseña). Si la carga falla, también ninguno.
 */
export function PermisosProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const uid = session?.user.id ?? null
  const [estado, setEstado] = useState<{ uid: string | null; admin: boolean; codigos: ReadonlySet<string> } | null>(null)
  const [vuelta, setVuelta] = useState(0)

  useEffect(() => {
    if (!uid) return
    let vivo = true
    Promise.all([supabase.rpc('fn_mis_permisos'), supabase.rpc('fn_es_administrador')]).then(([p, a]) => {
      if (!vivo) return
      const codigos = new Set(((p.data ?? []) as unknown[]).map((x) => (typeof x === 'string' ? x : String((x as Record<string, unknown>).fn_mis_permisos ?? ''))))
      setEstado({ uid, admin: !a.error && a.data === true, codigos: p.error ? VACIO : codigos })
    })
    return () => {
      vivo = false
    }
  }, [uid, vuelta])

  const cargando = !estado || estado.uid !== uid
  const admin = !cargando && estado.admin
  const codigos = cargando ? VACIO : estado.codigos
  const recargar = useCallback(() => setVuelta((v) => v + 1), [])

  const valor = useMemo<PermisosState>(
    () => ({
      cargando,
      admin,
      codigos,
      puedeRuta: (ruta) => rutaPermitida(ruta, codigos, admin),
      puedeOpcion: (i) => opcionPermitida(i, codigos, admin),
      tiene: (c) => admin || codigos.has(c),
      recargar,
    }),
    [cargando, admin, codigos, recargar],
  )
  return <PermisosContext.Provider value={valor}>{children}</PermisosContext.Provider>
}

export function usePermisos() {
  const ctx = useContext(PermisosContext)
  if (!ctx) throw new Error('usePermisos debe usarse dentro de PermisosProvider')
  return ctx
}

/** Pantalla en lugar de la ventana cuando no hay permiso (se entró escribiendo la URL). */
export function SinPermiso() {
  return (
    <div className="flex h-full min-h-[200px] items-center justify-center p-6">
      <div className="flex max-w-[460px] flex-col gap-2 border border-[var(--gw-border)] bg-white px-5 py-4 text-[13px] shadow-[2px_2px_4px_rgba(0,0,0,0.2)]">
        <b className="text-[14px] text-[#b02a2a]">No tienes permiso para esta opción</b>
        <span>Tu grupo de acceso no tiene marcada esta pantalla. Si la necesitas, pídeselo a un administrador (Archivo → Grupos de Acceso).</span>
      </div>
    </div>
  )
}
