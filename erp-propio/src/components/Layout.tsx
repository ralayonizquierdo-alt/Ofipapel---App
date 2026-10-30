import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { GwAppIcon, GwWindow } from './gw'
import { MenuBar } from './shell/MenuBar'
import { QuickBar, useLadoBarra } from './shell/QuickBar'
import { COLORES_DEFECTO } from '../lib/catalogoParametros'
import { colorDePantalla, type MapaColores } from '../lib/coloresPantallas'
import { useParametro, valorParametro } from '../lib/parametros'
import { dentroDeHorario, useMiAcceso } from '../lib/accesoEmpleado'
import { AvisoVersion } from './shell/AvisoVersion'
import { AvisoConformidad } from './shell/AvisoConformidad'
import { MENUS, esAccionUtilidad, isEnabled, windowTitle, type MenuEntry, type MenuItem } from './shell/menus'
import { ahoraTrabajo, ejercicioTrabajo, useSesionTrabajo, volverPeriodoEnCurso } from '../lib/sesionTrabajo'
import { NexaAsistente } from '../nexa/NexaAsistente'
import { AcercaDeDialog } from './shell/AcercaDeDialog'
import { EdicionHerramientas, IndicadorVerComo, lanzarEdicion } from './shell/EdicionHerramientas'
import { SinPermiso, usePermisos } from '../lib/PermisosContext'
import { comboDeEvento, instalarIntroAvanza, modalAlPulsar, normalizarAtajo } from './gw/teclado'

/** Atajos de menú que no gestiona Layout: los de edición los hace el navegador en el campo;
 *  Ctrl+F/H/O, EdicionHerramientas; Ctrl+P, GenerarPeticionHost. */
const ATAJOS_PROPIOS = new Set<string>(['undo', 'redo', 'cut', 'copy', 'paste', 'delete', 'selectAll', 'find', 'replace', 'cambiar-grupo', 'generar-peticion'])

