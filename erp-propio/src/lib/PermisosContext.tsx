import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { useAuth } from './AuthContext'
import { opcionPermitida, rutaPermitida } from './permisos'
import type { MenuItem } from '../components/shell/menus'

/** Pantallas solo para super administradores, tengan el grupo que tengan (la BD también lo exige). */
const RUTAS_SUPER_ADMIN = ['/archivo/auditoria']

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
  /** Administrador de verdad (aunque esté «viendo como» otro grupo). */
  realAdmin: boolean
  /** Super administrador (empleado.super_administrador): Auditoría, Periodos… */
  superAdmin: boolean
  /** Grupo con el que el administrador está viendo el programa (Archivo → Cambiar Grupo de Acceso). */
  verComo: GrupoVerComo | null
  /** Ver como otro grupo (solo administradores) o volver al propio con null. */
  setVerComo: (g: GrupoVerComo | null) => void
}

export interface GrupoVerComo {
  id: number
  nombre: string
}

const CLAVE_VER_COMO = 'gw-ver-como'
function leerVerComo(): GrupoVerComo | null {
  try {
    const v = sessionStorage.getItem(CLAVE_VER_COMO)
    return v ? (JSON.parse(v) as GrupoVerComo) : null
  } catch {
    return null
  }
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
  const [estado, setEstado] = useState<{ uid: string | null; admin: boolean; superAdmin: boolean; codigos: ReadonlySet<string> } | null>(null)
  const [vuelta, setVuelta] = useState(0)
  // «Ver como» otro grupo (Archivo → Cambiar Grupo de Acceso, Ctrl+O): solo en la interfaz y solo
  // para administradores. Se cargan los permisos de ESE grupo en lugar de los propios; como el
  // administrador ya lo puede todo, nunca da más de lo que tiene. Dura la sesión del navegador.
  const [verComo, setVerComoEstado] = useState<GrupoVerComo | null>(leerVerComo)
  const [comoOtro, setComoOtro] = useState<{ id: number; admin: boolean; codigos: ReadonlySet<string> } | null>(null)

  useEffect(() => {
    if (!uid) return
    let vivo = true
    Promise.all([supabase.rpc('fn_mis_permisos'), supabase.rpc('fn_es_administrador'), supabase.rpc('fn_es_super_administrador')]).then(([p, a, sa]) => {
      if (!vivo) return
      const codigos = new Set(((p.data ?? []) as unknown[]).map((x) => (typeof x === 'string' ? x : String((x as Record<string, unknown>).fn_mis_permisos ?? ''))))
      setEstado({ uid, admin: !a.error && a.data === true, superAdmin: !sa.error && sa.data === true, codigos: p.error ? VACIO : codigos })
    })
    return () => {
      vivo = false
    }
  }, [uid, vuelta])

  const realAdmin = !!estado && estado.uid === uid && estado.admin
  // Super administrador de verdad: no cambia con «Ver como otro grupo».
  const superAdmin = !!estado && estado.uid === uid && estado.superAdmin
  const verComoActivo = realAdmin && verComo ? verComo : null

  useEffect(() => {
    if (!verComoActivo) return
    let vivo = true
    Promise.all([
      supabase.from('rol').select('es_administrador').eq('id', verComoActivo.id).maybeSingle(),
      supabase.from('rol_permiso').select('permiso_codigo').eq('rol_id', verComoActivo.id),
    ]).then(([r, p]) => {
      if (!vivo) return
      setComoOtro({
        id: verComoActivo.id,
        admin: r.data?.es_administrador === true,
        codigos: new Set(((p.data ?? []) as { permiso_codigo: string }[]).map((x) => x.permiso_codigo)),
      })
    })
    return () => {
      vivo = false
    }
  }, [verComoActivo?.id, vuelta]) // eslint-disable-line react-hooks/exhaustive-deps

  const setVerComo = useCallback((g: GrupoVerComo | null) => {
    try {
      if (g) sessionStorage.setItem(CLAVE_VER_COMO, JSON.stringify(g))
      else sessionStorage.removeItem(CLAVE_VER_COMO)
    } catch {
      /* sin almacenamiento: solo dura hasta recargar */
    }
    setComoOtro(null)
    setVerComoEstado(g)
  }, [])

  const otroListo = !!verComoActivo && comoOtro?.id === verComoActivo.id
  const cargando = !estado || estado.uid !== uid || (!!verComoActivo && !otroListo)
  const admin = !cargando && (verComoActivo ? !!comoOtro?.admin : estado.admin)
  const codigos = cargando ? VACIO : verComoActivo ? (comoOtro?.codigos ?? VACIO) : estado.codigos
  const recargar = useCallback(() => setVuelta((v) => v + 1), [])

  const valor = useMemo<PermisosState>(
    () => ({
      cargando,
      admin,
      codigos,
      puedeRuta: (ruta) => (RUTAS_SUPER_ADMIN.some((r) => ruta.startsWith(r)) ? superAdmin : rutaPermitida(ruta, codigos, admin)),
      puedeOpcion: (i) => (i.soloSuperAdmin ? superAdmin : opcionPermitida(i, codigos, admin)),
      tiene: (c) => admin || codigos.has(c),
      recargar,
      realAdmin,
      superAdmin,
      verComo: verComoActivo,
      setVerComo,
    }),
    [cargando, admin, codigos, recargar, realAdmin, superAdmin, verComoActivo, setVerComo],
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
