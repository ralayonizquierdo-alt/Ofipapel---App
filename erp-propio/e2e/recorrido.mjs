// Robot de pruebas: inicia sesión en el ERP y recorre todas las pantallas (opciones de menú con
// `to` y rutas de App.tsx que no están en el menú). Para cada una apunta errores JS, errores de
// consola, respuestas 4xx/5xx de Supabase (con su cuerpo), si la ventana se pinta (título visible,
// sin pantalla en blanco ni «Cargando…» eterno) y si hay elementos interactivos que se salen de la
// ventana o quedan tapados. Deja un informe Markdown y capturas de las que fallan.
//
// Uso (ver e2e/README.md):
//   ERP_USUARIO=rober ERP_CLAVE=... NODE_PATH=$(npm root -g) node e2e/recorrido.mjs [--puerto=5173] [--ventana=1366x768]
//
// Parámetros (variable de entorno o --argumento):
//   ERP_URL / --url        URL base (por defecto http://localhost:<puerto>)
//   ERP_PUERTO / --puerto  puerto del servidor local (5173)
//   ERP_VENTANA / --ventana  tamaño de la ventana del navegador, «1366x768»
//   ERP_SALIDA / --salida  carpeta del informe (e2e/salida/<fecha>-<usuario>-<ventana>)
//   ERP_SOLO / --solo      expresión regular: solo las rutas que casen
//   ERP_SPKI               pin SPKI del proxy (en la nube), para --ignore-certificate-errors-spki-list
//   ERP_RECARGA=1          recarga la página entera en cada ruta (más lento; por defecto navega dentro de la app)
//   ERP_ESPERA             milisegundos máximos de espera por pantalla (12000)
//   ERP_USUARIO, ERP_CLAVE usuario y contraseña: SOLO por variable de entorno, nunca en el repositorio
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright') // Playwright global: NODE_PATH=$(npm root -g)

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const [k, ...v] = a.slice(2).split('=')
    return [k, v.length ? v.join('=') : '1']
  }),
)
const par = (nombre, env, def) => args[nombre] ?? process.env[env] ?? def

const PUERTO = par('puerto', 'ERP_PUERTO', '5173')
const URL_BASE = par('url', 'ERP_URL', `http://localhost:${PUERTO}`).replace(/\/$/, '')
const [ANCHO, ALTO] = par('ventana', 'ERP_VENTANA', '1366x768').split('x').map(Number)
const USUARIO = process.env.ERP_USUARIO
const CLAVE = process.env.ERP_CLAVE
const SOLO = par('solo', 'ERP_SOLO', '')
const RECARGA = par('recarga', 'ERP_RECARGA', '') === '1'
const ESPERA = Number(par('espera', 'ERP_ESPERA', '12000'))
const SPKI = process.env.ERP_SPKI ?? ''
if (!USUARIO || !CLAVE) {
  console.error('Faltan ERP_USUARIO y ERP_CLAVE (variables de entorno).')
  process.exit(2)
}
const sello = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
const SALIDA = resolve(par('salida', 'ERP_SALIDA', join(RAIZ, 'e2e', 'salida', `${sello}-${USUARIO}-${ANCHO}x${ALTO}`)))
mkdirSync(join(SALIDA, 'capturas'), { recursive: true })

// ---------- 1. Rutas a recorrer ----------
const { MENUS, WINDOW_TITLES } = await import(join(RAIZ, 'src/components/shell/menus.ts'))

const opcionesMenu = []
const recoger = (entradas, camino) => {
  for (const e of entradas) {
    if (e === 'sep') continue
    const c = [...camino, e.label]
    if (e.to) opcionesMenu.push({ ruta: e.to, menu: c.join(' → ') })
    if (e.children) recoger(e.children, c)
  }
}
for (const m of MENUS) recoger(m.items, [m.label])

