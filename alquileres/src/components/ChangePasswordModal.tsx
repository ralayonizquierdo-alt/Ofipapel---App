import { useState } from 'react'
import { X, Eye, EyeOff } from 'lucide-react'
import { getStoredHash, saveHash } from './LoginScreen'

async function hashPw(pw: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

interface Props { onClose: () => void }

export default function ChangePasswordModal({ onClose }: Props) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const h = await hashPw(current)
    if (h !== getStoredHash()) { setError('La contraseña actual no es correcta'); return }
    if (next.length < 6) { setError('La nueva contraseña debe tener al menos 6 caracteres'); return }
    if (next !== confirm) { setError('Las contraseñas nuevas no coinciden'); return }
    saveHash(await hashPw(next))
    setDone(true)
  }

  if (done) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl p-8 w-full max-w-sm flex flex-col items-center gap-4 shadow-xl">
        <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl"
          style={{ background: '#1976D220', border: '2px solid #1976D2' }}>✓</div>
        <p className="font-semibold text-slate-700">Contraseña actualizada</p>
        <button onClick={onClose}
          className="px-6 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: '#1976D2' }}>Cerrar</button>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-slate-800">Cambiar contraseña</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {[
            { label: 'Contraseña actual', val: current, set: setCurrent, show: showCurrent, toggle: () => setShowCurrent(s => !s) },
            { label: 'Nueva contraseña', val: next, set: setNext, show: showNext, toggle: () => setShowNext(s => !s) },
            { label: 'Repetir nueva contraseña', val: confirm, set: setConfirm, show: showConfirm, toggle: () => setShowConfirm(s => !s) },
          ].map(({ label, val, set, show, toggle }) => (
            <div key={label}>
              <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">{label}</label>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  value={val}
                  onChange={e => { set(e.target.value); setError('') }}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
                <button type="button" onClick={toggle}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
          ))}

          {error && <p className="text-red-500 text-xs">{error}</p>}

          <button type="submit"
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white mt-1"
            style={{ background: '#1976D2' }}>
            Guardar contraseña
          </button>
        </form>
      </div>
    </div>
  )
}
