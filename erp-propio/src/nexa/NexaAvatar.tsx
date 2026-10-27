import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { NexaMotor, oscuridadDetras, type OpcionesMotor } from './visual/NexaMotor'
import { getNexaState, onNexaLevel, onNexaState } from './estado'

export interface NexaAvatarProps {
  /** Lado en px CSS (el lienzo es cuadrado). */
  tamano: number
  escala?: number
  particulas?: number
  formarAlIniciar?: boolean
  fpsMax?: number
  /** 'auto' mira el fondo que hay detrás del centro del avatar cada segundo. */
  contraste?: 'auto' | 'claro' | 'oscuro'
  glow?: number
  intensidad?: number
  onFps?: (fps: number, particulas: number) => void
  className?: string
}

/** Avatar de NEXA: solo partículas sobre un lienzo transparente que no captura el ratón. */
export const NexaAvatar = forwardRef<NexaMotor | null, NexaAvatarProps>(function NexaAvatar(
  { tamano, escala, particulas, formarAlIniciar, fpsMax, contraste = 'auto', glow, intensidad, onFps, className = '' },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const motorRef = useRef<NexaMotor | null>(null)

  useImperativeHandle(ref, () => motorRef.current as NexaMotor, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const opciones: OpcionesMotor = {
      referencia: `${import.meta.env.BASE_URL}nexa/nexa-referencia.png`,
      escala,
      particulas,
      formarAlIniciar,
      fpsMax,
    }
    const motor = new NexaMotor(canvas, opciones)
    motor.setEstado(getNexaState())
    motorRef.current = motor
    const quitarEstado = onNexaState((e) => motor.setEstado(e))
    const quitarNivel = onNexaLevel((n) => motor.setNivel(n))
    return () => {
      quitarEstado()
      quitarNivel()
      motor.destruir()
      motorRef.current = null
    }
    // El motor se crea una vez; el resto de props se aplican abajo sin recrearlo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    motorRef.current?.setApariencia({ glow, intensidad, escala })
  }, [glow, intensidad, escala])

  useEffect(() => {
    motorRef.current?.setParticulas(particulas)
  }, [particulas])

  useEffect(() => {
    if (onFps) motorRef.current?.onFps(onFps)
  }, [onFps])

  useEffect(() => {
    const motor = motorRef.current
    if (!motor) return
    if (contraste !== 'auto') {
      motor.setLuminosidadFondo(contraste === 'oscuro' ? 1 : 0)
      return
    }
    const medir = () => {
      const c = canvasRef.current
      if (!c) return
      const r = c.getBoundingClientRect()
      motor.setLuminosidadFondo(oscuridadDetras(r.left + r.width / 2, r.top + r.height / 2, [c]))
    }
    medir()
    const id = window.setInterval(medir, 1000)
    return () => window.clearInterval(id)
  }, [contraste])

  return <canvas ref={canvasRef} className={className} style={{ width: tamano, height: tamano, display: 'block', pointerEvents: 'none' }} />
})