// Rutas declaradas en App.tsx y en los ficheros de rutas hijas (XxxRoutes) que cuelga de ellas.
const leer = (f) => readFileSync(join(RAIZ, f), 'utf8')
const app = leer('src/App.tsx')
const importes = new Map([...app.matchAll(/import \{ (\w+) \} from '\.\/(pages\/[^']+)'/g)].map((m) => [m[1], m[2]]))
const rutasApp = [] // { patron, comodin }
for (const m of app.matchAll(/<Route path="([^"]+)" element=\{<(\w+)/g)) {
  const [, path, comp] = m
  if (path === '/login') continue
  const comodin = path.endsWith('/*')
  const base = path.replace(/\/\*$/, '')
  rutasApp.push({ patron: base, comodin })
  if (comodin && /Routes$/.test(comp) && importes.has(comp)) {
    const f = `src/${importes.get(comp)}.tsx`
    if (existsSync(join(RAIZ, f))) {
      for (const h of leer(f).matchAll(/<Route (?:path="([^"]+)"|index)/g)) {
        if (!h[1] || h[1] === '*') continue
        rutasApp.push({ patron: `${base}/${h[1].replace(/\/\*$/, '')}`, comodin: h[1].endsWith('/*'), hija: true })
      }
    }
  }
}
// ¿Casa una ruta con alguna de App.tsx? (para detectar menús que llevan a rutas inexistentes)
const casa = (ruta) => {
  const p = ruta.split('?')[0]
  return rutasApp.some(({ patron, comodin }) => {
    const re = new RegExp('^' + patron.replace(/:[^/]+/g, '[^/]+') + (comodin ? '(/.*)?$' : '/?$'))
    return re.test(p)
  })
}

const vistas = new Set()
const rutas = []
for (const o of opcionesMenu) {
  if (vistas.has(o.ruta)) continue
  vistas.add(o.ruta)
  rutas.push({ ...o, origen: 'menú', existe: casa(o.ruta) })
}
for (const r of rutasApp) {
  if (r.patron.includes(':') || r.patron === '' || r.patron === '/') continue
  if ([...vistas].some((v) => v.split('?')[0] === r.patron)) continue
  vistas.add(r.patron)
  rutas.push({ ruta: r.patron, menu: '(fuera del menú)', origen: 'App.tsx', existe: true })
}
const aRecorrer = SOLO ? rutas.filter((r) => new RegExp(SOLO).test(r.ruta)) : rutas
console.log(`${aRecorrer.length} rutas (${opcionesMenu.length} opciones de menú con «to»). Salida: ${SALIDA}`)

// ---------- 2. Navegador ----------
const navegador = await chromium.launch({ args: SPKI ? [`--ignore-certificate-errors-spki-list=${SPKI}`] : [] })
const contexto = await navegador.newContext({ viewport: { width: ANCHO, height: ALTO }, locale: 'es-ES' })
const pagina = await contexto.newPage()

let actual = null // registro de la ruta en curso
let enVuelo = 0
const nuevo = () => ({ js: [], consola: [], red: [] })
const apuntar = (tipo, texto) => {
  if (!actual) return
  const lista = actual[tipo]
  if (!lista.includes(texto) && lista.length < 15) lista.push(texto)
}
pagina.on('pageerror', (e) => apuntar('js', e.message.slice(0, 300)))
pagina.on('console', (m) => {
  if (m.type() !== 'error') return
  const t = m.text()
  if (/Failed to load resource/.test(t)) return // ya sale en «red» con su cuerpo
  apuntar('consola', t.slice(0, 300))
})
pagina.on('dialog', (d) => d.dismiss().catch(() => {}))
const esSupabase = (u) => /supabase\.co|\/rest\/v1\/|\/functions\/v1\/|\/auth\/v1\//.test(u)
pagina.on('request', (r) => { if (esSupabase(r.url())) enVuelo++ })
pagina.on('requestfinished', (r) => { if (esSupabase(r.url())) enVuelo = Math.max(0, enVuelo - 1) })
pagina.on('requestfailed', (r) => {
  if (!esSupabase(r.url())) return
  enVuelo = Math.max(0, enVuelo - 1)
  const f = r.failure()?.errorText ?? ''
  if (!/ERR_ABORTED/.test(f)) apuntar('red', `FALLO ${r.method()} ${recortarUrl(r.url())} ${f}`)
})
pagina.on('response', async (r) => {
  if (r.status() < 400 || !esSupabase(r.url())) return
  let cuerpo = ''
  try { cuerpo = (await r.text()).replace(/\s+/g, ' ').slice(0, 300) } catch { /* sin cuerpo */ }
  apuntar('red', `${r.status()} ${r.request().method()} ${recortarUrl(r.url())} ${cuerpo}`)
})
function recortarUrl(u) {
  try {
    const x = new URL(u)
    const q = decodeURIComponent(x.search).slice(0, 160)
    return x.pathname.replace(/^\/(rest|functions|auth)\/v1\//, '') + q
  } catch { return u.slice(0, 200) }
}

async function calma(maximo = ESPERA) {
  const fin = Date.now() + maximo
  let quieto = 0
  while (Date.now() < fin) {
    await pagina.waitForTimeout(150)
    quieto = enVuelo === 0 ? quieto + 150 : 0
    if (quieto >= 700) return true
  }
  return false
}

// ---------- 3. Inicio de sesión ----------
await pagina.goto(`${URL_BASE}/login`, { waitUntil: 'domcontentloaded' })
await pagina.fill('input[autocomplete=username]', USUARIO)
await pagina.fill('input[type=password]', CLAVE)
await pagina.keyboard.press('Enter')
try {
  await pagina.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15000 })
} catch {
  console.error('No se pudo iniciar sesión (¿usuario o clave?).')
  await pagina.screenshot({ path: join(SALIDA, 'capturas', 'login.png') })
  await navegador.close()
  process.exit(3)
}
await calma()