// Ventana principal con el aspecto de GeminisWin: franja de título, barra de menús,
// barra lateral de accesos rápidos, área MDI gris con la ventana activa y barra de estado.
export function Layout() {
  const { session, signOut } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [empresa, setEmpresa] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const [ayuda, setAyuda] = useState<string | null>(null)
  const title = windowTitle(pathname)
  const [ladoBarra, setLadoBarra] = useLadoBarra()
  const { search } = useLocation()
  const [acercaDe, setAcercaDe] = useState(false)
  const sesion = useSesionTrabajo()
  const coloresSeccion = useParametro<boolean>('local.colores_seccion') !== false
  const mapaColores = useParametro<MapaColores | null>('apariencia.colores') ?? COLORES_DEFECTO
  const tamano = Number(useParametro<string>('local.tamano_letra') ?? '100') || 100
  const pantallaInicio = useParametro<string>('local.pantalla_inicio') ?? '/'
  const acceso = useMiAcceso()
  // Apariencia: tamaño de las pantallas (Parámetros Locales → Apariencia).
  useEffect(() => {
    document.body.style.zoom = tamano === 100 ? '' : String(tamano / 100)
  }, [tamano])
  // Inicio: la pantalla elegida, una vez por sesión del navegador.
  useEffect(() => {
    if (!pantallaInicio || pantallaInicio === '/' || pathname !== '/') return
    try {
      if (sessionStorage.getItem('erp.inicioHecho') === '1') return
      sessionStorage.setItem('erp.inicioHecho', '1')
    } catch {
      /* sin almacenamiento: se abre igualmente */
    }
    navigate(pantallaInicio)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pantallaInicio])
  // Horario de acceso del empleado (Control de Accesos): se vuelve a mirar cada minuto.
  const [, setMinuto] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setMinuto((m) => m + 1), 60000)
    return () => clearInterval(t)
  }, [])
  const fueraDeHorario = !dentroDeHorario(acceso)
  const salir = () => {
    if (valorParametro('local.confirmar_salir') !== false && !confirm('¿Salir del programa?')) return
    signOut()
  }
  // Consultando un periodo cerrado: los botones de alta, modificación y borrado se apagan (index.css).
  useEffect(() => {
    document.body.classList.toggle('gw-solo-consulta', sesion.consulta != null)
  }, [sesion.consulta])

  // Menú Ventana. El ERP enseña una sola ventana a la vez (la ruta), así que se lleva la lista
  // de ventanas abiertas en la sesión, en el orden en que se abrieron, cada una con la última
  // dirección visitada (vuelve al mismo registro). Recorrer (Ctrl+F1) pasa a la siguiente, como
  // Ctrl+F6 en las ventanas MDI; Ocultar la quita de la vista sin sacarla de la lista; Borrar
  // (y la X de la ventana) la cierra; Mostrar todo vuelve a enseñar la última ocultada.
  const [ventanas, setVentanas] = useState<{ title: string; to: string }[]>([])
  const [oculta, setOculta] = useState<string | null>(null)
  useEffect(() => {
    if (!title || pathname === '/caja/entrada' || pathname === '/caja/salida') return
    const to = pathname + search
    setVentanas((vs) => {
      const i = vs.findIndex((v) => v.title === title)
      if (i < 0) return [...vs, { title, to }].slice(-9)
      if (vs[i].to === to) return vs
      return vs.map((v, j) => (j === i ? { ...v, to } : v))
    })
    setOculta(null)
  }, [title, pathname, search])
  const ventanasRef = useRef(ventanas)
  ventanasRef.current = ventanas
  const actualRef = useRef({ title, oculta })
  actualRef.current = { title, oculta }

  function cerrarVentana(ocultar: boolean) {
    const { title: t } = actualRef.current
    if (!t) return
    const v = ventanasRef.current.find((x) => x.title === t)
    if (ocultar) setOculta(v?.to ?? null)
    else setVentanas((vs) => vs.filter((x) => x.title !== t))
    navigate('/')
  }
  function recorrer() {
    const vs = ventanasRef.current
    if (!vs.length) return
    const i = vs.findIndex((x) => x.title === actualRef.current.title)
    const sig = vs[(i + 1) % vs.length]
    if (sig && sig.title !== actualRef.current.title) navigate(sig.to)
  }
  function mostrarTodo() {
    const { oculta: o } = actualRef.current
    const vs = ventanasRef.current
    if (o) navigate(o)
    else if (!actualRef.current.title && vs.length) navigate(vs[vs.length - 1].to)
  }
  // Permisos por grupo de acceso: la ventana no se abre si se entra escribiendo la URL.
  const permisos = usePermisos()
  const permisosRef = useRef(permisos)
  permisosRef.current = permisos
  const dialogoSuelto = (pathname === '/caja/entrada' || pathname === '/caja/salida') && !permisos.cargando && permisos.puedeRuta(pathname)
  const contenido = permisos.cargando ? (
    <div className="p-4 text-[13px]">Cargando permisos…</div>
  ) : permisos.puedeRuta(pathname) ? (
    <Outlet />
  ) : (
    <SinPermiso />
  )

  // Al entrar (iniciar sesión o abrir la aplicación en «/») se abre el Panel de Control. Solo al
  // montar: cerrar la ventana deja el escritorio vacío y «/» ya no lo vuelve a abrir.
  useEffect(() => {
    if (pathname === '/') navigate('/resumen', { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    supabase
      .from('empresa')
      .select('nombre')
      .order('codigo')
      .limit(1)
      .then(({ data }) => setEmpresa(data?.[0]?.nombre ?? ''))
  }, [])

  function runMenu(i: MenuItem) {
    if (!permisosRef.current.puedeOpcion(i)) return
    if (i.to) navigate(i.to)
    else if (i.action === 'signout') salir()
    else if (i.action === 'close-window') cerrarVentana(false)
    else if (i.action === 'hide-window') cerrarVentana(true)
    else if (i.action === 'show-all') mostrarTodo()
    else if (i.action === 'cycle-window') recorrer()
    else if (i.action === 'about') setAcercaDe(true)
    // Compras → Generar Petición: lo abre GenerarPeticionHost (App.tsx), que también recoge CTRL+P.
    else if (i.action === 'generar-peticion') window.dispatchEvent(new Event('gw:generar-peticion'))
    // Utilidades (Cambio de Tienda/Fecha, Seleccionar Periodo, Copia…): los abre UtilidadesHost (App.tsx).
    else if (esAccionUtilidad(i.action)) window.dispatchEvent(new CustomEvent('gw:utilidad', { detail: i.action }))
    // Edición → Pegar/Encontrar/Reemplazar y Archivo → Cambiar Grupo de Acceso: EdicionHerramientas.
    else if (i.action === 'paste' || i.action === 'find' || i.action === 'replace' || i.action === 'cambiar-grupo') lanzarEdicion(i.action)
    else if (i.action) document.execCommand(i.action)
  }

  // Atajos de los menús (columna derecha de cada opción): TODOS los de menus.ts con `to` o
  // `action`, normalizados («CTRL+F12» = «Ctrl+F12», «Supr» = Delete). Si dos opciones comparten
  // atajo gana la primera del árbol (Alt+F6 = Gestor de Pedidos, como en GeminisWin). Respetan los
  // permisos (runMenu → puedeOpcion), no actúan con un diálogo modal abierto ni si la pantalla ya
  // ha usado la tecla (el TPV se queda F11, Ctrl+F11 y Ctrl+F12). Los de edición los hace el
  // navegador y Ctrl+F/H/O y Ctrl+P sus propios hosts (ver ATAJOS_PROPIOS).
  useEffect(() => {
    instalarIntroAvanza()
    const shortcuts = new Map<string, MenuItem>()
    const collect = (entries: MenuEntry[]) => {
      for (const e of entries) {
        if (e === 'sep') continue
        if (e.shortcut && isEnabled(e) && !(e.action && ATAJOS_PROPIOS.has(e.action))) {
          const k = normalizarAtajo(e.shortcut)
          if (!shortcuts.has(k)) shortcuts.set(k, e)
        }
        if (e.children) collect(e.children)
      }
    }
    MENUS.forEach((m) => collect(m.items))
    const onKey = (ev: KeyboardEvent) => {
      if (ev.defaultPrevented || ev.isComposing || modalAlPulsar(ev)) return
      const hit = shortcuts.get(comboDeEvento(ev))
      if (hit) {
        ev.preventDefault()
        runMenu(hit)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Barra de estado: al pasar el ratón por un botón con data-gw-estado («Modificar (F2)»), su ayuda.
  useEffect(() => {
    const encima = (ev: MouseEvent) => {
      const el = ev.target instanceof Element ? ev.target.closest<HTMLElement>('[data-gw-estado]') : null
      if (el) setHint(el.dataset.gwEstado ?? null)
    }
    const fuera = (ev: MouseEvent) => {
      const el = ev.target instanceof Element ? ev.target.closest('[data-gw-estado]') : null
      if (el && !(ev.relatedTarget instanceof Node && el.contains(ev.relatedTarget))) setHint(null)
    }
    document.addEventListener('mouseover', encima)
    document.addEventListener('mouseout', fuera)
    return () => {
      document.removeEventListener('mouseover', encima)
      document.removeEventListener('mouseout', fuera)
    }
  }, [])

  // Ayuda del campo con el foco en la barra de estado (como GeminisWin): los campos que la
  // tienen la declaran en data-gw-ayuda («Intro: buscar · Ctrl+Intro: lista ordenada»).
  // Y Ctrl+A fuera de un campo no selecciona toda la página: en un programa de escritorio no pasa.
  useEffect(() => {
    const enCampo = (el: EventTarget | null) =>
      el instanceof HTMLElement && (el.closest('input, textarea, [contenteditable=""], [contenteditable="true"]') != null)
    const alEntrar = (ev: FocusEvent) => {
      const el = ev.target instanceof HTMLElement ? ev.target.closest<HTMLElement>('[data-gw-ayuda]') : null
      setAyuda(el ? `${el.title ? `${el.title.split(' · ')[0]}: ` : ''}${el.dataset.gwAyuda}` : null)
    }
    const alSalir = () => setAyuda(null)
    const teclas = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'a' && !enCampo(ev.target)) {
        const sel = window.getSelection()
        if (!sel || !sel.anchorNode || !(sel.anchorNode.parentElement?.closest('.gw-seleccionable'))) ev.preventDefault()
      }
    }
    document.addEventListener('focusin', alEntrar)
    document.addEventListener('focusout', alSalir)
    document.addEventListener('keydown', teclas)
    return () => {
      document.removeEventListener('focusin', alEntrar)
      document.removeEventListener('focusout', alSalir)
      document.removeEventListener('keydown', teclas)
    }
  }, [])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--gw-face)]">
      {/* pr-[60px]: la esquina derecha de la cabecera (título + menús) es la de NEXA. */}
      <div className="flex h-[24px] flex-none items-center gap-1.5 bg-white pl-2 pr-[60px] text-[12px]">
        <GwAppIcon size={16} />
        <span className="truncate">
          Ofipapel ERP, Periodo: {ejercicioTrabajo().descripcion ?? `Periodo ${ejercicioTrabajo().anio}`} Empresa: {empresa}
        </span>
      </div>
      <AvisoVersion />
      <AvisoConformidad uid={session?.user.id ?? null} />
      {sesion.consulta && (
        <div className="flex flex-none items-center justify-center gap-3 bg-[#c42b1c] px-2 py-1 text-[13px] font-bold text-white">
          <span>
            CONSULTANDO PERIODO CERRADO: {sesion.consulta.descripcion ?? sesion.consulta.anio} ({fechaCorta(sesion.consulta.desde)} – {fechaCorta(sesion.consulta.hasta)}) · SOLO
            CONSULTA
          </span>
          <button type="button" className="gw-btn !h-[22px] font-bold !text-black" onClick={volverPeriodoEnCurso}>
            Volver al periodo en curso
          </button>
        </div>
      )}
      <MenuBar onRun={runMenu} onHover={setHint} activeWindow={title} windows={ventanas.map((v) => ({ label: v.title, to: v.to }))} />
      <div className={`flex min-h-0 flex-1 ${{ izquierda: 'flex-row', derecha: 'flex-row-reverse', arriba: 'flex-col', abajo: 'flex-col-reverse' }[ladoBarra]}`}>
        <QuickBar
          lado={ladoBarra}
          onLado={setLadoBarra}
          onHover={setHint}
          onRun={(q) => {
            if (q.to) navigate(q.to)
            else if (q.action === 'signout') salir()
            else if (q.action) runMenu({ label: q.label, action: q.action })
          }}
        />
        <div className="relative min-h-0 min-w-0 flex-1 bg-[var(--gw-mdi)]">
          <Watermark />
          {/* Entrada / Salida en caja: diálogo suelto sobre el escritorio, sin ventana detrás (como GeminisWin). */}
          {dialogoSuelto && contenido}
          {pathname !== '/' && !dialogoSuelto && (
            <GwWindow
              title={title}
              movible={false}
              principal
              color={coloresSeccion ? colorDePantalla(pathname, mapaColores) : null}
              onClose={() => cerrarVentana(false)}
              className="absolute inset-1 z-10 [&>div:last-child]:min-h-0 [&>div:last-child]:overflow-auto"
            >
              <div data-gw-ventana className="contents">
                {contenido}
              </div>
            </GwWindow>
          )}
          {/* NEXA: avatar flotante + panel de conversación, disponible en todas las pantallas */}
          <NexaAsistente />
        </div>
      </div>
      {acercaDe && <AcercaDeDialog onClose={() => setAcercaDe(false)} />}
      <EdicionHerramientas />
      {fueraDeHorario && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50">
          <div className="flex w-[460px] flex-col gap-3 border border-[#6f6f6f] bg-[var(--gw-face)] p-5 text-[15px] shadow-lg">
            <b className="text-[17px] text-[#a00]">Fuera de tu horario de acceso</b>
            <span>
              Tu horario es {acceso.horario?.dias.map((d) => 'LMXJVSD'[d - 1]).join(' ')} de {acceso.horario?.desde} a {acceso.horario?.hasta}. Si necesitas entrar, pídeselo a
              un administrador (Archivo → Parámetros → Control de Accesos).
            </span>
            <button type="button" className="gw-btn self-end" onClick={() => signOut()}>
              Salir
            </button>
          </div>
        </div>
      )}
      <StatusBar text={hint ?? ayuda ?? title} email={session?.user.email ?? ''} tienda={sesion.tienda} />
    </div>
  )
}

