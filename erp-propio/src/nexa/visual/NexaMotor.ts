// Motor visual de NEXA: una nube de partículas WebGL2 con transparencia real.
//
// No depende de React ni del resto del ERP: recibe un <canvas> y se controla con métodos
// sencillos (estado, nivel de voz, formar/disolver, contraste). El lienzo nunca captura el
// ratón (pointer-events: none): lo que hay detrás sigue siendo pulsable.

import { FRAGMENT, VERTEX } from './shaders'
import { cargarMapaDensidad, generarNube, particulasParaTamano, type MapaDensidad, type Nube } from './muestreo'

export type EstadoNexa = 'idle' | 'listening' | 'thinking' | 'speaking' | 'alert'

export interface OpcionesMotor {
  /** URL de la imagen de referencia (solo se lee, nunca se dibuja). */
  referencia: string
  /** Fracción del lienzo que ocupa el rostro (1 = de borde a borde). */
  escala?: number
  /** Forzar nº de partículas; por defecto según el tamaño del lienzo. */
  particulas?: number
  /** Empezar disperso y formarse al cargar. */
  formarAlIniciar?: boolean
  /** Límite de FPS (p. ej. 30 para el avatar pequeño en reposo). */
  fpsMax?: number
}

const INDICE_ESTADO: Record<Exclude<EstadoNexa, 'idle'>, number> = { listening: 0, thinking: 1, speaking: 2, alert: 3 }

// El mapa de densidad se comparte entre instancias (avatar pequeño y grande).
const mapas = new Map<string, Promise<MapaDensidad>>()

export class NexaMotor {
  private gl: WebGL2RenderingContext
  private prog: WebGLProgram
  private vao: WebGLVertexArrayObject
  private bufPos: WebGLBuffer
  private bufProps: WebGLBuffer
  private u: Record<string, WebGLUniformLocation | null> = {}
  private cantidad = 0
  private mapa: MapaDensidad | null = null
  private objetivoParticulas = 0
  private raf = 0
  private ultimo = 0
  private t0 = performance.now()
  private ladoCss = 0
  private observador: ResizeObserver

  private estado: EstadoNexa = 'idle'
  private pesos = [0, 0, 0, 0]
  private nivelExterno: number | null = null
  private nivel = 0
  private form = 1
  private formObjetivo = 1
  private formVelocidad = 1 / 3.2
  private parpadeo = 0
  private proximoParpadeo = 2.5
  private mirada = [0, 0]
  private miradaObjetivo = [0, 0]
  private proximaMirada = 3
  private luz = 0
  private luzObjetivo = 0
  private glow = 0.35
  private opacidad = 1
  private intensidad = 1
  private escala: number
  private fpsMax: number
  private fps = 0
  private cuentaFps = 0
  private relojFps = 0
  private alCambiarFps?: (fps: number, particulas: number) => void
  private destruido = false

  private canvas: HTMLCanvasElement
  private opciones: OpcionesMotor

