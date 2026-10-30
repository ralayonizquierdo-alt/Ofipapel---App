import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

interface AuthState {
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  // Entradas, salidas y contraseñas incorrectas quedan en la auditoría (fn_registrar_acceso).
  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) void supabase.rpc('fn_registrar_acceso', { p_tipo: 'FALLO_CLAVE', p_tienda: null, p_usuario: email })
    else void supabase.rpc('fn_registrar_acceso', { p_tipo: 'ENTRADA', p_tienda: null, p_usuario: email })
    return { error: error?.message ?? null }
  }

  async function signOut() {
    await supabase.rpc('fn_registrar_acceso', { p_tipo: 'SALIDA', p_tienda: null, p_usuario: null })
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