function Watermark() {
  return (
    <img
      src={`${import.meta.env.BASE_URL}marca/logo-ofipapel.png`}
      alt="Ofipapel — Suministros de Oficina"
      className="pointer-events-none absolute bottom-4 right-4 z-0 w-[260px] select-none opacity-90"
      draggable={false}
    />
  )
}

// Barra de estado: tienda y fecha de trabajo de la sesión (Utilidades → Cambio de Tienda / Fecha);
// la fecha y la hora salen resaltadas cuando no son las reales.
function StatusBar({ text, email, tienda }: { text: string; email: string; tienda: string | null }) {
  const { desfaseMs, soloFecha } = useSesionTrabajo()
  const cambiada = desfaseMs !== 0
  const [now, setNow] = useState(() => ahoraTrabajo())
  useEffect(() => {
    const t = setInterval(() => setNow(ahoraTrabajo()), 1000)
    return () => clearInterval(t)
  }, [desfaseMs])
  const panel = 'flex h-[16px] items-center border border-t-[#a0a0a0] border-l-[#a0a0a0] border-b-white border-r-white px-1.5'
  return (
    <div className="flex h-[22px] flex-none items-center gap-[3px] border-t border-[var(--gw-border-light)] bg-[var(--gw-face)] px-[3px] text-[11px]">
      <span className="min-w-0 flex-1 truncate px-1">{text}</span>
      <IndicadorVerComo />
      <span className={`${panel} max-w-[220px] truncate`}>{email}</span>
      <span className={`${panel} justify-center whitespace-nowrap`} title="Tienda / terminal de trabajo (Utilidades → Cambio de Tienda)">
        Tienda {tienda ?? '—'}
      </span>
      <span
        className={`${panel} w-[78px] justify-center tabular-nums ${cambiada ? 'bg-[#ffef8a] font-bold text-[#a00000]' : ''}`}
        title={cambiada ? 'Fecha de trabajo distinta de hoy (Utilidades → Cambio de Fecha)' : 'Fecha de trabajo'}
      >
        {now.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}
      </span>
      <span className={`${panel} w-[48px] justify-center`}>NUM</span>
      <span className={`${panel} w-[64px] justify-center tabular-nums ${cambiada && !soloFecha ? 'bg-[#ffef8a] font-bold text-[#a00000]' : ''}`}>
        {now.toLocaleTimeString('es-ES')}
      </span>
    </div>
  )
}

/** 'AAAA-MM-DD' → 'DD/MM/AAAA'. */
function fechaCorta(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
