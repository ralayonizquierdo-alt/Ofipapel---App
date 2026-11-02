// Campo de clave con el ojo para verla u ocultarla (Luis, 01/11/2026).
import { useState, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { GwInput } from '../gw'

export function CampoClave(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [ver, setVer] = useState(false)
  return (
    <div className="relative flex">
      <GwInput {...props} type={ver ? 'text' : 'password'} className={`w-full pr-6 ${props.className ?? ''}`} />
      <button
        type="button"
        tabIndex={-1}
        className="absolute right-1 top-1/2 -translate-y-1/2 text-[#555] hover:text-black"
        onClick={() => setVer((v) => !v)}
        title={ver ? 'Ocultar la clave' : 'Ver la clave'}
        aria-label={ver ? 'Ocultar la clave' : 'Ver la clave'}
      >
        {ver ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  )
}
