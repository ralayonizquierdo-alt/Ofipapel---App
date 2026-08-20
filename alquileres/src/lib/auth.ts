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
 * Luis y Rober no tienen correo asociado al negocio, así que se usan
 * direcciones internas que nunca se enseñan: el usuario escribe «Luis» o
 * «Rober» y la app compone el correo. No son buzones reales, de modo que la
 * contraseña se restablece desde Firebase Console (Authentication → Usuarios).
 */

export type UsuarioApp = 'Luis' | 'Rober'

export const USUARIOS: UsuarioApp[] = ['Luis', 'Rober']

const DOMINIO_INTERNO = 'alquileres.internal'

export function emailDe(usuario: UsuarioApp): string {
  return `${usuario.toLowerCase()}@${DOMINIO_INTERNO}`
}

export function usuarioDe(user: User | null): UsuarioApp | null {
  const correo = user?.email?.toLowerCase()
  if (!correo) return null
  return USUARIOS.find(u => emailDe(u) === correo) ?? null
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
