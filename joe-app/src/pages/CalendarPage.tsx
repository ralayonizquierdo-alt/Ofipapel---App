import { useState, useEffect, useRef } from 'react'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameMonth, isSameDay, addMonths, subMonths, isToday,
  parseISO, startOfWeek, endOfWeek, startOfDay,
} from 'date-fns'
import { es } from 'date-fns/locale'
import {
  ChevronLeft, ChevronRight, Plus, Mic, MicOff, X, Bell,
  MapPin, Heart, Sun, Sunset, Moon, Building2, Stethoscope,
  BellRing, Briefcase, Layers,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { CalendarEvent, EventCategory, HospitalShift, LimonRecord } from '../types'

const CATEGORY_CONFIG: Record<EventCategory, { label: string; color: string; bg: string; heart?: boolean }> = {
  pareja:     { label: 'Rober ♥',    color: '#e8304a', bg: '#e8304a20', heart: true },
  empresa:    { label: 'Empresa',    color: '#9b6bb5', bg: '#9b6bb520' },
  zumba:      { label: 'Zumba',      color: '#e0854a', bg: '#e0854a20' },
  meditacion: { label: 'Meditación', color: '#6db59e', bg: '#6db59e20' },
  enologia:   { label: 'Enología',   color: '#c9a96e', bg: '#c9a96e20' },
  astrologia: { label: 'Astrología', color: '#b56db5', bg: '#b56db520' },
  personal:   { label: 'Personal',   color: '#888888', bg: '#88888820' },
}

const SHIFT_CONFIG = {
  morning:   { label: 'Mañana',  icon: Sun,    color: '#e0a84a', bg: '#e0a84a12' },
  afternoon: { label: 'Tarde',   icon: Sunset, color: '#e0854a', bg: '#e0854a12' },
  night:     { label: 'Noche',   icon: Moon,   color: '#5b8dd9', bg: '#5b8dd912' },
  free:      { label: 'Libre',   icon: X,      color: '#6db56d', bg: '#6db56d12' },
} as const

const CENTER_CONFIG = {
  hospital:     { label: 'Hospital',        icon: Building2,   color: '#5b8dd9' },
  centro_salud: { label: 'Centro de Salud', icon: Stethoscope, color: '#9b6bb5' },
} as const

interface BusinessTask { id: string; title: string; due_date?: string; priority: 'high'|'medium'|'low'; done: boolean }

const emptyEvent = (): Partial<CalendarEvent> => ({
  title: '', description: '', category: 'personal',
  is_all_day: false, reminder_minutes: 30, location: '',
})

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [shifts, setShifts] = useState<HospitalShift[]>([])
  const [limonAlerts, setLimonAlerts] = useState<LimonRecord[]>([])
  const [bizTasks, setBizTasks] = useState<BusinessTask[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editEvent, setEditEvent] = useState<Partial<CalendarEvent>>(emptyEvent())
  const [listening, setListening] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  useEffect(() => { loadAll() }, [currentMonth])

  async function loadAll() {
    const start = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
    const end   = format(endOfMonth(currentMonth),   'yyyy-MM-dd')

    const [evRes, shRes, liRes, bzRes] = await Promise.all([
      supabase.from('events').select('*')
        .gte('start_time', start).lte('start_time', end + 'T23:59:59').order('start_time'),
      supabase.from('hospital_shifts').select('*')
        .gte('date', start).lte('date', end),
      supabase.from('limon_records').select('*')
        .gte('next_date', start).lte('next_date', end),
      supabase.from('business_tasks').select('id,title,due_date,priority,done')
        .gte('due_date', start).lte('due_date', end).eq('done', false),
    ])
    if (evRes.data) setEvents(evRes.data)
    if (shRes.data) setShifts(shRes.data)
    if (liRes.data) setLimonAlerts(liRes.data)
    if (bzRes.data) setBizTasks(bzRes.data)
  }

  async function saveEvent() {
    if (!editEvent.title?.trim()) return
    setSaveError(null)
    const { id, created_at, ...rest } = editEvent as CalendarEvent
    const payload = {
      ...rest,
      ...(editEvent.id ? { id } : {}),
      start_time: editEvent.start_time || format(selectedDate, "yyyy-MM-dd'T'HH:mm:ss"),
    }
    const { error } = editEvent.id
      ? await supabase.from('events').update(payload).eq('id', editEvent.id)
      : await supabase.from('events').insert(payload)
    if (error) { setSaveError(error.message); return }
    setShowModal(false)
    setEditEvent(emptyEvent())
    loadAll()
  }

  async function deleteEvent(id: string) {
    await supabase.from('events').delete().eq('id', id)
    loadAll()
  }

  function openNewEvent(date: Date) {
    setSelectedDate(date)
    setEditEvent({
      ...emptyEvent(),
      start_time: format(date, "yyyy-MM-dd'T'09:00:00"),
      end_time:   format(date, "yyyy-MM-dd'T'10:00:00"),
    })
    setShowModal(true)
  }

  function startVoice() {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SR) return
    const rec = new SR()
    rec.lang = 'es-ES'
    rec.continuous = false
    rec.interimResults = false
    rec.onresult = (e: SpeechRecognitionEvent) => {
      setEditEvent(prev => ({ ...prev, title: e.results[0][0].transcript }))
      setListening(false)
    }
    rec.onend = () => setListening(false)
    rec.start()
    recognitionRef.current = rec
    setListening(true)
  }

  function stopVoice() { recognitionRef.current?.stop(); setListening(false) }

  const monthStart = startOfMonth(currentMonth)
  const monthEnd   = endOfMonth(currentMonth)
  const calStart   = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd     = endOfWeek(monthEnd,   { weekStartsOn: 1 })
  const days       = eachDayOfInterval({ start: calStart, end: calEnd })

  const dayEvents = (date: Date) => {
    const d = startOfDay(date)
    return events.filter(e => {
      const start = startOfDay(parseISO(e.start_time))
      const end   = e.end_time ? startOfDay(parseISO(e.end_time)) : start
      return d >= start && d <= end
    })
  }

  const dateStr = (d: Date) => format(d, 'yyyy-MM-dd')

  const dayShift   = (d: Date) => shifts.find(s => s.date === dateStr(d))
  const dayLimon   = (d: Date) => limonAlerts.filter(r => r.next_date === dateStr(d))
  const dayBiz     = (d: Date) => bizTasks.filter(t => t.due_date === dateStr(d))

  const selEvs   = dayEvents(selectedDate)
  const selShift = dayShift(selectedDate)
  const selLimon = dayLimon(selectedDate)
  const selBiz   = dayBiz(selectedDate)
  const totalItems = selEvs.length + (selShift ? 1 : 0) + selLimon.length + selBiz.length

  return (
    <div className="animate-fadeIn max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="font-display text-3xl font-bold text-gold-gradient capitalize">
            {format(currentMonth, 'MMMM yyyy', { locale: es })}
          </h2>
          <p className="text-[#aaa] text-sm mt-1">Agenda personal</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="btn-ghost p-2 rounded-lg">
            <ChevronLeft size={18} />
          </button>
          <button onClick={() => setCurrentMonth(new Date())} className="btn-ghost px-3 py-1.5 text-xs">
            Hoy
          </button>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="btn-ghost p-2 rounded-lg">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendario */}
        <div className="lg:col-span-2 card">
          <div className="grid grid-cols-7 mb-2">
            {['L','M','X','J','V','S','D'].map(d => (
              <div key={d} className="text-center text-base text-[#aaa] font-bold py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map(day => {
              const evs   = dayEvents(day)
              const shift = dayShift(day)
              const isSelected     = isSameDay(day, selectedDate)
              const isCurrentMonth = isSameMonth(day, currentMonth)
              const todayDay       = isToday(day)
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDate(day)}
                  onDoubleClick={() => openNewEvent(day)}
                  className={`
                    relative flex flex-col items-center py-2 px-1 rounded-lg transition-all duration-150 min-h-[80px]
                    ${isSelected ? 'bg-[#2a2a2a] border border-[#c9a96e]' : 'hover:bg-[#1a1a1a]'}
                    ${!isCurrentMonth ? 'opacity-30' : ''}
                  `}
                >
                  <span className={`text-lg font-bold w-10 h-10 flex items-center justify-center rounded-full mb-0.5
                    ${todayDay ? 'bg-[#c9a96e] text-[#0a0a0a]' : 'text-[#f0f0f0]'}
                  `}>
                    {format(day, 'd')}
                  </span>
                  <div className="flex flex-wrap justify-center gap-0.5">
                    {/* Indicador de turno */}
                    {shift && shift.shift_type !== 'free' && (
                      <div className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: SHIFT_CONFIG[shift.shift_type].color }} />
                    )}
                    {/* Puntos de eventos */}
                    {evs.slice(0, 2).map(e => (
                      CATEGORY_CONFIG[e.category]?.heart
                        ? <Heart key={e.id} size={8} fill="#e8304a" style={{ color: '#e8304a' }} />
                        : <div key={e.id} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CATEGORY_CONFIG[e.category]?.color }} />
                    ))}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Leyenda */}
          <div className="divider-gold my-4" />
          <div className="flex flex-wrap gap-3">
            {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
              <span key={key} className="flex items-center gap-1.5 text-base text-[#bbb]">
                {cfg.heart
                  ? <Heart size={13} fill="#e8304a" style={{ color: '#e8304a' }} />
                  : <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cfg.color }} />}
                {cfg.label}
              </span>
            ))}
            <span className="flex items-center gap-1.5 text-base text-[#bbb]">
              <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#e0a84a' }} /> Turno
            </span>
          </div>
        </div>

        {/* Tablón del día */}
        <div className="card flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-2xl font-bold capitalize text-[#f0f0f0]">
              {format(selectedDate, "EEE d MMM", { locale: es })}
            </h3>
            <button
              onClick={() => openNewEvent(selectedDate)}
              className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5"
            >
              <Plus size={14} /> Nuevo
            </button>
          </div>

          {totalItems === 0 && (
            <p className="text-[#999] text-base text-center py-8">Sin entradas para este día</p>
          )}

          {/* Turno */}
          {selShift && (() => {
            const sc  = SHIFT_CONFIG[selShift.shift_type]
            const cc  = CENTER_CONFIG[selShift.work_center ?? 'hospital']
            const SI  = sc.icon
            const CI  = cc.icon
            return (
              <div className="rounded-xl p-3 border" style={{ backgroundColor: sc.bg, borderColor: sc.color + '40' }}>
                <div className="flex items-center gap-2 mb-1">
                  <SI size={20} style={{ color: sc.color }} />
                  <span className="text-xl font-bold text-[#f0f0f0]">{sc.label}</span>
                  <span className="ml-auto flex items-center gap-1.5 text-base font-medium" style={{ color: cc.color }}>
                    <CI size={15} /> {cc.label}
                  </span>
                </div>
                {selShift.floor && (
                  <p className="text-base text-[#bbb] flex items-center gap-1.5 ml-6">
                    <Layers size={13} /> {selShift.floor}
                  </p>
                )}
                {selShift.location && (
                  <p className="text-base text-[#bbb] flex items-center gap-1.5 ml-6">
                    <MapPin size={13} /> {selShift.location}
                  </p>
                )}
              </div>
            )
          })()}

          {/* Avisos Limón */}
          {selLimon.length > 0 && (
            <div className="rounded-xl p-3 border border-[#6db56d40] bg-[#6db56d0a]">
              <p className="text-base font-bold text-[#6db56d] flex items-center gap-1.5 mb-2">
                <BellRing size={16} /> Limón 🍋
              </p>
              <div className="space-y-1.5">
                {selLimon.map(r => (
                  <p key={r.id} className="text-lg text-[#f0f0f0] ml-5 truncate">{r.title}</p>
                ))}
              </div>
            </div>
          )}

          {/* Tareas Empresa */}
          {selBiz.length > 0 && (
            <div className="rounded-xl p-3 border border-[#9b6bb540] bg-[#9b6bb50a]">
              <p className="text-base font-bold text-[#9b6bb5] flex items-center gap-1.5 mb-2">
                <Briefcase size={16} /> Empresa
              </p>
              <div className="space-y-1.5">
                {selBiz.map(t => (
                  <p key={t.id} className="text-lg text-[#f0f0f0] ml-5 truncate">{t.title}</p>
                ))}
              </div>
            </div>
          )}

          {/* Eventos de agenda */}
          {selEvs.length > 0 && (
            <div className="space-y-2">
              {selEvs.map(ev => {
                const cfg = CATEGORY_CONFIG[ev.category]
                return (
                  <div
                    key={ev.id}
                    className="rounded-lg p-3 border cursor-pointer hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: cfg.bg, borderColor: cfg.color + '40' }}
                    onClick={() => { setEditEvent(ev); setShowModal(true) }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-lg font-semibold text-[#f0f0f0] truncate flex items-center gap-1.5">
                          {cfg.heart && <Heart size={16} fill="#e8304a" style={{ color: '#e8304a', flexShrink: 0 }} />}
                          {ev.title}
                        </p>
                        {ev.location && (
                          <p className="text-base text-[#bbb] flex items-center gap-1 mt-0.5">
                            <MapPin size={13} /> {ev.location}
                          </p>
                        )}
                        {!ev.is_all_day && (
                          <p className="text-base font-medium mt-1" style={{ color: cfg.color }}>
                            {format(parseISO(ev.start_time), 'HH:mm')}
                            {ev.end_time && ` — ${format(parseISO(ev.end_time), 'HH:mm')}`}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); deleteEvent(ev.id) }}
                        className="text-[#999] hover:text-[#e05252] transition-colors flex-shrink-0"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal nuevo/editar evento */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-[#3a3a3a] rounded-2xl w-full max-w-md animate-fadeIn overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a2a] flex-shrink-0">
              <h3 className="font-display text-lg font-semibold text-[#e0e0e0]">
                {editEvent.id ? 'Editar evento' : 'Nuevo evento'}
              </h3>
              <button onClick={() => { setShowModal(false); setEditEvent(emptyEvent()); setSaveError(null) }} className="text-[#999] hover:text-[#bbb]">
                <X size={20} />
              </button>
            </div>

            {saveError && (
              <div className="mx-6 mt-4 px-4 py-3 rounded-lg bg-[#e0525215] border border-[#e05252]/40 text-sm text-[#e05252]">
                Error al guardar: {saveError}
              </div>
            )}

            <div className="px-6 py-5 space-y-4 overflow-y-auto">
              <div>
                <label className="text-xs text-[#bbb] uppercase tracking-wider block mb-1.5">Título</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editEvent.title ?? ''}
                    onChange={e => setEditEvent(p => ({ ...p, title: e.target.value }))}
                    placeholder="¿Qué tienes?"
                    className="flex-1 bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] placeholder-[#444] focus:border-[#c9a96e] focus:outline-none transition-colors"
                  />
                  <button
                    onClick={listening ? stopVoice : startVoice}
                    className={`px-3 py-2.5 rounded-lg border transition-colors ${listening ? 'border-[#e05252] text-[#e05252] bg-[#e0525210]' : 'border-[#3a3a3a] text-[#bbb] hover:border-[#c9a96e] hover:text-[#c9a96e]'}`}
                  >
                    {listening ? <MicOff size={16} /> : <Mic size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs text-[#bbb] uppercase tracking-wider block mb-1.5">Categoría</label>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => setEditEvent(p => ({ ...p, category: key as EventCategory }))}
                      className={`py-1.5 px-3 rounded-lg text-xs font-medium border transition-all ${
                        editEvent.category === key
                          ? 'text-[#0a0a0a] border-transparent'
                          : 'border-[#2a2a2a] text-[#bbb] hover:border-[#3a3a3a]'
                      }`}
                      style={editEvent.category === key ? { backgroundColor: cfg.color } : {}}
                    >
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fecha */}
              <div>
                <label className="text-xs text-[#bbb] uppercase tracking-wider block mb-1.5">Fecha</label>
                <input
                  type="date"
                  value={editEvent.start_time?.slice(0, 10) ?? ''}
                  onChange={e => {
                    const d = e.target.value
                    setEditEvent(p => ({
                      ...p,
                      start_time: d + 'T' + (p.start_time?.slice(11, 16) ?? '09:00') + ':00',
                      end_time:   d + 'T' + (p.end_time?.slice(11, 16)   ?? '10:00') + ':00',
                    }))
                  }}
                  className="w-full bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] focus:border-[#c9a96e] focus:outline-none transition-colors"
                />
              </div>

              {/* Horas inicio / fin */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#bbb] uppercase tracking-wider block mb-1.5">Hora inicio</label>
                  <input
                    type="time"
                    value={editEvent.start_time?.slice(11, 16) ?? ''}
                    onChange={e => {
                      const t = e.target.value
                      setEditEvent(p => ({
                        ...p,
                        start_time: (p.start_time?.slice(0, 10) ?? format(selectedDate, 'yyyy-MM-dd')) + 'T' + t + ':00',
                      }))
                    }}
                    className="w-full bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] focus:border-[#c9a96e] focus:outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#bbb] uppercase tracking-wider block mb-1.5">Hora fin</label>
                  <input
                    type="time"
                    value={editEvent.end_time?.slice(11, 16) ?? ''}
                    onChange={e => {
                      const t = e.target.value
                      setEditEvent(p => ({
                        ...p,
                        end_time: (p.end_time?.slice(0, 10) ?? format(selectedDate, 'yyyy-MM-dd')) + 'T' + t + ':00',
                      }))
                    }}
                    className="w-full bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] focus:border-[#c9a96e] focus:outline-none transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-[#bbb] uppercase tracking-wider block mb-1.5">Ubicación</label>
                <input
                  type="text"
                  value={editEvent.location ?? ''}
                  onChange={e => setEditEvent(p => ({ ...p, location: e.target.value }))}
                  placeholder="¿Dónde?"
                  className="w-full bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] placeholder-[#444] focus:border-[#c9a96e] focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="text-xs text-[#bbb] uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                  <Bell size={12} /> Recordatorio
                </label>
                <select
                  value={editEvent.reminder_minutes ?? 30}
                  onChange={e => setEditEvent(p => ({ ...p, reminder_minutes: Number(e.target.value) }))}
                  className="w-full bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] focus:border-[#c9a96e] focus:outline-none transition-colors"
                >
                  <option value={0}>Sin recordatorio</option>
                  <option value={10}>10 minutos antes</option>
                  <option value={30}>30 minutos antes</option>
                  <option value={60}>1 hora antes</option>
                  <option value={120}>2 horas antes</option>
                  <option value={1440}>1 día antes</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-[#bbb] uppercase tracking-wider block mb-1.5">Notas</label>
                <textarea
                  value={editEvent.description ?? ''}
                  onChange={e => setEditEvent(p => ({ ...p, description: e.target.value }))}
                  rows={2}
                  placeholder="Detalles adicionales..."
                  className="w-full bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] placeholder-[#444] focus:border-[#c9a96e] focus:outline-none transition-colors resize-none"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-[#2a2a2a] flex justify-end gap-2">
              <button onClick={() => { setShowModal(false); setEditEvent(emptyEvent()); setSaveError(null) }} className="btn-ghost">
                Cancelar
              </button>
              <button onClick={saveEvent} className="btn-primary">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