  constructor(canvas: HTMLCanvasElement, opciones: OpcionesMotor) {
    this.canvas = canvas
    this.opciones = opciones
    this.escala = opciones.escala ?? 0.92
    this.fpsMax = opciones.fpsMax ?? 60
    canvas.style.pointerEvents = 'none'
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false })
    if (!gl) throw new Error('Este navegador no soporta WebGL2.')
    this.gl = gl
    this.prog = this.compilar()
    this.vao = gl.createVertexArray()!
    this.bufPos = gl.createBuffer()!
    this.bufProps = gl.createBuffer()!
    for (const n of ['u_time', 'u_canvas', 'u_scale', 'u_pointPx', 'u_states', 'u_level', 'u_form', 'u_blink', 'u_gaze', 'u_glow', 'u_light', 'u_opacity', 'u_boost'])
      this.u[n] = gl.getUniformLocation(this.prog, n)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    if (opciones.formarAlIniciar) {
      this.form = 0
      this.formObjetivo = 1
    }
    this.observador = new ResizeObserver(() => this.ajustarTamano())
    this.observador.observe(canvas)
    document.addEventListener('visibilitychange', this.alCambiarVisibilidad)
    void this.iniciar()
  }

  // ---------------- API pública ----------------

  setEstado(estado: EstadoNexa) {
    this.estado = estado
  }
  getEstado() {
    return this.estado
  }
  /** Nivel de voz 0..1 (audio real). `null` = ritmo de habla genérico. */
  setNivel(nivel: number | null) {
    this.nivelExterno = nivel
  }
  formar(segundos = 3.2) {
    this.formObjetivo = 1
    this.formVelocidad = 1 / segundos
  }
  disolver(segundos = 2.4) {
    this.formObjetivo = 0
    this.formVelocidad = 1 / segundos
  }
  /** 0 = fondo claro, 1 = fondo oscuro (transición suave). */
  setLuminosidadFondo(oscuridad: number) {
    this.luzObjetivo = Math.min(1, Math.max(0, oscuridad))
  }
  setApariencia(a: { glow?: number; opacidad?: number; intensidad?: number; escala?: number }) {
    if (a.glow != null) this.glow = a.glow
    if (a.opacidad != null) this.opacidad = a.opacidad
    if (a.intensidad != null) this.intensidad = a.intensidad
    if (a.escala != null) this.escala = a.escala
  }
  setParticulas(n: number | undefined) {
    this.opciones.particulas = n
    this.reconstruir()
  }
  onFps(cb: (fps: number, particulas: number) => void) {
    this.alCambiarFps = cb
  }
  destruir() {
    this.destruido = true
    cancelAnimationFrame(this.raf)
    this.observador.disconnect()
    document.removeEventListener('visibilitychange', this.alCambiarVisibilidad)
    const gl = this.gl
    gl.deleteBuffer(this.bufPos)
    gl.deleteBuffer(this.bufProps)
    gl.deleteVertexArray(this.vao)
    gl.deleteProgram(this.prog)
  }

  // ---------------- Interno ----------------

  private async iniciar() {
    const url = this.opciones.referencia
    if (!mapas.has(url)) mapas.set(url, cargarMapaDensidad(url))
    this.mapa = await mapas.get(url)!
    if (this.destruido) return
    this.ajustarTamano()
    this.reconstruir()
    this.ultimo = performance.now()
    this.raf = requestAnimationFrame(this.bucle)
  }

  private compilar() {
    const gl = this.gl
    const sh = (tipo: number, src: string) => {
      const s = gl.createShader(tipo)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('NEXA shader: ' + gl.getShaderInfoLog(s))
      return s
    }
    const p = gl.createProgram()!
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERTEX))
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAGMENT))
    gl.bindAttribLocation(p, 0, 'a_pos')
    gl.bindAttribLocation(p, 1, 'a_props')
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('NEXA programa: ' + gl.getProgramInfoLog(p))
    return p
  }

  private subir(nube: Nube) {
    const gl = this.gl
    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos)
    gl.bufferData(gl.ARRAY_BUFFER, nube.posiciones, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufProps)
    gl.bufferData(gl.ARRAY_BUFFER, nube.propiedades, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)
    this.cantidad = nube.cantidad
  }

  private reconstruir() {
    if (!this.mapa) return
    const objetivo = this.opciones.particulas ?? particulasParaTamano(this.ladoCss || 300)
    if (objetivo === this.objetivoParticulas && this.cantidad) return
    this.objetivoParticulas = objetivo
    this.subir(generarNube(this.mapa, objetivo))
  }

  private ajustarTamano() {
    const rect = this.canvas.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.max(1, Math.round(rect.width * dpr))
    const h = Math.max(1, Math.round(rect.height * dpr))
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
    this.ladoCss = Math.min(rect.width, rect.height)
    if (!this.opciones.particulas) this.reconstruir()
  }

  private alCambiarVisibilidad = () => {
    if (document.hidden) cancelAnimationFrame(this.raf)
    else if (!this.destruido) {
      this.ultimo = performance.now()
      this.raf = requestAnimationFrame(this.bucle)
    }
  }

  /** Ritmo de habla genérico: sílabas y pausas que no corresponden a ninguna frase. */
  private nivelGenerico(t: number) {
    const silabas = 0.5 + 0.5 * Math.sin(t * 13.0) * Math.sin(t * 4.1 + 1.3)
    const frase = 0.55 + 0.45 * Math.sin(t * 1.1 + Math.sin(t * 0.37) * 2)
    const pausa = Math.sin(t * 0.63) > -0.75 ? 1 : 0.15
    return Math.min(1, Math.max(0, silabas * frase * pausa * 1.25))
  }

  private bucle = (ahora: number) => {
    if (this.destruido) return
    this.raf = requestAnimationFrame(this.bucle)
    const minDt = 1000 / this.fpsMax
    if (ahora - this.ultimo < minDt - 1) return
    const dt = Math.min(0.1, (ahora - this.ultimo) / 1000)
    this.ultimo = ahora
    const t = (ahora - this.t0) / 1000
    this.actualizar(t, dt)
    this.dibujar(t)
    this.cuentaFps++
    if (ahora - this.relojFps > 1000) {
      this.fps = Math.round((this.cuentaFps * 1000) / (ahora - this.relojFps))
      this.cuentaFps = 0
      this.relojFps = ahora
      this.alCambiarFps?.(this.fps, this.cantidad)
    }
  }

  private actualizar(t: number, dt: number) {
    const suav = (actual: number, objetivo: number, vel: number) => actual + (objetivo - actual) * (1 - Math.exp(-dt * vel))
    for (const [nombre, i] of Object.entries(INDICE_ESTADO)) this.pesos[i] = suav(this.pesos[i], this.estado === nombre ? 1 : 0, 3.5)

    const objetivoNivel = this.nivelExterno ?? (this.estado === 'speaking' ? this.nivelGenerico(t) : 0.25 + 0.15 * Math.sin(t * 2))
    this.nivel = suav(this.nivel, objetivoNivel, 18)

    if (this.form !== this.formObjetivo) {
      const paso = dt * this.formVelocidad
      this.form = this.formObjetivo > this.form ? Math.min(this.formObjetivo, this.form + paso) : Math.max(this.formObjetivo, this.form - paso)
    }

    // Parpadeo: cierre y apertura en ~0,2 s cada 3-6 s (algo menos al pensar)
    this.proximoParpadeo -= dt
    if (this.proximoParpadeo <= 0) {
      this.parpadeo = 1
      this.proximoParpadeo = 3 + Math.random() * 3 + (this.estado === 'thinking' ? 2 : 0)
    }
    if (this.parpadeo > 0) this.parpadeo = Math.max(0, this.parpadeo - dt / 0.22)
    // Mirada: pequeños movimientos de vez en cuando
    this.proximaMirada -= dt
    if (this.proximaMirada <= 0) {
      const amp = this.estado === 'thinking' ? 1 : 0.5
      this.miradaObjetivo = [(Math.random() * 2 - 1) * amp, (Math.random() * 2 - 1) * amp * 0.5]
      if (Math.random() < 0.4) this.miradaObjetivo = [0, 0]
      this.proximaMirada = 1.5 + Math.random() * 3
    }
    this.mirada = [suav(this.mirada[0], this.miradaObjetivo[0], 10), suav(this.mirada[1], this.miradaObjetivo[1], 10)]
    this.luz = suav(this.luz, this.luzObjetivo, 3)
  }

  private dibujar(t: number) {
    const gl = this.gl
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    if (!this.cantidad) return
    gl.useProgram(this.prog)
    const lado = Math.min(this.canvas.width, this.canvas.height)
    // Tamaño del punto proporcional al lado (la nube ya agranda los puntos cuando hay menos)
    const pointPx = Math.max(1.2, lado * 0.0075)
    // Párpado: curva rápida al cerrar y algo más lenta al abrir
    const p = this.parpadeo
    const blink = p > 0.5 ? (1 - p) * 2 : p * 2
    gl.uniform1f(this.u.u_time, t)
    gl.uniform2f(this.u.u_canvas, this.canvas.width, this.canvas.height)
    gl.uniform1f(this.u.u_scale, this.escala)
    gl.uniform1f(this.u.u_pointPx, pointPx)
    gl.uniform4f(this.u.u_states, this.pesos[0], this.pesos[1], this.pesos[2], this.pesos[3])
    gl.uniform1f(this.u.u_level, this.nivel)
    gl.uniform1f(this.u.u_form, this.form)
    gl.uniform1f(this.u.u_blink, blink)
    gl.uniform2f(this.u.u_gaze, this.mirada[0], this.mirada[1])
    gl.uniform1f(this.u.u_glow, this.glow + 0.25 * this.luz)
    gl.uniform1f(this.u.u_light, this.luz)
    gl.uniform1f(this.u.u_opacity, this.opacidad)
    gl.uniform1f(this.u.u_boost, this.intensidad)
    gl.bindVertexArray(this.vao)
    gl.drawArrays(gl.POINTS, 0, this.cantidad)
    gl.bindVertexArray(null)
  }
}

/**
 * Oscuridad 0..1 de lo que hay detrás de un punto de la pantalla: busca el primer elemento con
 * fondo opaco bajo (x, y), ignorando los indicados (el propio lienzo de NEXA).
 */
export function oscuridadDetras(x: number, y: number, ignorar: Element[] = []): number {
  for (const el of document.elementsFromPoint(x, y)) {
    if (ignorar.includes(el)) continue
    const bg = getComputedStyle(el).backgroundColor
    const m = bg.match(/rgba?\(([^)]+)\)/)
    if (!m) continue
    const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number)
    if (a < 0.5) continue
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    return lum < 0.45 ? 1 : lum < 0.6 ? 0.5 : 0
  }
  return 0
}