// ---------- 4. Comprobación de cada pantalla (dentro del navegador) ----------
function inspeccionar() {
  const W = innerWidth
  const H = innerHeight
  const vis = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return false
    const cs = getComputedStyle(el)
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0
  }
  const nombre = (el) => {
    const t = (el.getAttribute('aria-label') || el.title || el.innerText || el.value || el.placeholder || el.name || '').toString().trim().replace(/\s+/g, ' ')
    return `${el.tagName.toLowerCase()}${t ? ` «${t.slice(0, 30)}»` : ''}`
  }
  const encima = (el) => {
    const r = el.getBoundingClientRect()
    const x = r.left + Math.min(r.width / 2, 40)
    const y = r.top + r.height / 2
    if (x < 0 || y < 0 || x >= W || y >= H) return false
    const a = document.elementFromPoint(x, y)
    return !!a && el.contains(a)
  }
  // Ventanas «GW»: un marco cuyo primer hijo es la franja de título (degradado + título en span.flex-1).
  // Incluye la ventana de la ruta (GwWindow del Layout) y los diálogos sobre el escritorio (listados…).
  const marcos = [...document.querySelectorAll('div')].filter((d) => {
    const f = d.firstElementChild
    return f && /bg-gradient-to-b/.test(f.className) && f.querySelector(':scope > span.flex-1') && vis(d)
  })
  const delLayout = document.querySelector('[data-gw-ventana]')?.parentElement?.parentElement ?? null
  const visibles = marcos.filter((m) => encima(m.firstElementChild))
  // La ventana activa: un diálogo visible por encima del escritorio, si lo hay; si no, la del Layout.
  const activa = visibles.find((m) => m !== delLayout) ?? (visibles.includes(delLayout) ? delLayout : null) ?? delLayout
  const res = { hayVentana: !!activa, titulo: '', texto: '', sinPermiso: false, cargando: false, vacia: false, fuera: [], tapados: [], scrollH: false }
  res.sinPermiso = /No tienes permiso para esta opción/.test(document.body.innerText)
  const caja = activa ? activa.lastElementChild : document.querySelector('.bg-\\[var\\(--gw-mdi\\)\\]')
  if (activa) res.titulo = (activa.firstElementChild.querySelector(':scope > span.flex-1')?.textContent ?? '').trim()
  const texto = (caja?.innerText ?? '').trim()
  res.texto = texto.slice(0, 120).replace(/\s+/g, ' ')
  res.cargando = /Cargando…|Cargando\.\.\./.test(texto) && texto.length < 400
  const contenido = caja ? caja.querySelectorAll('input,select,textarea,button,table,canvas,svg,img').length : 0
  res.vacia = texto.length < 3 && contenido === 0
  if (activa === delLayout && caja) res.scrollH = caja.scrollWidth > caja.clientWidth + 2

  // Rectángulo visible de un elemento: recortado por los contenedores que recortan (overflow ≠ visible).
  const recorte = (el, hasta) => {
    let r = el.getBoundingClientRect()
    let x0 = r.left, y0 = r.top, x1 = r.right, y1 = r.bottom
    for (let a = el.parentElement; a && a !== hasta && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a)
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue
      r = a.getBoundingClientRect()
      if (cs.overflowX !== 'visible') { x0 = Math.max(x0, r.left); x1 = Math.min(x1, r.right) }
      if (cs.overflowY !== 'visible') { y0 = Math.max(y0, r.top); y1 = Math.min(y1, r.bottom) }
    }
    return { x0, y0, x1, y1 }
  }
  const desplazableEntre = (el, hasta) => {
    for (let a = el.parentElement; a && a !== hasta && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a)
      if ((/auto|scroll/.test(cs.overflowX) && a.scrollWidth > a.clientWidth) || (/auto|scroll/.test(cs.overflowY) && a.scrollHeight > a.clientHeight)) return true
    }
    return false
  }
  const SEL = 'button, input:not([type=hidden]), select, textarea, a[href], [role=button], [role=tab]'
  const interactivos = [...document.querySelectorAll(SEL)].filter(vis)

  // a) Se salen de su ventana (marco GW) o de la ventana del navegador.
  for (const el of interactivos) {
    if (el.closest('[data-nexa]')) continue
    const r = el.getBoundingClientRect()
    const marco = marcos.find((m) => m.contains(el) && !marcos.some((o) => o !== m && m.contains(o) && o.contains(el)))
    if (marco && !desplazableEntre(el, marco)) {
      const rm = marco.getBoundingClientRect()
      if (r.right > rm.right + 1 || r.left < rm.left - 1 || r.bottom > rm.bottom + 1) {
        res.fuera.push(`${nombre(el)} se sale de «${(marco.firstElementChild.querySelector(':scope > span.flex-1')?.textContent ?? '').trim().slice(0, 30)}» (${Math.round(r.right - rm.right)}px dcha, ${Math.round(r.bottom - rm.bottom)}px abajo)`)
      }
    } else if (!marco && !desplazableEntre(el, null) && (r.right > W + 1 || r.bottom > H + 1 || r.left < -1)) {
      res.fuera.push(`${nombre(el)} fuera de la ventana del navegador`)
    }
    if (res.fuera.length >= 6) break
  }
  // b) Tapados por otro elemento (no cuenta un diálogo modal que cubre la ventana, ni lo que está
  //    desplazado fuera de la parte visible de su contenedor).
  for (const el of interactivos) {
    if (el.closest('[data-nexa]')) continue
    const v = recorte(el, null)
    const x = (v.x0 + v.x1) / 2
    const y = (v.y0 + v.y1) / 2
    if (v.x1 - v.x0 < 3 || v.y1 - v.y0 < 3 || x < 0 || y < 0 || x >= W || y >= H) continue
    const arriba = document.elementFromPoint(x, y)
    if (!arriba || el.contains(arriba) || arriba.contains(el)) continue
    if (arriba.closest('label')?.contains(el) || (el.id && arriba.closest(`label[for="${el.id}"]`))) continue
    if (arriba.closest('[data-nexa]')) continue
    let modal = false
    for (let a = arriba; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a)
      if (cs.position === 'fixed' || cs.position === 'absolute') {
        const ra = a.getBoundingClientRect()
        if (ra.width * ra.height > 0.25 * W * H || a.getAttribute('role') === 'dialog') { modal = true; break }
      }
    }
    if (modal) continue
    // Un marco GW distinto encima (diálogo sobre la ventana): normal.
    if (marcos.some((m) => m.contains(arriba) && !m.contains(el))) continue
    res.tapados.push(`${nombre(el)} tapado por ${nombre(arriba)}`)
    if (res.tapados.length >= 6) break
  }
  return res
}

