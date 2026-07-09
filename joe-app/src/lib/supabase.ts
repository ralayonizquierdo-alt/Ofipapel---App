/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseKey)

// La app no tiene pantalla de login. Para que las políticas RLS (que exigen
// role = authenticated) funcionen, abrimos una sesión anónima de Supabase al
// arrancar. Requiere "Allow anonymous sign-ins" activado en el panel de
// Supabase (Authentication > Sign In / Providers).
export async function ensureAnonSession() {
  const { data } = await supabase.auth.getSession()
  if (!data.session) {
    const { error } = await supabase.auth.signInAnonymously()
    if (error) throw error
  }
}
