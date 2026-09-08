/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseKey)

// ─── Por qué esto ya no abre una sesión anónima ─────────────────────────────
//
// Antes la app llamaba a `signInAnonymously()` al arrancar. Las políticas RLS
// exigen `authenticated`, así que sobre el papel parecía protegido — pero una
// sesión anónima la crea CUALQUIERA con la clave pública que va dentro del
// bundle, y este bundle es público. Comprobado en vivo el 2026-09-08: con una
// sesión anónima recién creada se leen enteras las 7 tablas (agenda, turnos de
// hospital, coisinhas, tareas de empresa, música, Limón).
//
// O sea que "exigir sesión" no exigía nada: la puerta pedía una llave que
// regalaba el propio portero. Es el mismo malentendido que hubo en Firebase.
//
// La solución no es meter una contraseña en el código —sería igual de pública—
// sino que la persona la escriba UNA VEZ en cada dispositivo. A partir de ahí
// supabase-js guarda la sesión en el navegador y la renueva sola, así que no
// vuelve a pedirla. El PIN de PinScreen sigue siendo lo que bloquea la
// pantalla en el día a día; esto es otra cosa, es lo que da acceso a los datos.
//
// Con esto ya se puede desactivar "Allow anonymous sign-ins" en Supabase sin
// dejar la app inservible — que es justo el orden que NO se siguió con la
// pantalla de fichar y dejó al personal sin poder fichar (DT-29).

export class SinSesionError extends Error {
  constructor() {
    super('Este dispositivo aún no está conectado a la cuenta.')
    this.name = 'SinSesionError'
  }
}

/**
 * ¿Hay una sesión guardada y válida en este dispositivo?
 *
 * No basta con que exista: los dispositivos que ya venían usando la app
 * tienen guardada una sesión ANÓNIMA de antes de este cambio. Si se diera
 * por buena, esos móviles —que son justo los que hay que migrar— nunca
 * verían la pantalla de conectar, todo parecería correcto, y al desactivar
 * "Allow anonymous sign-ins" se quedarían fuera sin previo aviso. Es la
 * trampa de DT-29 otra vez, pero silenciosa.
 *
 * Así que una sesión anónima se descarta y se cierra, para que el
 * dispositivo pida credenciales igual que uno nuevo.
 */
export async function haySesion(): Promise<boolean> {
  const { data } = await supabase.auth.getSession()
  if (!data.session) return false

  if (data.session.user.is_anonymous) {
    await supabase.auth.signOut()
    return false
  }
  return true
}

/**
 * Se llama al arrancar. Si no hay sesión guardada, lanza `SinSesionError` para
 * que la interfaz pida las credenciales una sola vez. No intenta abrir ninguna
 * sesión por su cuenta: eso era el problema.
 */
export async function ensureSession(): Promise<void> {
  if (!(await haySesion())) throw new SinSesionError()
}

/**
 * Conecta este dispositivo. La sesión queda guardada por supabase-js y se
 * renueva sola, así que sólo hace falta la primera vez.
 */
export async function conectarDispositivo(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  if (error) {
    // El mensaje de Supabase viene en inglés y no distingue entre correo
    // desconocido y contraseña incorrecta (a propósito, para no delatar qué
    // cuentas existen). Se traduce sin añadir información que no da.
    throw new Error(
      error.message.toLowerCase().includes('invalid')
        ? 'Correo o contraseña incorrectos.'
        : 'No se pudo conectar: ' + error.message
    )
  }
}

/** Desconecta este dispositivo. La próxima vez volverá a pedir credenciales. */
export async function desconectarDispositivo(): Promise<void> {
  await supabase.auth.signOut()
}
