/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseKey)

// La app no tiene pantalla de login con usuario real (el PIN de PinScreen.tsx
// solo bloquea la UI). Para que las políticas RLS (que exigen role =
// authenticated) funcionen, abrimos una sesión anónima de Supabase al
// arrancar. Requiere "Allow anonymous sign-ins" activado en Supabase >
// Authentication > Sign In / Providers — hasta que se active en el panel,
// esta llamada falla y se registra en consola, pero no bloquea la app.
export async function ensureAnonSession() {
  const { data } = await supabase.auth.getSession()
  if (!data.session) {
    const { error } = await supabase.auth.signInAnonymously()
    if (error) throw error
  }
}