// ---------- 5. Recorrido ----------
const filas = []
let n = 0
for (const r of aRecorrer) {
  n++
  actual = { ...r, ...nuevo() }
  const t0 = Date.now()
  try {
    if (RECARGA || n === 1) {
      await pagina.goto(URL_BASE + r.ruta, { waitUntil: 'domcontentloaded', timeout: 30000 })
    } else {
      // Navegación dentro de la aplicación (como al pulsar un menú): sin recargar.
      await pagina.evaluate((to) => {
        history.pushState({}, '', to)
        dispatchEvent(new PopStateEvent('popstate'))
      }, new URL(URL_BASE + r.ruta).pathname + (r.ruta.includes('?') ? '?' + r.ruta.split('?')[1] : ''))
    }
  } catch (e) {
    apuntar('js', `navegación: ${e.message.slice(0, 200)}`)
  }
  await pagina.waitForTimeout(250)
  await calma()
  let insp = await pagina.evaluate(inspeccionar)
  // «Cargando…» o ventana vacía: se da más tiempo antes de darla por mala.
  if (insp.cargando || insp.vacia) {
    await pagina.waitForTimeout(3000)
    await calma(4000)
    insp = await pagina.evaluate(inspeccionar)
  }
  const ms = Date.now() - t0
  const problemas = []
  const avisos = []
  if (!r.existe) problemas.push('el menú lleva a una ruta que no existe en App.tsx')
  if (actual.js.length) problemas.push(`JS: ${actual.js.join(' | ')}`)
  if (actual.red.length) problemas.push(`Supabase: ${actual.red.join(' | ')}`)
  if (actual.consola.length) problemas.push(`consola: ${actual.consola.join(' | ')}`)
  if (!insp.sinPermiso) {
    if (!insp.hayVentana) problemas.push('no se pinta la ventana')
    else if (!insp.titulo) problemas.push('la ventana no tiene título')
    if (insp.vacia) problemas.push('ventana en blanco')
    if (insp.cargando) problemas.push('«Cargando…» sin terminar')
    if (insp.fuera.length) problemas.push(`solape: ${insp.fuera.join(' | ')}`)
    if (insp.scrollH) problemas.push('solape: el contenido no cabe a lo ancho en la ventana (barra de desplazamiento horizontal)')
    if (insp.tapados.length) avisos.push(`tapados: ${insp.tapados.join(' | ')}`)
  }
  const titEsperado = WINDOW_TITLES.find((w) => r.ruta.split('?')[0] === w.prefix || r.ruta.split('?')[0].startsWith(w.prefix + '/'))?.title ?? ''
  const estado = problemas.length ? 'FALLO' : insp.sinPermiso ? 'sin permiso' : avisos.length ? 'aviso' : 'ok'
  let captura = ''
  if (estado === 'FALLO' || estado === 'aviso') {
    captura = `capturas/${String(n).padStart(3, '0')}-${r.ruta.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'raiz'}.png`
    await pagina.screenshot({ path: join(SALIDA, captura) }).catch(() => (captura = ''))
  }
  filas.push({ ...r, estado, titulo: insp.titulo || titEsperado, problemas, avisos, captura, ms })
  console.log(`${String(n).padStart(3)} ${estado.padEnd(11)} ${r.ruta}${problemas.length ? '  ← ' + problemas.join(' ; ').slice(0, 300) : ''}`)
  // Si la pantalla dejó un diálogo abierto o rompió la aplicación, se recarga para la siguiente.
  if (actual.js.length || !insp.hayVentana) await pagina.goto(URL_BASE + '/resumen', { waitUntil: 'domcontentloaded' }).then(() => calma()).catch(() => {})
}
actual = null
await navegador.close()

