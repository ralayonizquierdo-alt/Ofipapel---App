// ¿Ha fichado hoy el repartidor? Se mira en Fichaje (fichaje.html, Firebase «ofipapel-fichaje»), con su misma clave
// pública y una sesión anónima, igual que hace Fichaje en la portada. Solo lee los fichajes de hoy.
// La regla (Rober, 03/11/2026): sin fichar la entrada no se puede entregar; ver, comprobar u ordenar la ruta, sí.

const CFG = { apiKey: 'AIzaSyCZ7cBQXZkw-VB0vnJE4m8lj3mscyiIMEc', projectId: 'ofipapel-fichaje-63ced' }
const K_ANON = 'reparto.fichaje.anon'
const K_ULTIMO = 'reparto.fichaje.ultimo'

export type EstadoFichaje = 'trabajando' | 'pausa' | 'sin_fichar' | 'salida'

interface Anon {
  idToken: string
  refreshToken: string
  expiresAt: number
}

const leer = <T>(k: string): T | null => {
  try {
    const v = localStorage.getItem(k)
    return v ? (JSON.parse(v) as T) : null
  } catch {
    return null
  }
}
const guardar = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* sin almacenamiento */
  }
}

export const hoyCanarias = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Atlantic/Canary', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

async function token(): Promise<string> {
  const a = leer<Anon>(K_ANON)
  if (a && Date.now() < a.expiresAt - 5 * 60_000) return a.idToken
  if (a?.refreshToken) {
    const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${CFG.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(a.refreshToken)}`,
    })
    if (r.ok) {
      const j = await r.json()
      const s = { idToken: j.id_token, refreshToken: j.refresh_token, expiresAt: Date.now() + Number(j.expires_in) * 1000 }
      guardar(K_ANON, s)
      return s.idToken
    }
  }
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${CFG.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j?.error?.message ?? 'No se pudo conectar con Fichaje')
  const s = { idToken: j.idToken, refreshToken: j.refreshToken, expiresAt: Date.now() + Number(j.expiresIn) * 1000 }
  guardar(K_ANON, s)
  return s.idToken
}

/** Estado de hoy según el último fichaje de la persona (como hace Fichaje para decidir qué botones enseña). */
export async function estadoFichaje(persona: string): Promise<EstadoFichaje> {
  const t = await token()
  const hoy = hoyCanarias()
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'ofipapel_fichaje_eventos' }],
      where: { fieldFilter: { field: { fieldPath: 'dateKey' }, op: 'EQUAL', value: { stringValue: hoy } } },
      limit: 3000,
    },
  }
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${CFG.projectId}/databases/(default)/documents:runQuery?key=${CFG.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error('No se pudo leer Fichaje')
  const filas = (await r.json()) as { document?: { fields: Record<string, { stringValue?: string }> } }[]
  const mios = filas
    .filter((f) => f.document && f.document.fields.personId?.stringValue === persona)
    .map((f) => ({ tipo: f.document!.fields.type?.stringValue ?? '', en: f.document!.fields.occurredAt?.stringValue ?? '' }))
    .sort((a, b) => a.en.localeCompare(b.en))
  const ultimo = mios[mios.length - 1]
  const estado: EstadoFichaje = !ultimo ? 'sin_fichar' : ultimo.tipo === 'salida' ? 'salida' : ultimo.tipo === 'pausa_inicio' ? 'pausa' : 'trabajando'
  guardar(K_ULTIMO, { persona, dia: hoy, estado })
  return estado
}

/** Último estado comprobado hoy (para seguir sin cobertura si ya había fichado). */
export function estadoGuardado(persona: string): EstadoFichaje | null {
  const u = leer<{ persona: string; dia: string; estado: EstadoFichaje }>(K_ULTIMO)
  return u && u.persona === persona && u.dia === hoyCanarias() ? u.estado : null
}
