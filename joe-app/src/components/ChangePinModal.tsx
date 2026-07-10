import { useState } from 'react'
import { X, Delete } from 'lucide-react'
import { hashPin, getCurrentPinHash, PIN_STORAGE_KEY } from './PinScreen'

type Step = 'current' | 'new' | 'confirm'

const STEP_LABELS: Record<Step, string> = {
  current: 'introduce el PIN actual',
  new: 'elige un PIN nuevo',
  confirm: 'repite el PIN nuevo',
}

interface Props { onClose: () => void }

export default function ChangePinModal({ onClose }: Props) {
  const [step, setStep] = useState<Step>('current')
  const [pin, setPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const [done, setDone] = useState(false)

  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  function press(d: string) {
    if (pin.length >= 4) return
    const next = pin + d
    setPin(next)
    setError('')
    if (next.length === 4) handleComplete(next)
  }

  function del() { setPin(p => p.slice(0, -1)); setError('') }

  function triggerError(msg: string) {
    setError(msg)
    setShake(true)
    setTimeout(() => { setPin(''); setShake(false) }, 600)
  }

  function resetPin() {
    setStep('new')
    setPin('')
    setError('')
  }

  async function handleComplete(code: string) {
    if (step === 'current') {
      const h = await hashPin(code)
      if (h !== (getCurrentPinHash() ?? '')) { triggerError('PIN incorrecto'); return }
      setStep('new')
      setPin('')
    } else if (step === 'new') {
      setNewPin(code)
      setStep('confirm')
      setPin('')
    } else {
      if (code !== newPin) { triggerError('Los PINs no coinciden'); return }
      const h = await hashPin(code)
      try { localStorage.setItem(PIN_STORAGE_KEY, h) } catch {}
      setDone(true)
    }
  }

  if (done) return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: '#000000cc' }}>
      <div className="flex flex-col items-center gap-4 p-8 rounded-3xl" style={{ background: '#141414', border: '1px solid #2a2a2a' }}>
        <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl"
          style={{ background: '#c9a96e22', border: '2px solid #c9a96e' }}>✓</div>
        <p className="font-semibold" style={{ color: '#c9a96e' }}>PIN actualizado</p>
        <button onClick={onClose} className="px-6 py-2 rounded-xl text-sm font-medium"
          style={{ background: '#c9a96e', color: '#0a0a0a' }}>Cerrar</button>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: '#000000cc' }}>
      <div className="flex flex-col items-center p-8 rounded-3xl relative" style={{ background: '#141414', border: '1px solid #2a2a2a', minWidth: 300 }}>
        <button onClick={onClose} className="absolute top-4 right-4" style={{ color: '#555' }}><X size={18} /></button>

        <p className="text-xs tracking-[0.25em] uppercase mb-6" style={{ color: '#555' }}>{STEP_LABELS[step]}</p>

        {/* Dots */}
        <div className={`flex gap-4 mb-2 ${shake ? 'animate-shake' : ''}`}>
          {[0,1,2,3].map(i => (
            <div key={i} className="w-3.5 h-3.5 rounded-full border-2 transition-all duration-150"
              style={{
                borderColor: error ? '#e05252' : '#c9a96e',
                backgroundColor: i < pin.length ? (error ? '#e05252' : '#c9a96e') : 'transparent',
              }} />
          ))}
        </div>
        {error && (
          <div className="flex flex-col items-center mb-3 mt-1 gap-1">
            <p className="text-xs" style={{ color: '#e05252' }}>{error}</p>
            {step === 'current' && (
              <button onClick={resetPin} className="text-xs underline" style={{ color: '#c9a96e88' }}>
                ¿No recuerdas tu PIN? Restablécelo
              </button>
            )}
          </div>
        )}
        {!error && <div className="mb-3 h-4" />}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-2.5">
          {keys.map((k, i) => {
            if (k === '') return <div key={i} />
            if (k === '⌫') return (
              <button key={i} onClick={del}
                className="w-16 h-16 rounded-xl flex items-center justify-center active:scale-95 transition-all"
                style={{ background: '#1e1e1e', color: '#666' }}>
                <Delete size={18} />
              </button>
            )
            return (
              <button key={i} onClick={() => press(k)}
                className="w-16 h-16 rounded-xl text-xl font-semibold active:scale-95 transition-all"
                style={{ background: '#1e1e1e', color: '#e0e0e0', border: '1px solid #2a2a2a' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#282828')}
                onMouseLeave={e => (e.currentTarget.style.background = '#1e1e1e')}>
                {k}
              </button>
            )
          })}
        </div>

        {/* Paso indicador */}
        <div className="flex gap-1.5 mt-5">
          {(['current','new','confirm'] as Step[]).map(s => (
            <div key={s} className="w-1.5 h-1.5 rounded-full transition-all"
              style={{ background: s === step ? '#c9a96e' : '#2a2a2a' }} />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)}
          40%{transform:translateX(6px)} 60%{transform:translateX(-6px)} 80%{transform:translateX(6px)}
        }
        .animate-shake { animation: shake 0.5s ease-in-out; }
      `}</style>
    </div>
  )
}