// ---------- 6. Informe ----------
const cuenta = (e) => filas.filter((f) => f.estado === e).length
const celda = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ')
const md = [
  `# Recorrido del ERP — ${USUARIO} — ${ANCHO}×${ALTO}`,
  '',
  `${new Date().toLocaleString('es-ES')} · ${URL_BASE} · ${filas.length} rutas: **${cuenta('ok')} ok**, **${cuenta('FALLO')} con fallo**, ${cuenta('aviso')} con aviso, ${cuenta('sin permiso')} sin permiso.`,
  '',
  '| # | Ruta | Menú | Ventana | Estado | Problemas / avisos | Captura | ms |',
  '|---|---|---|---|---|---|---|---|',
  ...filas.map((f, i) =>
    `| ${i + 1} | \`${celda(f.ruta)}\` | ${celda(f.menu)} | ${celda(f.titulo)} | ${f.estado} | ${celda([...f.problemas, ...f.avisos].join(' · '))} | ${f.captura ? `[ver](${f.captura})` : ''} | ${f.ms} |`),
  '',
].join('\n')
writeFileSync(join(SALIDA, 'informe.md'), md)
writeFileSync(join(SALIDA, 'informe.json'), JSON.stringify(filas, null, 2))
console.log(`\n${cuenta('ok')} ok · ${cuenta('FALLO')} fallo · ${cuenta('aviso')} aviso · ${cuenta('sin permiso')} sin permiso → ${join(SALIDA, 'informe.md')}`)
process.exit(cuenta('FALLO') ? 1 : 0)
