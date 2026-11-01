// Reglas de una clave segura (Luis, 01/11/2026). Las mismas comprueba el servidor en
// supabase/functions/clave-recuperar: si se cambian aquí, cambiarlas también allí.

const COMUNES = ['12345678', '123456789', 'password', 'contraseña', 'ofipapel', 'qwerty123', 'abc12345', '11111111', 'avatar123']

export const REGLAS_CLAVE = 'Al menos 8 caracteres, con letras y números, sin tu nombre de usuario y que no sea fácil de adivinar.'

/** Motivo por el que la clave no vale, o null si vale. */
export function fallosClave(clave: string, usuario: string): string | null {
  if (clave.length < 8) return 'La clave tiene que tener al menos 8 caracteres.'
  if (clave.length > 72) return 'La clave es demasiado larga (máximo 72 caracteres).'
  if (!/[a-zñ]/i.test(clave) || !/\d/.test(clave)) return 'La clave tiene que llevar letras y números.'
  const c = clave.toLowerCase()
  const u = usuario.toLowerCase().replace(/@ofipapel\.local$/, '')
  if (u.length >= 3 && c.includes(u)) return 'La clave no puede llevar dentro tu nombre de usuario.'
  if (COMUNES.some((x) => c.includes(x))) return 'Esa clave es demasiado fácil de adivinar.'
  return null
}

/** Usuario escrito en la pantalla de entrada → correo interno (luis → luis@ofipapel.local). */
export const correoDeUsuario = (u: string) => {
  const s = u.trim().toLowerCase()
  return s.includes('@') ? s : `${s}@ofipapel.local`
}
