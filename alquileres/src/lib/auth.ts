import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  type User,
} from 'firebase/auth'
import { auth } from './firebase'

/**
 * Acceso real con Firebase Auth.
 *
 * Antes, la pantalla de login solo comparaba un hash en el navegador: no daba
 * acceso a los datos, solo tapaba la interfaz. Cualquiera podía abrir una
 * sesión anónima con la clave pública del bundle y leer o escribir toda la
 * base de datos sin pasar por la app.
 *
 * El usuario elige su nombre en la pantalla y la app pone el correo que le
 * corresponde (ver CUENTAS más abajo), de modo que nadie tiene que acordarse
 * de ninguna dirección.
 */

export type UsuarioApp = 'Luis' | 'Rober' | 'Mónica' | 'Cande'

/**
 * Qué puede hacer cada uno.
 *
 *   gestion → todo: reservas, cobros, gastos, analítica, cuentas.
 *   gastos  → solo subir el parte de limpieza. Ni ve el dinero ni las reservas.
 *
 * Lo decidió Luis el 24/08/2026: Mónica y Cande entran únicamente para subir
 * ese parte cada semana. Los permisos son por rol y no por persona a propósito:
 * añadir a alguien nuevo no obliga a tocar ninguna pantalla.
 */
export type Rol = 'gestion' | 'gastos'

interface Cuenta { email: string; rol: Rol }

const CUENTAS: Record<UsuarioApp, Cuenta> = {
  // Luis y Rober no tienen correo del negocio: se usan direcciones internas que
  // nunca se enseñan. Al no ser buzones reales, su contraseña solo se puede
  // restablecer desde Firebase Console.
  'Luis':   { email: 'luis@alquileres.internal',  rol: 'gestion' },
  'Rober':  { email: 'rober@alquileres.internal', rol: 'gestion' },
  // Estos dos sí son correos de verdad, así que ellas sí pueden usar el
  // «he olvidado mi contraseña» por email.
  'Mónica': { email: 'conta@ofipapelsl.com',           rol: 'gastos' },
  'Cande':  { email: 'administracion@ofipapelsl.com',  rol: 'gastos' },
}

export const USUARIOS = Object.keys(CUENTAS) as UsuarioApp[]

export function emailDe(usuario: UsuarioApp): string {
  return CUENTAS[usuario].email
}

export function rolDe(usuario: UsuarioApp | null): Rol | null {
  return usuario ? CUENTAS[usuario].rol : null
}

export function usuarioDe(user: User | null): UsuarioApp | null {
  const correo = user?.email?.toLowerCase()
  if (!correo) return null
  return USUARIOS.find(u => emailDe(u).toLowerCase() === correo) ?? null
}

/** Quién tiene la sesión abierta ahora mismo, para dejarlo anotado. */
export function usuarioActual(): UsuarioApp | null {
  return usuarioDe(auth.currentUser)
}

/** ¿La sesión es de una persona, o solo una sesión anónima? */
export function esSesionReal(user: User | null): boolean {
  return !!user && !user.isAnonymous
}

export class ErrorAcceso extends Error {
  codigo: string
  constructor(message: string, codigo: string) {
    super(message)
    this.codigo = codigo
  }
}

/** Traduce los códigos de Firebase a algo que se pueda leer en pantalla. */
function mensajeDe(codigo: string): string {
  switch (codigo) {
    // Con la protección contra enumeración de correos activada, Firebase
    // devuelve lo mismo si la contraseña está mal que si la cuenta no existe.
    // No se puede distinguir, así que el mensaje nombra las dos causas: de otro
    // modo, alguien sin cuenta creada leería «contraseña incorrecta» y estaría
    // probando contraseñas para siempre.
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/invalid-login-credentials':
    case 'auth/user-not-found':
      return 'Contraseña incorrecta, o la cuenta aún no está creada en Firebase (Authentication → Usuarios).'
    case 'auth/too-many-requests':
      return 'Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.'
    case 'auth/network-request-failed':
      return 'Sin conexión. Comprueba la red e inténtalo de nuevo.'
    case 'auth/user-disabled':
      return 'Esta cuenta está desactivada.'
    case 'auth/operation-not-allowed':
      return 'El acceso por contraseña no está activado en Firebase.'
    default:
      return 'No se ha podido entrar. Inténtalo de nuevo.'
  }
}

function codigoDe(err: unknown): string {
  return typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : ''
}

export async function entrar(usuario: UsuarioApp, password: string): Promise<void> {
  try {
    await signInWithEmailAndPassword(auth, emailDe(usuario), password)
  } catch (err) {
    const codigo = codigoDe(err)
    throw new ErrorAcceso(mensajeDe(codigo), codigo)
  }
}

export function salir(): Promise<void> {
  return signOut(auth)
}

/** Avisa de cada cambio de sesión. Devuelve la función para dejar de escuchar. */
export function observarSesion(cb: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, cb)
}

/**
 * Confirma que quien está delante sabe la contraseña, para acciones delicadas
 * como borrar una reparación dejando registro de quién fue.
 */
export async function verificarPassword(password: string): Promise<boolean> {
  const user = auth.currentUser
  if (!user?.email) return false
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password))
    return true
  } catch {
    return false
  }
}

/**
 * Cambia la contraseña del usuario que tiene la sesión abierta. Firebase exige
 * haber entrado hace poco, así que primero se vuelve a validar la actual.
 */
export async function cambiarPassword(actual: string, nueva: string): Promise<void> {
  const user = auth.currentUser
  if (!user?.email) throw new ErrorAcceso('No hay ninguna sesión abierta', 'auth/no-session')
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, actual))
    await updatePassword(user, nueva)
  } catch (err) {
    const codigo = codigoDe(err)
    if (codigo === 'auth/weak-password') {
      throw new ErrorAcceso('La nueva contraseña es demasiado débil (mínimo 6 caracteres)', codigo)
    }
    throw new ErrorAcceso(mensajeDe(codigo), codigo)
  }
}
