import { useState, useEffect } from 'react'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  addMonths, subMonths, isSameDay, isToday,
  startOfWeek, endOfWeek,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, X, MapPin, Moon, Sun, Sunset, Building2, Stethoscope, Layers, Mic, MicOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { HospitalShift } from '../types'

const SHIFT_CONFIG = {
  morning:   { label: 'Mañana', icon: Sun,    color: '#e0a84a', bg: '#e0a84a15' },
  afternoon: { label: 'Tarde',  icon: Sunset, color: '#e0854a', bg: '#e0854a15' },
  night:     { label: 'Noche',  icon: Moon,   color: '#5b8dd9', bg: '#5b8dd915' },
  free:      { label: 'Libre',  icon: X,      color: '#6db56d', bg: '#6db56d15' },
} as const

type ShiftType = keyof typeof SHIFT_CONFIG
type WorkCenter = 'hospital' | 'centro_salud'

const TAB_CONFIG: Record<WorkCenter, { label: string; icon: typeof Building2; color: string }> = {
  hospital:     { label: 'Hospital',        icon: Building2,   color: '#5b8dd9' },
  centro_salud: { label: 'Centro de Salud', icon: Stethoscope, color: '#9b6bb5' },
}

export default function ShiftsPage() {
  const [activeTab, setActiveTab] = useState<WorkCenter>('hospital')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [shifts, setShifts] = useState<HospitalShift[]>([])
  const [selected, setSelected] = useState<Date>(new Date())
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<Partial<HospitalShift>>({
    shift_type: 'morning', location: '', floor: '',
  })
  const [listeningNotes, setListeningNotes] = useState(false)

  function startVoiceNotes() {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SR) return
    const rec = new SR()
    rec.lang = 'es-ES'
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const text = e.results[0][0].transcript
      setForm(p => ({ ...p, notes: (p.notes ? p.notes + ' ' : '') + text }))
      setListeningNotes(false)
    }
    rec.onend = () => setListeningNotes(false)
    rec.start()
    setListeningNotes(true)
  }

  useEffect(() => { loadShifts() }, [currentMonth])

  async function loadShifts() {
    const start = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
    const end = format(endOfMonth(currentMonth), 'yyyy-MM-dd')
    const { data } = await supabase
      .from('hospital_shifts')
      .select('*')
      .gte('date', start)
      .lte('date', end)
    if (data) setShifts(data)
  }

  async function saveShift() {
    if (!form.shift_type) return
    const payload = {
      shift_type: form.shift_type,
      location: form.location ?? '',
      floor: form.floor ?? '',
      notes: form.notes ?? '',
      work_center: activeTab,
      date: format(selected, 'yyyy-MM-dd'),
      ...(form.id ? { id: form.id } : {}),
    }
    if (form.id) {
      await supabase.from('hospital_shifts').update(payload).eq('id', form.id)
    } else {
      await supabase.from('hospital_shifts').insert(payload)
    }
    setShowModal(false)
    setForm({ shift_type: 'morning', location: '', floor: '' })
    loadShifts()
  }

  async function deleteShift(id: string) {
    await supabase.from('hospital_shifts').delete().eq('id', id)
    loadShifts()
  }

  const tabShifts = shifts.filter(s => (s.work_center ?? 'hospital') === activeTab)

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  const dayShift = (date: Date) =>
    tabShifts.find(s => s.date === format(date, 'yyyy-MM-dd'))

  return (
    <div className="animate-fadeIn max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-3xl font-bold text-gold-gradient capitalize">Turnos</h2>
          <p className="text-[#aaa] text-sm mt-1">
            {tabShifts.filter(s => s.shift_type !== 'free').length} turnos este mes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="btn-ghost p-2 rounded-lg">
            <ChevronLeft size={18} />
          </button>
          <span className="text-base text-[#ddd] font-semibold capitalize min-w-[140px] text-center">
            {format(currentMonth, 'MMMM yyyy', { locale: es })}
          </span>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="btn-ghost p-2 rounded-lg">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Pestañas */}
      <div className="flex gap-2 mb-6">
        {(Object.entries(TAB_CONFIG) as [WorkCenter, typeof TAB_CONFIG[WorkCenter]][]).map(([key, cfg]) => {
          const Icon = cfg.icon
          const isActive = activeTab === key
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl text-base font-semibold border transition-all ${
                isActive
                  ? 'border-transparent text-[#0a0a0a]'
                  : 'border-[#2a2a2a] text-[#aaa] hover:border-[#3a3a3a] hover:text-[#aaa]'
              }`}
              style={isActive ? { backgroundColor: cfg.color } : {}}
            >
              <Icon size={15} />
              {cfg.label}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Calendario */}
        <div className="lg:col-span-2 card">
          <div className="grid grid-cols-7 mb-2">
            {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
              <div key={d} className="text-center text-base text-[#aaa] font-bold py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map(day => {
              const shift = dayShift(day)
              const isSelected = isSameDay(day, selected)
              const isCurrentMon = format(day, 'MM') === format(currentMonth, 'MM')
              const cfg = shift ? SHIFT_CONFIG[shift.shift_type] : null
              const Icon = cfg?.icon
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelected(day)}
                  onDoubleClick={() => {
                    setSelected(day)
                    setForm({ shift_type: 'morning', location: '', floor: '', ...(shift ?? {}) })
                    setShowModal(true)
                  }}
                  className={`
                    flex flex-col items-center py-2 rounded-lg transition-all min-h-[76px] border
                    ${isSelected ? 'border-[#c9a96e]' : 'border-transparent'}
                    ${!isCurrentMon ? 'opacity-25' : ''}
                    ${cfg ? '' : 'hover:bg-[#1a1a1a]'}
                  `}
                  style={cfg ? { backgroundColor: cfg.bg, borderColor: isSelected ? '#c9a96e' : cfg.color + '30' } : {}}
                >
                  <span className={`text-lg font-bold w-10 h-10 flex items-center justify-center rounded-full
                    ${isToday(day) ? 'bg-[#c9a96e] text-[#0a0a0a]' : 'text-[#f0f0f0]'}
                  `}>
                    {format(day, 'd')}
                  </span>
                  {Icon && <Icon size={16} className="mt-0.5" style={{ color: cfg!.color }} />}
                </button>
              )
            })}
          </div>

          <div className="divider-gold my-4" />
          <div className="flex flex-wrap gap-4">
            {Object.entries(SHIFT_CONFIG).map(([key, cfg]) => {
              const Icon = cfg.icon
              return (
                <span key={key} className="flex items-center gap-1.5 text-sm text-[#bbb]">
                  <Icon size={14} style={{ color: cfg.color }} /> {cfg.label}
                </span>
              )
            })}
          </div>
        </div>

        {/* Panel día */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-2xl font-bold capitalize text-[#f0f0f0]">
              {format(selected, "EEE d MMM", { locale: es })}
            </h3>
            <button
              onClick={() => { setForm({ shift_type: 'morning', location: '', floor: '' }); setShowModal(true) }}
              className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5"
            >
              <Plus size={14} />
            </button>
          </div>

          {(() => {
            const shift = dayShift(selected)
            if (!shift) return <p className="text-[#999] text-base text-center py-8">Sin turno asignado</p>
            const cfg = SHIFT_CONFIG[shift.shift_type]
            const Icon = cfg.icon
            return (
              <div className="rounded-xl p-4 border" style={{ backgroundColor: cfg.bg, borderColor: cfg.color + '40' }}>
                <div className="flex items-center gap-3 mb-3">
                  <Icon size={26} style={{ color: cfg.color }} />
                  <span className="text-xl font-bold text-[#f0f0f0]">{cfg.label}</span>
                  <button onClick={() => deleteShift(shift.id)} className="ml-auto text-[#999] hover:text-[#e05252]">
                    <X size={16} />
                  </button>
                </div>
                {activeTab === 'hospital' && shift.floor && (
                  <p className="text-base text-[#bbb] flex items-center gap-1.5 mb-1">
                    <Layers size={14} /> Planta: {shift.floor}
                  </p>
                )}
                {shift.location && (
                  <p className="text-base text-[#bbb] flex items-center gap-1.5">
                    <MapPin size={14} /> {shift.location}
                  </p>
                )}
                {shift.notes && <p className="text-sm text-[#bbb] mt-2">{shift.notes}</p>}
                <button
                  onClick={() => { setForm(shift); setShowModal(true) }}
                  className="mt-3 text-sm text-[#bbb] hover:text-[#c9a96e] transition-colors"
                >
                  Editar
                </button>
              </div>
            )
          })()}

          <div className="divider-gold my-4" />
          <h4 className="text-sm text-[#aaa] uppercase tracking-wider mb-3">Este mes</h4>
          <div className="space-y-2">
            {Object.entries(SHIFT_CONFIG).map(([key, cfg]) => {
              const count = tabShifts.filter(s => s.shift_type === key).length
              const Icon = cfg.icon
              return (
                <div key={key} className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2 text-[#bbb]">
                    <Icon size={16} style={{ color: cfg.color }} /> {cfg.label}
                  </span>
                  <span className="font-bold text-lg" style={{ color: count > 0 ? cfg.color : '#555' }}>{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-[#3a3a3a] rounded-2xl w-full max-w-sm animate-fadeIn">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a2a]">
              <h3 className="font-display text-lg font-semibold text-[#e0e0e0]">
                {TAB_CONFIG[activeTab].label} — {format(selected, 'd MMM', { locale: es })}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-[#999] hover:text-[#bbb]">
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Tipo de turno */}
              <div>
                <label className="text-xs text-[#bbb] uppercase tracking-wider block mb-2">Turno</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(SHIFT_CONFIG) as ShiftType[]).map(key => {
                    const cfg = SHIFT_CONFIG[key]
                    const Icon = cfg.icon
                    return (
                      <button
                        key={key}
                        onClick={() => setForm(p => ({ ...p, shift_type: key }))}
                        className={`flex items-center gap-2 py-2.5 px-3 rounded-lg border text-sm transition-all ${
                          form.shift_type === key
                            ? 'border-transparent text-[#0a0a0a] font-semibold'
                            : 'border-[#2a2a2a] text-[#bbb]'
                        }`}
                        style={form.shift_type === key ? { backgroundColor: cfg.color } : {}}
                      >
                        <Icon size={14} /> {cfg.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Planta — solo hospital */}
              {activeTab === 'hospital' && (
                <div>
                  <label className="text-xs text-[#bbb] uppercase tracking-wider block mb-1.5">
                    Planta / Unidad
                  </label>
                  <input
                    type="text"
                    value={form.floor ?? ''}
                    onChange={e => setForm(p => ({ ...p, floor: e.target.value }))}
                    placeholder="Planta 3, UCI, Urgencias, Quirófano..."
                    className="w-full bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] placeholder-[#444] focus:border-[#c9a96e] focus:outline-none"
                  />
                </div>
              )}

              {/* Nombre del centro */}
              <div>
                <label className="text-xs text-[#bbb] uppercase tracking-wider block mb-1.5">
                  {activeTab === 'hospital' ? 'Hospital' : 'Centro de Salud'}
                </label>
                <input
                  type="text"
                  value={form.location ?? ''}
                  onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
                  placeholder={activeTab === 'hospital' ? 'Hospital Universitario...' : 'Centro de Salud Norte...'}
                  className="w-full bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] placeholder-[#444] focus:border-[#c9a96e] focus:outline-none"
                />
              </div>

              {/* Notas */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-[#bbb] uppercase tracking-wider">Notas</label>
                  <button onClick={startVoiceNotes}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors ${listeningNotes ? 'border-[#e05252] text-[#e05252]' : 'border-[#3a3a3a] text-[#999] hover:border-[#c9a96e] hover:text-[#c9a96e]'}`}>
                    {listeningNotes ? <MicOff size={12} /> : <Mic size={12} />}
                    {listeningNotes ? 'Escuchando…' : 'Voz'}
                  </button>
                </div>
                <textarea
                  value={form.notes ?? ''}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  className="w-full bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] placeholder-[#444] focus:border-[#c9a96e] focus:outline-none resize-none"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[#2a2a2a] flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="btn-ghost">Cancelar</button>
              <button onClick={saveShift} className="btn-primary">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
