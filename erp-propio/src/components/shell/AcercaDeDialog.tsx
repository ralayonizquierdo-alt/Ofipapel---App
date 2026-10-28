import { useEffect, useRef } from 'react'
import { GwWindow } from '../gw'

/**
 * «? → Acerca de Ofipapel ERP»: ventana pequeña al estilo del «Acerca de» de Windows clásico,
 * con el logo, el nombre, la versión (package.json) y el commit publicado si Netlify lo dio
 * al construir (COMMIT_REF). Se cierra con Aceptar, Esc o Intro.
 */
export function AcercaDeDialog({ onClose }: { onClose: () => void }) {
  const boton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    boton.current?.focus()
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onClose])

  const commit = __APP_COMMIT__ ? __APP_COMMIT__.slice(0, 7) : ''
  const fecha = new Date(__APP_BUILD_DATE__)
  const construida = Number.isNaN(fecha.getTime()) ? '' : fecha.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <GwWindow title="Acerca de Ofipapel ERP" onClose={onClose} className="w-[420px] max-w-[95vw]">
        <div role="dialog" aria-label="Acerca de Ofipapel ERP" className="flex flex-col gap-3 p-2 text-[12px]">
          <div className="flex items-start gap-3">
            <img src={`${import.meta.env.BASE_URL}marca/icono-64.png`} alt="" width={48} height={48} className="flex-none" draggable={false} />
            <div className="flex flex-col gap-0.5">
              <span className="text-[15px] font-bold">Ofipapel ERP</span>
              <span>Programa de gestión de Ofipapel</span>
              <span>
                Versión {__APP_VERSION__}
                {commit ? ` · commit ${commit}` : ''}
              </span>
              {construida && <span className="text-[#555]">Construida el {construida}</span>}
            </div>
          </div>
          <img src={`${import.meta.env.BASE_URL}marca/logo-ofipapel.png`} alt="Ofipapel — Suministros de Oficina" className="mx-auto w-[220px]" draggable={false} />
          <div className="border-t border-[var(--gw-border-light)] pt-2 text-[#444]">
            Réplica de GeminisWin en el navegador, con VeriFactu, contabilidad y conexión con la web.
          </div>
          <div className="flex justify-end">
            <button ref={boton} type="button" className="gw-btn w-[90px]" onClick={onClose}>
              Aceptar
            </button>
          </div>
        </div>
      </GwWindow>
    </div>
  )
}
